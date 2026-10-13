package main

// Sign in, register, sign out.
//
// A wrong email and a wrong password get the same answer and take the same time, so the form does
// not reveal which addresses have accounts. Failures are counted per address and per email, and
// past a threshold the form refuses to even check.

import http "deps:odin-http"

LOGIN_WINDOW_SECONDS :: 15 * 60
LOGIN_MAX_PER_IP :: 10
LOGIN_MAX_PER_EMAIL :: 5
REGISTER_WINDOW_SECONDS :: 24 * 60 * 60
REGISTER_MAX_PER_IP :: 5

Auth_Form :: struct {
	email:                           string,
	// A problem with the form as a whole, then per field.
	error, email_error, password_error: string,
}

render_auth :: proc(req: ^http.Request, res: ^http.Response, register: bool, f: Auth_Form, status: http.Status = .OK) {
	h := html_for(req, res)
	title := "Register" if register else "Log in"
	page_begin(&h, title, "register" if register else "login")

	raw(&h, `<header class="head"><div><h1>`, title, `</h1><p class="lede">`)
	if register {
		raw(&h, `Create an account to use the quizzes and the timesheet. Your data stays in this browser.`)
	} else {
		raw(&h, `Sign in to your quizzes, results and timesheet.`)
	}
	raw(&h, `</p></div></header>`)

	raw(&h, `<form class="card" method="post" action="`, "/register" if register else "/login", `">`)
	raw(&h, `<input type="hidden" name="csrf_token" value="`, h.csrf, `">`)
	if f.error != "" {
		raw(&h, `<p class="err" role="alert">`)
		esc(&h, f.error)
		raw(&h, `</p>`)
	}

	raw(&h, `<label class="f"><span class="lab">Email</span>`)
	raw(&h, `<input type="email" name="email" maxlength="254" autocomplete="username" required value="`)
	esc(&h, f.email)
	raw(&h, `">`)
	field_error(&h, f.email_error)
	raw(&h, `</label>`)

	raw(&h, `<label class="f" style="margin-top:.75rem"><span class="lab">Password</span>`)
	raw(&h, `<input type="password" name="password" maxlength="256" required autocomplete="`)
	raw(&h, "new-password" if register else "current-password", `">`)
	field_error(&h, f.password_error)
	if register {
		raw(&h, `<span class="hint">At least 10 characters. A few random words is a good password.</span>`)
	}
	raw(&h, `</label>`)

	if register {
		raw(&h, `<label class="f" style="margin-top:.75rem"><span class="lab">Repeat the password</span>`)
		raw(&h, `<input type="password" name="confirm" maxlength="256" required autocomplete="new-password"></label>`)
	}

	raw(&h, `<div class="row" style="margin-top:.9rem"><button class="btn primary" type="submit">`, title, `</button>`)
	if register {
		raw(&h, `<a class="btn" href="/login">I already have an account</a>`)
	} else if config.registration_open {
		raw(&h, `<a class="btn" href="/register">Create an account</a>`)
	}
	raw(&h, `</div></form>`)
	page_end(&h)
	send_html(res, &h, status)
}

too_many_attempts :: proc(req: ^http.Request, res: ^http.Response) {
	http.headers_set(&res.headers, "retry-after", "900")
	error_page(
		req,
		res,
		.Too_Many_Requests,
		"Too many attempts",
		"Please wait a few minutes before trying again.",
	)
}

signed_in_redirect :: proc(res: ^http.Response) {
	redirect(res, "/app#/quizzes")
}

page_login :: proc(req: ^http.Request, res: ^http.Response) {
	if _, ok := current_user(req); ok {
		signed_in_redirect(res)
		return
	}
	render_auth(req, res, false, {})
}

page_register :: proc(req: ^http.Request, res: ^http.Response) {
	if _, ok := current_user(req); ok {
		signed_in_redirect(res)
		return
	}
	if !config.registration_open {
		error_page(req, res, .Forbidden, "Registration is closed", "New accounts are not being created right now.")
		return
	}
	render_auth(req, res, true, {})
}

login_submit :: proc(req: ^http.Request, res: ^http.Response) {
	read_form(req, res, proc(req: ^http.Request, res: ^http.Response, form: map[string]string) {
		if !csrf_valid(req, form["csrf_token"]) {
			error_page(req, res, .Forbidden, "Your session expired", "Go back, reload the page and try again.")
			return
		}

		email := normalise_email(form["email"])
		password := form["password"]
		ip := client_ip(req)

		if auth_attempts_count("login", ip, "", LOGIN_WINDOW_SECONDS) >= LOGIN_MAX_PER_IP ||
		   (email != "" && auth_attempts_count("login", "", email, LOGIN_WINDOW_SECONDS) >= LOGIN_MAX_PER_EMAIL) {
			too_many_attempts(req, res)
			return
		}

		user_id, stored, found := user_find(email)
		// Always hash, so a missing account costs the same time as a wrong password.
		correct := verify_password(password, stored if found else dummy_hash)

		if !found || !correct || len(password) > MAX_PASSWORD_BYTES {
			auth_attempt_record("login", ip, email)
			render_auth(req, res, false, {email = form["email"], error = "That email and password do not match."}, .Unauthorized)
			return
		}

		if !start_session(res, user_id) {
			error_page(req, res, .Service_Unavailable, "Could not sign you in", "The database could not be reached. Try again in a moment.")
			return
		}
		signed_in_redirect(res)
	})
}

register_submit :: proc(req: ^http.Request, res: ^http.Response) {
	read_form(req, res, proc(req: ^http.Request, res: ^http.Response, form: map[string]string) {
		if !config.registration_open {
			error_page(req, res, .Forbidden, "Registration is closed", "New accounts are not being created right now.")
			return
		}
		if !csrf_valid(req, form["csrf_token"]) {
			error_page(req, res, .Forbidden, "Your session expired", "Go back, reload the page and try again.")
			return
		}

		email := normalise_email(form["email"])
		password := form["password"]
		f := Auth_Form{email = form["email"]}
		bad := false

		if email == "" || len(email) > 254 || !is_email(email) {
			f.email_error = "Enter a valid email address."
			bad = true
		}
		if len(password) > MAX_PASSWORD_BYTES {
			f.password_error = "That password is too long."
			bad = true
		} else if rune_count(password) < MIN_PASSWORD_RUNES {
			f.password_error = "Use at least 10 characters."
			bad = true
		} else if password != form["confirm"] {
			f.password_error = "The two passwords do not match."
			bad = true
		}
		if bad {
			render_auth(req, res, true, f, .Unprocessable_Content)
			return
		}

		ip := client_ip(req)
		if auth_attempts_count("register", ip, "", REGISTER_WINDOW_SECONDS) >= REGISTER_MAX_PER_IP {
			too_many_attempts(req, res)
			return
		}
		auth_attempt_record("register", ip, "")

		encoded, hashed := hash_password(password)
		if !hashed {
			error_page(req, res, .Service_Unavailable, "Could not create the account", "Try again in a moment.")
			return
		}

		user_id, result := user_create(email, encoded, ip)
		switch result {
		case .Created:
			if !start_session(res, user_id) {
				redirect(res, "/login")
				return
			}
			signed_in_redirect(res)
		case .Exists:
			f.error = "That email already has an account. Log in instead."
			render_auth(req, res, true, f, .Conflict)
		case .Failed:
			error_page(req, res, .Service_Unavailable, "Could not create the account", "The database could not be reached. Try again in a moment.")
		}
	})
}

logout_submit :: proc(req: ^http.Request, res: ^http.Response) {
	read_form(req, res, proc(req: ^http.Request, res: ^http.Response, form: map[string]string) {
		if !csrf_valid(req, form["csrf_token"]) {
			error_page(req, res, .Forbidden, "Your session expired", "Go back, reload the page and try again.")
			return
		}
		end_session(req, res)
		redirect(res, "/about")
	})
}
