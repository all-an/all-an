package com.allan.helloworld.bestcryptocurrencies;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CryptocurrencyRepository extends JpaRepository<Cryptocurrency, Long> {

    List<Cryptocurrency> findAllByOrderByRankAsc();

    Optional<Cryptocurrency> findBySymbolIgnoreCase(String symbol);

    List<Cryptocurrency> findByPrivacyOrderByRankAsc(PrivacyLevel privacy);
}
