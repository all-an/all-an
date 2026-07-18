package com.allan.helloworld.greeting;

import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/greetings")
public class GreetingController {

    private final GreetingRepository repository;

    public GreetingController(GreetingRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<Greeting> findAll() {
        return repository.findAllByOrderByCreatedAtDesc();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Greeting> findById(@PathVariable Long id) {
        return repository.findById(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<Greeting> create(@Valid @RequestBody GreetingRequest request) {
        Greeting saved = repository.save(new Greeting(request.message()));
        return ResponseEntity.created(URI.create("/api/greetings/" + saved.getId())).body(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Greeting> update(@PathVariable Long id, @Valid @RequestBody GreetingRequest request) {
        return repository.findById(id)
                .map(greeting -> {
                    greeting.setMessage(request.message());
                    return ResponseEntity.ok(repository.save(greeting));
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (!repository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        repository.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
