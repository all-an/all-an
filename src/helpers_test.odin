package main

import "core:testing"

@(test)
form_decodes_plus_and_percent :: proc(t: ^testing.T) {
	form := parse_form("name=Ann+Lee&body=Ol%C3%A1%21%0Aline+2&csrf_token=abc&empty=")
	testing.expect_value(t, form["name"], "Ann Lee")
	testing.expect_value(t, form["body"], "Olá!\nline 2")
	testing.expect_value(t, form["csrf_token"], "abc")
	testing.expect_value(t, form["empty"], "")
	testing.expect_value(t, len(form), 4)
}

@(test)
form_keeps_a_literal_plus_that_was_encoded :: proc(t: ^testing.T) {
	form := parse_form("expr=1%2B1")
	testing.expect_value(t, form["expr"], "1+1")
}

@(test)
form_survives_junk :: proc(t: ^testing.T) {
	form := parse_form("&&=&novalue&a=1&a=2&%zz=x")
	testing.expect_value(t, form["a"], "2")
	_, found := form["novalue"]
	testing.expect(t, found)
}

@(test)
emails :: proc(t: ^testing.T) {
	testing.expect(t, is_email("a@b.co"))
	testing.expect(t, is_email("first.last+tag@sub.example.org"))
	testing.expect(t, !is_email("a@b"))
	testing.expect(t, !is_email("@b.co"))
	testing.expect(t, !is_email("a b@c.d"))
	testing.expect(t, !is_email("a@@b.co"))
	testing.expect(t, !is_email("a@b.co."))
	testing.expect(t, !is_email(""))
}

@(test)
rune_count_counts_characters_not_bytes :: proc(t: ^testing.T) {
	testing.expect_value(t, rune_count("abc"), 3)
	testing.expect_value(t, rune_count("Olá"), 3)
	testing.expect_value(t, rune_count("日本語"), 3)
	testing.expect_value(t, rune_count(""), 0)
}

@(test)
tokens_are_32_lowercase_hex_and_distinct :: proc(t: ^testing.T) {
	a := random_token()
	b := random_token()
	testing.expect(t, is_token(a))
	testing.expect(t, a != b)
	testing.expect(t, !is_token("short"))
	testing.expect(t, !is_token("ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"))
	testing.expect(t, !is_token("0123456789ABCDEF0123456789abcdef"))
}

@(test)
constant_time_equal_matches_equality :: proc(t: ^testing.T) {
	testing.expect(t, constant_time_equal("abc", "abc"))
	testing.expect(t, !constant_time_equal("abc", "abd"))
	testing.expect(t, !constant_time_equal("abc", "ab"))
	testing.expect(t, constant_time_equal("", ""))
}

@(test)
html_escaping :: proc(t: ^testing.T) {
	h := html_make()
	esc(&h, `<script>"x" & 'y'</script>`)
	testing.expect_value(t, html_string(&h), "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;")
}

@(test)
password_hash_round_trip :: proc(t: ^testing.T) {
	encoded, ok := hash_password("correct horse battery staple")
	testing.expect(t, ok)
	testing.expect(t, verify_password("correct horse battery staple", encoded))
	testing.expect(t, !verify_password("correct horse battery stapl", encoded))
	testing.expect(t, !verify_password("", encoded))
	// Salted: the same password never hashes the same way twice.
	again, _ := hash_password("correct horse battery staple")
	testing.expect(t, encoded != again)
}

@(test)
password_verify_rejects_malformed_hashes :: proc(t: ^testing.T) {
	testing.expect(t, !verify_password("x", ""))
	testing.expect(t, !verify_password("x", "plaintext"))
	testing.expect(t, !verify_password("x", "argon2id$1$1$1$zz$zz"))
	// A stored memory cost beyond the cap is refused rather than allocated.
	testing.expect(t, !verify_password("x", "argon2id$999999999$2$1$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000"))
}

@(test)
hex_round_trip :: proc(t: ^testing.T) {
	raw := [4]u8{0x00, 0xab, 0xff, 0x10}
	encoded := hex_encode(raw[:])
	testing.expect_value(t, encoded, "00abff10")
	back: [4]u8
	testing.expect(t, hex_decode(encoded, back[:]))
	testing.expect_value(t, back, raw)
	testing.expect(t, !hex_decode("00abff1", back[:]))
	testing.expect(t, !hex_decode("00abffgg", back[:]))
}

@(test)
session_token_hash_is_stable_and_not_the_token :: proc(t: ^testing.T) {
	token := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	digest := session_token_hash(token)
	testing.expect_value(t, len(digest), 64)
	testing.expect_value(t, digest, session_token_hash(token))
	testing.expect(t, digest != token)
	testing.expect(t, session_token_hash(token) != session_token_hash("x"))
}

@(test)
emails_are_lower_cased_and_trimmed :: proc(t: ^testing.T) {
	testing.expect_value(t, normalise_email("  Ann@Example.COM "), "ann@example.com")
}
