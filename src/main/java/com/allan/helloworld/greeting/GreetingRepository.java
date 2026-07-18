package com.allan.helloworld.greeting;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GreetingRepository extends JpaRepository<Greeting, Long> {

    List<Greeting> findAllByOrderByCreatedAtDesc();
}
