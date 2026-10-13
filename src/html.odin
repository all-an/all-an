package main

// HTML is built with a string builder. Everything a visitor typed goes through `esc`, which
// escapes it, so nothing they write can become markup.

import "core:strings"

import http "deps:odin-http"

Html :: struct {
	b:         strings.Builder,
	// Who is looking: decides which nav entries exist. Zero values mean signed out.
	account:   Account,
	logged_in: bool,
	// Token for the sign-out form in the nav.
	csrf:      string,
}

// A builder for a page nobody is signed in to (tests, and pages that need no nav state).
html_make :: proc() -> Html {
	return Html{b = strings.builder_make(context.temp_allocator)}
}

// A builder that knows the visitor: it shows the private nav entries only to a signed-in account.
html_for :: proc(req: ^http.Request, res: ^http.Response) -> Html {
	h := html_make()
	h.csrf = csrf_token(req, res)
	if account, ok := current_user(req); ok {
		h.account = account
		h.logged_in = true
	}
	return h
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

// A short hash of the embedded assets, set at startup. It is part of every asset URL, so a changed
// stylesheet or script gets a new URL and no browser can keep serving the old one.
asset_version: string

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
	raw(h, `<link rel="stylesheet" href="/static/app.css?v=`, asset_version, `"></head><body`)
	if h.logged_in {
		// The saved data is keyed by this, so every page that loads app.js needs it.
		raw(h, ` data-user="`, h.account.id, `"`)
	}
	// The terminal is the only interface: it needs the form token and whether sign-up is open.
	raw(h, ` data-csrf="`, h.csrf, `"`)
	if config.registration_open {
		raw(h, ` data-register="1"`)
	}
	raw(h, `>`)
	raw(h, `<main`)
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
	}
	// Every page loads the app script: the app page renders with it, and every page gets the
	// terminal button. On a page without #app it provides only the terminal.
	raw(h, `<script src="/static/app.js?v=`, asset_version, `"></script>`)
	raw(h, `</body></html>`)
}
