package main

// The server-rendered pages: About, Message me, the messages inbox, the app shell and errors.

import "core:fmt"
import http "deps:odin-http"

Stack_Group :: struct {
	label: string,
	items: []string,
}

STACK := [?]Stack_Group {
	{"Languages", {"Java", "Python", "Rust", "Odin", "TypeScript", "JavaScript", "Bash"}},
	{"Backend", {"Spring Boot", "Quarkus", "Flask", "Axum", "REST APIs"}},
	{"Frontend", {"Angular", "React", "HTMX"}},
	{"Data", {"PostgreSQL", "MySQL", "Redis", "Flyway", "Liquibase"}},
	{"Messaging", {"RabbitMQ", "Apache Kafka"}},
	{"Infrastructure", {"AWS", "Docker", "Linux"}},
	{"Practices", {"TDD", "BDD", "DDD"}},
	{"AI Driven", {"Claude Code", "Codex", "Prompt engineering", "AI-assisted refactoring and tests"}},
}

send_html :: proc(res: ^http.Response, h: ^Html, status: http.Status = .OK) {
	http.respond_html(res, html_string(h), status)
}

redirect :: proc(res: ^http.Response, location: string) {
	res.status = .See_Other
	http.headers_set(&res.headers, "location", location)
	http.respond(res)
}

error_page :: proc(req: ^http.Request, res: ^http.Response, status: http.Status, title, message: string) {
	h := html_for(req, res)
	page_begin(&h, title, "")
	raw(&h, `<div class="card"><h1>`)
	esc(&h, title)
	raw(&h, `</h1><p class="lede">`)
	esc(&h, message)
	raw(&h, `</p><div class="row" style="margin-top:1rem"><a class="btn primary" href="/about">Back to the front page</a></div></div>`)
	page_end(&h)
	send_html(res, &h, status)
}

// --- about -------------------------------------------------------------------------------------

page_about :: proc(req: ^http.Request, res: ^http.Response) {
	h := html_for(req, res)
	page_begin(&h, "About me", "about")
	raw(&h, `<header class="head"><div><h1>Allan Pereira Abrahão</h1>`)
	raw(&h, `<p class="lede">Full Stack Software Developer at Aubay Portugal</p></div></header>`)
	raw(&h, `<section class="card stack"><p>I build full stack products end to end — from the server and the database `)
	raw(&h, `to the interface and the deployment around them.</p>`)
	raw(&h, `<p>I care about the parts that decide whether software survives contact with production — migrations `)
	raw(&h, `that are safe to run twice, schemas that fail loudly on drift, and tests written before the code they justify.</p></section>`)

	raw(&h, `<h2 style="margin:1.5rem 0 .75rem">Stack</h2><div class="tiles">`)
	for group in STACK {
		raw(&h, `<div class="card"><h3>`, group.label, `</h3><div class="chips">`)
		for item in group.items {
			raw(&h, `<span class="chip">`, item, `</span>`)
		}
		raw(&h, `</div></div>`)
	}
	raw(&h, `</div>`)

	raw(&h, `<h2 style="margin:1.5rem 0 .75rem">Elsewhere</h2><div class="row">`)
	raw(&h, `<a class="btn" href="https://www.linkedin.com/in/allan-pereira-abrahao" target="_blank" rel="noopener">LinkedIn →</a>`)
	raw(&h, `<a class="btn" href="https://github.com/all-an" target="_blank" rel="noopener">GitHub →</a>`)
	raw(&h, `<a class="btn primary" href="/message">Message me</a></div>`)
	page_end(&h)
	send_html(res, &h)
}

// --- the app shell: quizzes, results, timesheet and data run in the browser ---------------------

page_app :: proc(req: ^http.Request, res: ^http.Response) {
	h := html_for(req, res)
	// Quizzes and the timesheet belong to an account.
	if !h.logged_in {
		redirect(res, "/login")
		return
	}
	page_begin(&h, "Quizzes", "quizzes", script = true)
	page_end(&h, script = true)
	send_html(res, &h)
}

// --- message me --------------------------------------------------------------------------------

Message_Form :: struct {
	name, email, body: string,
	// Per-field problems, empty when fine.
	name_error, email_error, body_error: string,
}

field_error :: proc(h: ^Html, message: string) {
	if message != "" {
		raw(h, `<span class="err">`)
		esc(h, message)
		raw(h, `</span>`)
	}
}

render_message_form :: proc(req: ^http.Request, res: ^http.Response, f: Message_Form, status: http.Status = .OK) {
	h := html_for(req, res)
	page_begin(&h, "Message me", "message")
	raw(&h, `<header class="head"><div><h1>Message me</h1><p class="lede">Write a note and it reaches me directly. `)
	raw(&h, `One message a day per address, so I can give each a proper reply.</p></div></header>`)
	raw(&h, `<form class="card" method="post" action="/message">`)
	raw(&h, `<input type="hidden" name="csrf_token" value="`, h.csrf, `">`)

	raw(&h, `<label class="f"><span class="lab">Name <span class="hint">optional</span></span>`)
	raw(&h, `<input type="text" name="name" maxlength="80" autocomplete="name" value="`)
	esc(&h, f.name)
	raw(&h, `">`)
	field_error(&h, f.name_error)
	raw(&h, `</label>`)

	raw(&h, `<label class="f" style="margin-top:.75rem"><span class="lab">Email <span class="hint">optional, for a reply</span></span>`)
	raw(&h, `<input type="email" name="email" maxlength="254" autocomplete="email" value="`)
	esc(&h, f.email)
	raw(&h, `">`)
	field_error(&h, f.email_error)
	raw(&h, `</label>`)

	raw(&h, `<label class="f" style="margin-top:.75rem"><span class="lab">Message</span>`)
	raw(&h, `<textarea name="body" rows="7" maxlength="5000" required>`)
	esc(&h, f.body)
	raw(&h, `</textarea>`)
	field_error(&h, f.body_error)
	raw(&h, `<span class="hint">5000 characters at most</span></label>`)

	raw(&h, `<div class="row" style="margin-top:.9rem"><button class="btn primary" type="submit">Send message</button></div>`)
	raw(&h, `<p class="hint" style="margin-top:.75rem">Prefer email? <a href="mailto:`)
	esc(&h, config.contact_email)
	raw(&h, `">`)
	esc(&h, config.contact_email)
	raw(&h, `</a></p></form>`)
	page_end(&h)
	send_html(res, &h, status)
}

page_message :: proc(req: ^http.Request, res: ^http.Response) {
	render_message_form(req, res, {})
}

message_sent :: proc(req: ^http.Request, res: ^http.Response) {
	h := html_for(req, res)
	page_begin(&h, "Message sent", "message")
	raw(&h, `<div class="card"><h1>Thank you!</h1>`)
	raw(&h, `<p class="lede">Your message is in. I read everything, and reply when you left an email.</p>`)
	raw(&h, `<div class="row" style="margin-top:1rem"><a class="btn primary" href="/about">Back to the front page →</a></div></div>`)
	page_end(&h)
	send_html(res, &h)
}

// The daily limit is the one "error" a normal person will hit, so it gets the warmest copy on the
// page and the email address as an immediate way through.
message_limited :: proc(req: ^http.Request, res: ^http.Response) {
	h := html_for(req, res)
	page_begin(&h, "Thanks for writing again", "message")
	raw(&h, `<div class="card" role="alert"><h1>Thanks for writing again!</h1>`)
	raw(&h, `<p class="lede">Your message for today already came through — I keep it to one a day per address so I `)
	raw(&h, `can give everyone a proper reply.</p>`)
	raw(&h, `<p style="margin-top:.75rem">If there is more you would like to share, or it cannot wait until tomorrow, `)
	raw(&h, `my inbox is always open:</p><p style="margin-top:.5rem"><a href="mailto:`)
	esc(&h, config.contact_email)
	raw(&h, `">`)
	esc(&h, config.contact_email)
	raw(&h, `</a></p><div class="row" style="margin-top:1rem">`)
	raw(&h, `<a class="btn primary" href="/about">Back to the front page →</a></div></div>`)
	page_end(&h)
	send_html(res, &h, .Too_Many_Requests)
}

message_submit :: proc(req: ^http.Request, res: ^http.Response) {
	read_form(req, res, proc(req: ^http.Request, res: ^http.Response, form: map[string]string) {
		if !csrf_valid(req, form["csrf_token"]) {
			error_page(req, res, .Forbidden, "Your session expired", "Go back, reload the page and try again.")
			return
		}

		name := trim_space(form["name"])
		email := trim_space(form["email"])
		body := trim_space(form["body"])

		f := Message_Form{name = name, email = email, body = body}
		bad := false
		if rune_count(name) > 80 {
			f.name_error = "Name must be at most 80 characters."
			bad = true
		}
		if rune_count(email) > 254 {
			f.email_error = "Email must be at most 254 characters."
			bad = true
		} else if email != "" && !is_email(email) {
			f.email_error = "Email is not a valid address."
			bad = true
		}
		if body == "" {
			f.body_error = "Message is required."
			bad = true
		} else if rune_count(body) > 5000 {
			f.body_error = "Message must be at most 5000 characters."
			bad = true
		}
		if bad {
			render_message_form(req, res, f, .Unprocessable_Content)
			return
		}

		switch messages_insert(client_ip(req), name, email, body) {
		case .Sent:
			message_sent(req, res)
		case .Limited:
			message_limited(req, res)
		case .Failed:
			error_page(req, res, .Service_Unavailable, "Could not save your message", "The database could not be reached. Try again in a moment, or write to me by email.")
		}
	})
}

// --- the inbox ---------------------------------------------------------------------------------

// Lists received messages. Only exists when ADMIN_TOKEN is set; there are no accounts to hang a login on.
page_inbox :: proc(req: ^http.Request, res: ^http.Response) {
	query := req.url.query
	token := ""
	for pair in split_pairs(query) {
		if pair.key == "token" {
			token = pair.value
		}
	}

	// The same answer whether the feature is off or the token is wrong: the page does not exist for you.
	if config.admin_token == "" || !constant_time_equal(token, config.admin_token) {
		error_page(req, res, .Not_Found, "Not found", "There is no such page.")
		return
	}

	list := messages_recent(200)
	h := html_for(req, res)
	page_begin(&h, "Messages", "")
	raw(&h, `<header class="head"><div><h1>Messages</h1><p class="lede">`)
	esc(&h, fmt.tprintf("%d most recent", len(list)))
	raw(&h, `</p></div></header>`)
	if len(list) == 0 {
		raw(&h, `<div class="empty">No messages yet.</div>`)
	}
	raw(&h, `<div class="stack">`)
	for m in list {
		raw(&h, `<article class="card"><p class="card-title">`)
		esc(&h, m.name if m.name != "" else "Anonymous")
		raw(&h, `</p><p class="meta">`)
		esc(&h, m.created_at, " · ", m.ip)
		if m.email != "" {
			raw(&h, ` · <a href="mailto:`)
			esc(&h, m.email)
			raw(&h, `">`)
			esc(&h, m.email)
			raw(&h, `</a>`)
		}
		raw(&h, `</p><p style="margin-top:.5rem;white-space:pre-wrap">`)
		esc(&h, m.body)
		raw(&h, `</p></article>`)
	}
	raw(&h, `</div>`)
	page_end(&h)
	http.headers_set(&res.headers, "cache-control", "no-store")
	send_html(res, &h)
}
