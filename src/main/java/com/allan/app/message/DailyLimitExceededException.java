package com.allan.app.message;

/** Thrown when an IP has already sent a message today. Mapped to 429 by the controller. */
public class DailyLimitExceededException extends RuntimeException {

    public DailyLimitExceededException(String message) {
        super(message);
    }
}
