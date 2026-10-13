package main

import "core:c/libc"
import "core:crypto/hash"
import "core:log"
import "core:net"
import "core:os"
import "base:runtime"

import http "deps:odin-http"

APP_CSS := #load("../static/app.css")
APP_JS := #load("../static/app.js")
FAVICON := #load("../static/favicon.svg")

server: http.Server
shutdown_context: runtime.Context

// The URL carries a hash of the content, so a changed file has a new URL and an old one never goes stale.
asset :: proc(res: ^http.Response, name: string, content: []byte) {
	http.headers_set(&res.headers, "cache-control", "public, max-age=31536000, immutable")
	http.respond_file_content(res, name, content)
}

// Render's health check: answers only when the database does.
healthz :: proc(req: ^http.Request, res: ^http.Response) {
	if db_ping() {
		http.respond_plain(res, "ok")
	} else {
		http.respond_plain(res, "database unavailable", .Service_Unavailable)
	}
}

not_found :: proc(req: ^http.Request, res: ^http.Response) {
	error_page(req, res, .Not_Found, "Not found", "There is no such page.")
}

// The page chrome (nav, About, Message me, sign in) is rendered here; quizzes and the timesheet run
// in the browser. Their old paths land on the right screen of the app, or on sign in.
to_app :: proc($screen: string) -> http.Handler {
	return http.handler(proc(req: ^http.Request, res: ^http.Response) {
		if _, ok := current_user(req); !ok {
			redirect(res, "/login")
			return
		}
		redirect(res, "/app#/" + screen)
	})
}

// Headers every response carries.
secure_headers :: proc(handler: ^http.Handler, req: ^http.Request, res: ^http.Response) {
	http.headers_set(&res.headers, "x-content-type-options", "nosniff")
	http.headers_set(&res.headers, "referrer-policy", "same-origin")
	http.headers_set(&res.headers, "x-frame-options", "DENY")
	// No inline script anywhere, and nothing is loaded from another site.
	http.headers_set(
		&res.headers,
		"content-security-policy",
		"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
		"object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
	)

	next := handler.next.(^http.Handler)
	next.handle(next, req, res)
}

// Render stops a service with SIGTERM; Ctrl-C covers local runs.
install_shutdown :: proc() {
	shutdown_context = context
	handler :: proc "cdecl" (_: i32) {
		context = shutdown_context
		http.server_shutdown(&server)
	}
	libc.signal(libc.SIGTERM, handler)
	libc.signal(libc.SIGINT, handler)
}

main :: proc() {
	context.logger = log.create_console_logger(.Info)
	load_config()

	assets := make([dynamic]u8, context.allocator)
	append(&assets, ..APP_CSS)
	append(&assets, ..APP_JS)
	append(&assets, ..FAVICON)
	asset_version = hex_encode(hash.hash_bytes(.SHA256, assets[:], context.allocator)[:6], context.allocator)
	delete(assets)

	if config.database_url == "" {
		log.error("DATABASE_URL is not set. See README-all-an.md for the local setup.")
		os.exit(1)
	}
	if !db_init(config.database_url) {
		log.error("cannot reach the database")
		os.exit(1)
	}
	auth_init()

	router: http.Router
	http.router_init(&router)
	defer http.router_destroy(&router)

	http.route_get(&router, "/", http.handler(page_about))
	http.route_get(&router, "/about", http.handler(page_about))
	http.route_get(&router, "/app", http.handler(page_app))
	http.route_get(&router, "/quizzes", to_app("quizzes"))
	http.route_get(&router, "/results", to_app("results"))
	http.route_get(&router, "/timesheet", to_app("timesheet"))
	http.route_get(&router, "/data", to_app("data"))

	http.route_get(&router, "/login", http.handler(page_login))
	http.route_post(&router, "/login", http.handler(login_submit))
	http.route_get(&router, "/register", http.handler(page_register))
	http.route_post(&router, "/register", http.handler(register_submit))
	http.route_post(&router, "/logout", http.handler(logout_submit))

	http.route_get(&router, "/message", http.handler(page_message))
	http.route_post(&router, "/message", http.handler(message_submit))
	http.route_get(&router, "/admin/messages", http.handler(page_inbox))

	http.route_get(&router, "/static/app.css", http.handler(proc(req: ^http.Request, res: ^http.Response) {
		asset(res, "app.css", APP_CSS)
	}))
	http.route_get(&router, "/static/app.js", http.handler(proc(req: ^http.Request, res: ^http.Response) {
		asset(res, "app.js", APP_JS)
	}))
	http.route_get(&router, "/static/favicon.svg", http.handler(proc(req: ^http.Request, res: ^http.Response) {
		asset(res, "favicon.svg", FAVICON)
	}))
	http.route_get(&router, "/healthz", http.handler(healthz))
	http.route_get(&router, "(.*)", http.handler(not_found))

	routed := http.router_handler(&router)
	secured := http.middleware_proc(&routed, secure_headers)

	install_shutdown()

	endpoint := net.Endpoint {
		address = net.IP4_Any,
		port    = config.port,
	}
	log.infof("listening on http://0.0.0.0:%d", config.port)
	if err := http.listen_and_serve(&server, secured, endpoint); err != nil {
		log.errorf("server stopped with error: %v", err)
		os.exit(1)
	}
}
