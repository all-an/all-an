package com.allan.helloworld.bestcryptocurrencies;

import java.util.List;
import java.util.NoSuchElementException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class CryptocurrencyService {

    private final CryptocurrencyRepository repository;
    private final CryptocurrencyMapper mapper;

    public CryptocurrencyService(CryptocurrencyRepository repository, CryptocurrencyMapper mapper) {
        this.repository = repository;
        this.mapper = mapper;
    }

    /** The ranking, privacy-first. Rank order is the point, so it is not negotiable by the caller. */
    public List<CryptocurrencyDto> findAllRanked() {
        return repository.findAllByOrderByRankAsc().stream()
                .map(mapper::toDto)
                .toList();
    }

    public CryptocurrencyDto findBySymbol(String symbol) {
        return repository.findBySymbolIgnoreCase(symbol)
                .map(mapper::toDto)
                .orElseThrow(() -> new NoSuchElementException("No cryptocurrency with symbol " + symbol));
    }

    public List<CryptocurrencyDto> findByPrivacy(PrivacyLevel privacy) {
        return repository.findByPrivacyOrderByRankAsc(privacy).stream()
                .map(mapper::toDto)
                .toList();
    }

    /** The only mutable field on this table. */
    @Transactional
    public CryptocurrencyDto updatePrice(String symbol, UpdatePriceRequest request) {
        Cryptocurrency crypto = repository.findBySymbolIgnoreCase(symbol)
                .orElseThrow(() -> new NoSuchElementException("No cryptocurrency with symbol " + symbol));

        crypto.updatePrice(request.priceUsd(), request.priceDate());
        return mapper.toDto(repository.save(crypto));
    }
}
