package main

// Accounts: Argon2id password hashes, and sessions that are a random token in an HttpOnly cookie.
// The database keeps only the SHA-256 of the token, so a leaked copy of it cannot be used to sign in.

import "core:crypto"
import "core:crypto/argon2id"
import "core:crypto/hash"
import "core:fmt"
import "core:strconv"
import "core:strings"
import "core:sync"

import http "deps:odin-http"

SESSION_COOKIE :: "session"
SESSION_SECONDS :: 60 * 60 * 24 * 30
MIN_PASSWORD_RUNES :: 10
MAX_PASSWORD_BYTES :: 256
KEY_BYTES :: 32
SALT_BYTES :: 16
// Refuse to allocate more than this for a stored hash's memory cost.
MAX_MEMORY_KIB :: 128 * 1024

// OWASP's second Argon2id option: about 19 MiB and two passes, one lane.
HASH_PARAMS := argon2id.Parameters {
	memory_size = 19 * 1024,
	passes      = 2,
	parallelism = 1,
}

// Hashing is memory-hungry, so one at a time: a burst of logins queues instead of exhausting RAM.
hash_mutex: sync.Mutex

// What an unknown email is checked against, so "no such account" takes as long as "wrong password".
dummy_hash: string

Account :: struct {
	id, email: string,
}

hex_encode :: proc(raw: []u8, allocator := context.temp_allocator) -> string {
	out := make([]u8, len(raw) * 2, allocator)
	for b, i in raw {
		out[i * 2] = HEX[b >> 4]
		out[i * 2 + 1] = HEX[b & 0xf]
	}
	return string(out)
}

hex_decode :: proc(s: string, out: []u8) -> bool {
	if len(s) != len(out) * 2 {
		return false
	}
	nibble :: proc(c: u8) -> (v: u8, ok: bool) {
		switch c {
		case '0' ..= '9':
			return c - '0', true
		case 'a' ..= 'f':
			return c - 'a' + 10, true
		}
		return 0, false
	}
	for i in 0 ..< len(out) {
		hi := nibble(s[i * 2]) or_return
		lo := nibble(s[i * 2 + 1]) or_return
		out[i] = hi << 4 | lo
	}
	return true
}

@(private = "file")
derive_key :: proc(password: string, salt: []u8, params: argon2id.Parameters) -> (key: [KEY_BYTES]u8, ok: bool) {
	sync.mutex_lock(&hash_mutex)
	defer sync.mutex_unlock(&hash_mutex)

	p := params
	err := argon2id.derive(&p, transmute([]u8)password, salt, key[:])
	return key, err == nil
}

// "argon2id$memory$passes$parallelism$salt$key", ready to store.
hash_password :: proc(password: string, allocator := context.temp_allocator) -> (encoded: string, ok: bool) {
	salt: [SALT_BYTES]u8
	crypto.rand_bytes(salt[:])

	key := derive_key(password, salt[:], HASH_PARAMS) or_return
	return fmt.aprintf(
			"argon2id$%d$%d$%d$%s$%s",
			HASH_PARAMS.memory_size,
			HASH_PARAMS.passes,
			HASH_PARAMS.parallelism,
			hex_encode(salt[:]),
			hex_encode(key[:]),
			allocator = allocator,
		),
		true
}

verify_password :: proc(password, encoded: string) -> bool {
	parts := strings.split(encoded, "$", context.temp_allocator)
	if len(parts) != 6 || parts[0] != "argon2id" {
		return false
	}

	memory, m_ok := strconv.parse_uint(parts[1], 10)
	passes, t_ok := strconv.parse_uint(parts[2], 10)
	lanes, p_ok := strconv.parse_uint(parts[3], 10)
	if !m_ok || !t_ok || !p_ok || memory == 0 || memory > MAX_MEMORY_KIB || passes == 0 || passes > 16 || lanes == 0 || lanes > 8 {
		return false
	}

	salt: [SALT_BYTES]u8
	expected: [KEY_BYTES]u8
	if !hex_decode(parts[4], salt[:]) || !hex_decode(parts[5], expected[:]) {
		return false
	}

	params := argon2id.Parameters {
		memory_size = u32(memory),
		passes      = u32(passes),
		parallelism = u32(lanes),
	}
	key, ok := derive_key(password, salt[:], params)
	return ok && crypto.compare_constant_time(key[:], expected[:]) == 1
}

// Costs one hash, so the first sign-in does not pay for it.
auth_init :: proc() {
	h, ok := hash_password("a password nobody has", context.allocator)
	assert(ok, "cannot hash a password")
	dummy_hash = h
}

// --- sessions ----------------------------------------------------------------------------------

session_token_hash :: proc(token: string) -> string {
	digest := hash.hash_string(.SHA256, token, context.temp_allocator)
	return hex_encode(digest)
}

@(private = "file")
new_session_token :: proc() -> string {
	raw: [32]u8
	crypto.rand_bytes(raw[:])
	return hex_encode(raw[:])
}

@(private = "file")
valid_session_token :: proc(token: string) -> bool {
	if len(token) != 64 {
		return false
	}
	for c in transmute([]u8)token {
		switch c {
		case '0' ..= '9', 'a' ..= 'f':
		case:
			return false
		}
	}
	return true
}

// The signed-in account for a request, if its cookie names a live session.
current_user :: proc(req: ^http.Request) -> (account: Account, ok: bool) {
	token, found := http.request_cookie_get(req, SESSION_COOKIE)
	if !found || !valid_session_token(token) {
		return
	}
	id, email, exists := session_lookup(session_token_hash(token))
	if !exists {
		return
	}
	return Account{id, email}, true
}

start_session :: proc(res: ^http.Response, user_id: string) -> bool {
	token := new_session_token()
	if !session_create(session_token_hash(token), user_id, SESSION_SECONDS) {
		return false
	}
	append(
		&res.cookies,
		http.Cookie {
			name = SESSION_COOKIE,
			value = token,
			path = "/",
			http_only = true,
			same_site = .Lax,
			secure = config.secure_cookies,
			max_age_secs = SESSION_SECONDS,
		},
	)
	return true
}

end_session :: proc(req: ^http.Request, res: ^http.Response) {
	if token, found := http.request_cookie_get(req, SESSION_COOKIE); found && valid_session_token(token) {
		session_delete(session_token_hash(token))
	}
	append(
		&res.cookies,
		http.Cookie {
			name = SESSION_COOKIE,
			value = "",
			path = "/",
			http_only = true,
			same_site = .Lax,
			secure = config.secure_cookies,
			max_age_secs = 0,
		},
	)
}

// Lower-cased and trimmed, so one address is one account however it was typed.
normalise_email :: proc(s: string) -> string {
	return strings.to_lower(strings.trim_space(s), context.temp_allocator)
}
