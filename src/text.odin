package main

import "core:net"
import "core:strings"

trim_space :: proc(s: string) -> string {
	return strings.trim_space(s)
}

Pair :: struct {
	key, value: string,
}

// application/x-www-form-urlencoded: '+' is a space and %XX is a byte. Browsers send spaces as '+',
// which percent-decoding alone would leave as a literal plus sign.
decode_component :: proc(s: string) -> string {
	plus_free, _ := strings.replace_all(s, "+", " ", context.temp_allocator)
	if decoded, ok := net.percent_decode(plus_free, context.temp_allocator); ok {
		return decoded
	}
	return plus_free
}

// Splits a form body or query string into decoded key/value pairs, in order.
split_pairs :: proc(encoded: string) -> []Pair {
	out := make([dynamic]Pair, context.temp_allocator)
	rest := encoded
	for part in strings.split_iterator(&rest, "&") {
		if part == "" {
			continue
		}
		key, _, value := strings.partition(part, "=")
		append(&out, Pair{decode_component(key), decode_component(value)})
	}
	return out[:]
}

// The same pairs as a map. A key that appears twice keeps its last value.
parse_form :: proc(encoded: string) -> map[string]string {
	form := make(map[string]string, 8, context.temp_allocator)
	for pair in split_pairs(encoded) {
		form[pair.key] = pair.value
	}
	return form
}
