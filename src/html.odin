package main

// HTML is built with a string builder. Everything a visitor typed goes through `esc`, which
// escapes it, so nothing they write can become markup.

import "core:strings"

Html :: struct {
	b: strings.Builder,
}

html_make :: proc() -> Html {
	return Html{b = strings.builder_make(context.temp_allocator)}
}

// Trusted markup written in this file.
raw :: proc(h: ^Html, parts: ..string) {
	for p in parts {
		strings.write_string(&h.b, p)
	}
}

// Visitor text: escaped.
esc :: proc(h: ^Html, parts: ..string) {
	for p in parts {
		for c in transmute([]u8)p {
			switch c {
			case '&':
				strings.write_string(&h.b, "&amp;")
			case '<':
				strings.write_string(&h.b, "&lt;")
			case '>':
				strings.write_string(&h.b, "&gt;")
			case '"':
				strings.write_string(&h.b, "&quot;")
			case '\'':
				strings.write_string(&h.b, "&#39;")
			case:
				strings.write_byte(&h.b, c)
			}
		}
	}
}

html_string :: proc(h: ^Html) -> string {
	return strings.to_string(h.b)
}

ASSET_VERSION :: #config(ASSET_VERSION, "dev")

Nav_Item :: struct {
	id, href, label: string,
}

NAV := [?]Nav_Item {
	{"about", "/about", "About"},
	{"quizzes", "/app#/quizzes", "Quizzes"},
	{"results", "/app#/results", "Results"},
	{"timesheet", "/app#/timesheet", "Timesheet"},
	{"data", "/app#/data", "Data"},
	{"message", "/message", "Message me"},
}

// Everything above the page's own content. `active` is the nav entry to highlight.
page_begin :: proc(h: ^Html, title, active: string, script := false) {
	raw(h, `<!doctype html><html lang="en"><head><meta charset="utf-8">`)
	raw(h, `<meta name="viewport" content="width=device-width, initial-scale=1">`)
	raw(h, `<meta name="theme-color" content="#000000">`)
	raw(h, `<meta name="description" content="Timed quizzes and a work timesheet by Allan Pereira Abrahão.">`)
	raw(h, `<title>`)
	esc(h, title)
	raw(h, ` · all-an</title>`)
	raw(h, `<link rel="icon" type="image/svg+xml" href="/static/favicon.svg">`)
	raw(h, `<link rel="stylesheet" href="/static/app.css?v=`, ASSET_VERSION, `"></head><body>`)
	raw(h, `<nav class="nav" aria-label="Main"><div class="nav-inner">`)
	raw(h, `<a class="brand" href="/about">all<b>·</b>an</a>`)
	for item in NAV {
		raw(h, `<a class="l`)
		if item.id == active {
			raw(h, ` on`)
		}
		raw(h, `" data-nav="`, item.id, `" href="`, item.href, `">`, item.label, `</a>`)
	}
	raw(h, `</div></nav><main`)
	if script {
		raw(h, ` id="app"`)
	}
	raw(h, `>`)
}

page_end :: proc(h: ^Html, script := false) {
	raw(h, `</main>`)
	if script {
		raw(h, `<noscript><main><div class="card"><h1>JavaScript is needed here</h1>`)
		raw(h, `<p class="lede">Quizzes and the timesheet run in your browser and are saved in its storage.</p></div></main></noscript>`)
		raw(h, `<script src="/static/app.js?v=`, ASSET_VERSION, `"></script>`)
	}
	raw(h, `</body></html>`)
}
