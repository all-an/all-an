package com.allan.app.message;

import java.time.Instant;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MessageRepository extends JpaRepository<Message, Long> {

    /** Backs the daily limit. Hits idx_messages_ip_created_at and stops at the first row. */
    boolean existsByIpAndCreatedAtGreaterThanEqual(String ip, Instant since);
}
