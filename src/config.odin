package main

import "core:os"
import "core:strconv"

Config :: struct {
	port:           int,
	database_url:   string,
	// How many proxies sit in front of the app and append to X-Forwarded-For. Zero trusts nobody.
	proxy_hops:     int,
	secure_cookies: bool,
	contact_email:  string,
	// When set (16+ characters), /admin/messages?token=... lists received messages.
	admin_token:    string,
	// Whether new accounts can be created. Turn it off once the accounts you want exist.
	registration_open: bool,
}

config: Config

@(private = "file")
env :: proc(key: string, fallback := "") -> string {
	if value, ok := os.lookup_env(key, context.allocator); ok && len(value) > 0 {
		return value
	}
	return fallback
}

@(private = "file")
env_int :: proc(key: string, fallback: int) -> int {
	if text := env(key); text != "" {
		if n, ok := strconv.parse_int(text, 10); ok {
			return n
		}
	}
	return fallback
}

@(private = "file")
env_bool :: proc(key: string, fallback: bool) -> bool {
	switch env(key) {
	case "1", "true", "TRUE", "yes", "on":
		return true
	case "0", "false", "FALSE", "no", "off":
		return false
	}
	return fallback
}

load_config :: proc() {
	// Render sets RENDER=true. Behind its proxy the connecting address is the proxy's, not the visitor's.
	on_render := env_bool("RENDER", false)

	config = Config {
		port           = env_int("PORT", 10000),
		database_url   = env("DATABASE_URL"),
		proxy_hops     = env_int("TRUSTED_PROXY_HOPS", 1 if on_render else 0),
		secure_cookies = env_bool("COOKIE_SECURE", on_render),
		contact_email  = env("CONTACT_EMAIL", "allan6tech@gmail.com"),
		admin_token    = env("ADMIN_TOKEN"),
		registration_open = env_bool("REGISTRATION_OPEN", true),
	}
	if len(config.admin_token) < 16 {
		config.admin_token = ""
	}
}
