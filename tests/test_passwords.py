import pytest

pytestmark = pytest.mark.real_scrypt
from all_an.auth.passwords import hash_password, verify_password

# Written by Node's crypto.scrypt, exactly as the original server did. If this stops verifying,
# every account created before the rewrite has been locked out.
NODE_HASH = (
    "scrypt$16384$8$1$rYXvIGxI4ayfib2N3Z4Reg$"
    "bhoK-b9VKngSZtxlbKczGi-DFes0LxQ-FbEm9WgcI5PfQvLYx_xxXrweI-TRdFchSPpekmNPxDV0v5TWAlutHA"
)


def test_round_trips():
    stored = hash_password("correct horse battery")

    assert stored.startswith("scrypt$16384$8$1$")
    assert verify_password("correct horse battery", stored)
    assert not verify_password("correct horse batterz", stored)


def test_two_hashes_of_one_password_differ():
    assert hash_password("same") != hash_password("same")


def test_verifies_a_hash_written_by_the_node_version():
    assert verify_password("pässword with spaces", NODE_HASH)
    assert not verify_password("password with spaces", NODE_HASH)


def test_rejects_malformed_hashes():
    for stored in (
        "not-a-hash",
        "bcrypt$1$2$3$4$5",
        "scrypt$abc$8$1$AAAA$AAAA",
        "scrypt$16384$8$1$$AAAA",
        "scrypt$16384$8$1$AAAA$",
        "scrypt$16385$8$1$AAAA$AAAA",  # not a power of two
        "",
    ):
        assert not verify_password("x", stored), stored


def test_refuses_hashes_that_ask_for_absurd_memory():
    assert not verify_password("x", f"scrypt${1 << 30}$8$1$AAAA$AAAA")
