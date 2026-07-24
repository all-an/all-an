package com.allan.app.message;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * One contact form submission.
 *
 * <p>Unlike {@code best_cryptocurrencies} this is user data, so every field arrives from the
 * outside - except {@code createdAt} and {@code ip}, which the server stamps. A client that could
 * set either of those could walk straight through the daily limit.
 */
@Entity
@Table(name = "messages")
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Resolved from X-Forwarded-For by the server. Never read from the request body. */
    @Column(nullable = false, length = 45)
    private String ip;

    @Column(length = 80)
    private String name;

    @Column(length = 254)
    private String email;

    @Column(nullable = false, columnDefinition = "text")
    private String body;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Message() {
        // required by JPA
    }

    public Message(String ip, String name, String email, String body) {
        this.ip = ip;
        this.name = name;
        this.email = email;
        this.body = body;
        this.createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public String getIp() {
        return ip;
    }

    public String getName() {
        return name;
    }

    public String getEmail() {
        return email;
    }

    public String getBody() {
        return body;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
