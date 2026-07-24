package com.allan.app.message;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MessageService {

    /**
     * "One a day" is measured against the UTC calendar day, not a rolling 24 hours. A rolling
     * window punishes someone who writes at 09:00 and again at 08:00 the next morning, which reads
     * as broken to them; a calendar day resets at a predictable moment. UTC rather than server
     * local time so the reset does not move when the host or its timezone changes.
     */
    private static final ZoneOffset LIMIT_ZONE = ZoneOffset.UTC;

    private final MessageRepository repository;

    public MessageService(MessageRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public Message send(CreateMessageRequest request, String ip) {
        if (repository.existsByIpAndCreatedAtGreaterThanEqual(ip, startOfToday())) {
            throw new DailyLimitExceededException("This address has already sent a message today.");
        }

        return repository.save(new Message(ip, blankToNull(request.name()),
                blankToNull(request.email()), request.body().trim()));
    }

    private Instant startOfToday() {
        return LocalDate.now(LIMIT_ZONE).atStartOfDay(LIMIT_ZONE).toInstant();
    }

    /** An empty optional field is absent, not an empty string - keep that out of the database. */
    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
