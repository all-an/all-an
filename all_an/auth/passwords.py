"""Password hashing: scrypt, stored as `scrypt$N$r$p$salt$hash` with salt and hash in unpadded
base64url.

Byte-for-byte the format the Node and Rust versions wrote, so every existing account keeps
working across the rewrite. The parameters are read back out of the stored string, which is what
lets the cost be raised later without invalidating anyone.
"""

import base64
import hashlib
import hmac
import os

N = 16_384  # CPU/memory cost: about 16 MB per hash.
R = 8
P = 1
KEY_LENGTH = 64
SALT_LENGTH = 16

# OpenSSL refuses scrypt above its default memory cap; this is comfortably over what N=16384 needs.
MAX_MEM = 64 * 1024 * 1024

# A hash stored by this app asks for a modest amount of memory. One that asks for gigabytes was not
# written by us, and verifying it would hand its author a denial of service.
MAX_N = 1 << 16


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def hash_password(password: str) -> str:
    salt = os.urandom(SALT_LENGTH)
    derived = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=N, r=R, p=P, maxmem=MAX_MEM, dklen=KEY_LENGTH
    )

    return f"scrypt${N}${R}${P}${_b64(salt)}${_b64(derived)}"


def verify_password(password: str, stored: str) -> bool:
    parts = stored.split("$")

    if len(parts) != 6 or parts[0] != "scrypt":
        return False

    try:
        n, r, p = int(parts[1]), int(parts[2]), int(parts[3])
        salt, expected = _unb64(parts[4]), _unb64(parts[5])
    except ValueError:
        return False

    if n < 2 or n & (n - 1) or n > MAX_N or r < 1 or p < 1 or r > 32 or p > 16:
        return False

    if not salt or not expected:
        return False

    try:
        derived = hashlib.scrypt(
            password.encode("utf-8"), salt=salt, n=n, r=r, p=p, maxmem=MAX_MEM, dklen=len(expected)
        )
    except (ValueError, MemoryError):
        return False

    return hmac.compare_digest(derived, expected)
