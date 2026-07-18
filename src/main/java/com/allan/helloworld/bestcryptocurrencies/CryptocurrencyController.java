package com.allan.helloworld.bestcryptocurrencies;

import jakarta.validation.Valid;
import java.util.List;
import java.util.NoSuchElementException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/cryptocurrencies")
public class CryptocurrencyController {

    private final CryptocurrencyService service;

    public CryptocurrencyController(CryptocurrencyService service) {
        this.service = service;
    }

    @GetMapping
    public List<CryptocurrencyDto> findAll(@RequestParam(required = false) PrivacyLevel privacy) {
        return privacy == null ? service.findAllRanked() : service.findByPrivacy(privacy);
    }

    @GetMapping("/{symbol}")
    public CryptocurrencyDto findBySymbol(@PathVariable String symbol) {
        return service.findBySymbol(symbol);
    }

    /**
     * The daily manual price update.
     *
     * <p>TODO(phase 5): restrict to ADMIN with @PreAuthorize once Spring Security lands. Until then
     * this endpoint is open, so do not deploy it publicly as-is.
     */
    @PutMapping("/{symbol}/price")
    public CryptocurrencyDto updatePrice(@PathVariable String symbol,
                                         @Valid @RequestBody UpdatePriceRequest request) {
        return service.updatePrice(symbol, request);
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<Void> handleNotFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }
}
