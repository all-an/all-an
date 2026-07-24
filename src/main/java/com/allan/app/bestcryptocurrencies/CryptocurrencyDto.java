package com.allan.app.bestcryptocurrencies;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * The API shape, kept separate from the entity so the JSON contract does not move every time the
 * schema does.
 */
public record CryptocurrencyDto(
        Integer rank,
        String name,
        String symbol,
        String websiteUrl,

        PrivacyLevel privacy,
        PrivacyKind privacyKind,
        boolean privacyByDefault,
        String anonymitySet,
        boolean trustedSetupRequired,
        Fungibility fungibility,

        Integer mempoolTimeSeconds,
        Integer transactionTimeSeconds,
        BigDecimal transactionFeeUsd,
        Integer blockTimeSeconds,
        String consensus,
        Integer launchYear,
        BigDecimal supplyCap,
        boolean smartContracts,

        BigDecimal priceUsd,
        LocalDate priceDate,
        Instant priceUpdatedAt,

        String notes) {
}
