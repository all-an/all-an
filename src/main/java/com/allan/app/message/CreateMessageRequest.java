package com.allan.app.message;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * The contact form payload.
 *
 * <p>There is deliberately no ip field: the server resolves the address itself. Accepting it from
 * the client would make the daily limit trivially bypassable.
 *
 * <p>{@code email} is optional but validated when present - a malformed address is a typo worth
 * catching at the form, since it is the only way a reply ever gets back.
 */
public record CreateMessageRequest(
        @Size(max = 80, message = "name must be at most 80 characters")
        String name,

        @Email(message = "email is not a valid address")
        @Size(max = 254, message = "email must be at most 254 characters")
        String email,

        @NotBlank(message = "message is required")
        @Size(max = 5000, message = "message must be at most 5000 characters")
        String body) {
}
