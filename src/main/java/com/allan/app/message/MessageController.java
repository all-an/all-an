package com.allan.app.message;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/messages")
public class MessageController {

    /** Shown in the 429 body so the sender always has a way through. */
    private static final String CONTACT_EMAIL = "allan8tech@gmail.com";

    private final MessageService service;

    public MessageController(MessageService service) {
        this.service = service;
    }

    /**
     * There is no GET on this resource. Messages are read out of the database by hand; exposing
     * them would publish strangers' contact details to anyone who guessed the URL.
     */
    @PostMapping
    public ResponseEntity<MessageResponse> send(@Valid @RequestBody CreateMessageRequest request,
                                                HttpServletRequest httpRequest) {
        Message saved = service.send(request, httpRequest.getRemoteAddr());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new MessageResponse(saved.getId(), saved.getCreatedAt()));
    }

    @ExceptionHandler(DailyLimitExceededException.class)
    public ResponseEntity<LimitResponse> handleDailyLimit(DailyLimitExceededException e) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(new LimitResponse(e.getMessage(), CONTACT_EMAIL));
    }

    public record MessageResponse(Long id, Instant createdAt) {
    }

    /** The 429 body carries the fallback address so the UI never has to hardcode it. */
    public record LimitResponse(String message, String contactEmail) {
    }
}
