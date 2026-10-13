package main

// What every request needs: the CSRF token, the caller's address and reading a form post.
//
// There are no accounts. The only thing a visitor posts to the server is a message, and that is
// protected by a double-submit token: a random value lives in an HttpOnly cookie, the same value is
// rendered into the form, and the post must carry both. A page on another site can make the browser
// send the cookie but cannot read it to copy the value into the form.

import "core:crypto"
import "core:net"
import "core:strings"

import http "deps:odin-http"

CSRF_COOKIE :: "csrf"
MAX_FORM_BYTES :: 16 * 1024
MAX_IP_LENGTH :: 45 // the longest IPv6 text form, which is also what the column holds

HEX := "0123456789abcdef"

random_token :: proc(allocator := context.temp_allocator) -> string {
	raw: [16]u8
	crypto.rand_bytes(raw[:])
	out := make([]u8, 32, allocator)
	for b, i in raw {
		out[i * 2] = HEX[b >> 4]
		out[i * 2 + 1] = HEX[b & 0xf]
	}
	return string(out)
}

is_token :: proc(s: string) -> bool {
	if len(s) != 32 {
		return false
	}
	for c in transmute([]u8)s {
		switch c {
		case '0' ..= '9', 'a' ..= 'f':
		case:
			return false
		}
	}
	return true
}

constant_time_equal :: proc(a, b: string) -> bool {
	if len(a) != len(b) {
		return false
	}
	return crypto.compare_constant_time(transmute([]u8)a, transmute([]u8)b) == 1
}

// The visitor's CSRF token: the cookie they sent, or a fresh one set on this response.
csrf_token :: proc(req: ^http.Request, res: ^http.Response) -> string {
	if value, ok := http.request_cookie_get(req, CSRF_COOKIE); ok && is_token(value) {
		return value
	}

	token := random_token()
	append(
		&res.cookies,
		http.Cookie {
			name = CSRF_COOKIE,
			value = token,
			path = "/",
			http_only = true,
			same_site = .Lax,
			secure = config.secure_cookies,
			max_age_secs = 60 * 60 * 24 * 400,
		},
	)
	return token
}

// True when the posted token matches the cookie the browser sent.
csrf_valid :: proc(req: ^http.Request, posted: string) -> bool {
	cookie, ok := http.request_cookie_get(req, CSRF_COOKIE)
	return ok && is_token(cookie) && constant_time_equal(cookie, posted)
}

// The address a request is attributed to, for the daily message limit.
//
// Behind `proxy_hops` trusted proxies it is the entry that many from the end of X-Forwarded-For:
// the address the nearest trusted proxy saw connecting, which a client cannot forge because the
// proxy appends it. Earlier entries are whatever the client claimed. Without a trusted proxy the
// header is ignored entirely.
client_ip :: proc(req: ^http.Request) -> string {
	ip: string

	if config.proxy_hops > 0 {
		if forwarded, ok := http.headers_get_unsafe(req.headers, "x-forwarded-for"); ok {
			entries := make([dynamic]string, context.temp_allocator)
			for part in strings.split_iterator(&forwarded, ",") {
				if trimmed := strings.trim_space(part); len(trimmed) > 0 {
					append(&entries, trimmed)
				}
			}
			if len(entries) > 0 {
				ip = entries[max(len(entries) - config.proxy_hops, 0)]
			}
		}
	}
	if ip == "" {
		ip = net.address_to_string(req.client.address, context.temp_allocator)
	}

	// An IPv4 client on a dual-stack socket shows up as ::ffff:1.2.3.4; one address, one form.
	ip = strings.trim_prefix(ip, "::ffff:")

	// It becomes a database key and is shown to the owner, so keep to what an address can contain.
	if len(ip) == 0 || len(ip) > MAX_IP_LENGTH {
		return "unknown"
	}
	for c in transmute([]u8)ip {
		switch c {
		case '0' ..= '9', 'a' ..= 'f', 'A' ..= 'F', ':', '.':
		case:
			return "unknown"
		}
	}
	return ip
}

// A message of runes, not bytes: "é" is one character toward a limit of 80.
rune_count :: proc(s: string) -> int {
	n := 0
	for _ in s {
		n += 1
	}
	return n
}

is_email :: proc(s: string) -> bool {
	for c in s {
		if c == ' ' || c == '\t' || c == '\n' || c == '\r' {
			return false
		}
	}
	at := strings.index_byte(s, '@')
	if at <= 0 {
		return false
	}
	domain := s[at + 1:]
	if strings.contains_rune(domain, '@') {
		return false
	}
	dot := strings.index_byte(domain, '.')
	return dot > 0 && !strings.has_suffix(domain, ".")
}

// Reads a url-encoded form and hands the decoded fields to `then`.
Form_Handler :: #type proc(req: ^http.Request, res: ^http.Response, form: map[string]string)

Pending_Form :: struct {
	req:  ^http.Request,
	res:  ^http.Response,
	then: Form_Handler,
}

read_form :: proc(req: ^http.Request, res: ^http.Response, then: Form_Handler) {
	pending := new(Pending_Form, context.temp_allocator)
	pending^ = {req, res, then}

	http.body(req, MAX_FORM_BYTES, pending, proc(user: rawptr, body: http.Body, err: http.Body_Error) {
		pending := cast(^Pending_Form)user
		if err != nil {
			http.respond(pending.res, http.body_error_status(err))
			return
		}
		pending.then(pending.req, pending.res, parse_form(body))
	})
}
