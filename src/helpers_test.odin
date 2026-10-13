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
