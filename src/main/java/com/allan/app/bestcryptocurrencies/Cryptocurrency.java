package com.allan.app.bestcryptocurrencies;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * A row of the privacy-first ranking. Everything except the price arrives from a Flyway migration
 * and never changes at runtime - it is editorial data, not user data.
 */
@Entity
@Table(name = "best_cryptocurrencies")
public class Cryptocurrency {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // --- the thesis columns ---

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private PrivacyLevel privacy;

    @Enumerated(EnumType.STRING)
    @Column(name = "privacy_kind", nullable = false, length = 32)
    private PrivacyKind privacyKind;

    @Column(name = "privacy_by_default", nullable = false)
    private boolean privacyByDefault;

    @Column(name = "anonymity_set", nullable = false, length = 64)
    private String anonymitySet;

    @Column(name = "trusted_setup_required", nullable = false)
    private boolean trustedSetupRequired;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Fungibility fungibility;

    // --- identity ---

    @Column(name = "rank", nullable = false)
    private Integer rank;

    @Column(nullable = false, length = 64)
    private String name;

    @Column(nullable = false, length = 16)
    private String symbol;

    /** Official project page. The name in the table links here. */
    @Column(name = "website_url", nullable = false, length = 255)
    private String websiteUrl;

    // --- mechanics (approximate snapshot) ---

    /**
     * How long a transaction waits unconfirmed before being picked up. Distinct from block time:
     * an under-priced Bitcoin transaction waits while blocks keep arriving without it.
     */
    @Column(name = "mempool_time_seconds", nullable = false)
    private Integer mempoolTimeSeconds;

    @Column(name = "transaction_time_seconds", nullable = false)
    private Integer transactionTimeSeconds;

    @Column(name = "transaction_fee_usd", nullable = false, precision = 12, scale = 4)
    private BigDecimal transactionFeeUsd;

    @Column(name = "block_time_seconds", nullable = false)
    private Integer blockTimeSeconds;

    @Column(nullable = false, length = 48)
    private String consensus;

    @Column(name = "launch_year", nullable = false)
    private Integer launchYear;

    /** Null means uncapped, which is informative rather than missing. */
    @Column(name = "supply_cap", precision = 24, scale = 0)
    private BigDecimal supplyCap;

    @Column(name = "smart_contracts", nullable = false)
    private boolean smartContracts;

    // --- maintained by hand ---

    /** Null until someone fills it in. Better than a placeholder zero that reads as real. */
    @Column(name = "price_usd", precision = 18, scale = 6)
    private BigDecimal priceUsd;

    /** The day the price refers to. Supplied by the admin, not the clock. */
    @Column(name = "price_date")
    private LocalDate priceDate;

    /** When the row was last written. Stamped by the server, never by the client. */
    @Column(name = "price_updated_at")
    private Instant priceUpdatedAt;

    @Column(columnDefinition = "text")
    private String notes;

    protected Cryptocurrency() {
        // required by JPA
    }

    /**
     * Sets the price and the date it refers to, stamping the audit timestamp itself so the two
     * can never disagree.
     */
    public void updatePrice(BigDecimal priceUsd, LocalDate priceDate) {
        this.priceUsd = priceUsd;
        this.priceDate = priceDate;
        this.priceUpdatedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public PrivacyLevel getPrivacy() {
        return privacy;
    }

    public PrivacyKind getPrivacyKind() {
        return privacyKind;
    }

    public boolean isPrivacyByDefault() {
        return privacyByDefault;
    }

    public String getAnonymitySet() {
        return anonymitySet;
    }

    public boolean isTrustedSetupRequired() {
        return trustedSetupRequired;
    }

    public Fungibility getFungibility() {
        return fungibility;
    }

    public Integer getRank() {
        return rank;
    }

    public String getName() {
        return name;
    }

    public String getSymbol() {
        return symbol;
    }

    public String getWebsiteUrl() {
        return websiteUrl;
    }

    public Integer getMempoolTimeSeconds() {
        return mempoolTimeSeconds;
    }

    public Integer getTransactionTimeSeconds() {
        return transactionTimeSeconds;
    }

    public BigDecimal getTransactionFeeUsd() {
        return transactionFeeUsd;
    }

    public Integer getBlockTimeSeconds() {
        return blockTimeSeconds;
    }

    public String getConsensus() {
        return consensus;
    }

    public Integer getLaunchYear() {
        return launchYear;
    }

    public BigDecimal getSupplyCap() {
        return supplyCap;
    }

    public boolean isSmartContracts() {
        return smartContracts;
    }

    public BigDecimal getPriceUsd() {
        return priceUsd;
    }

    public LocalDate getPriceDate() {
        return priceDate;
    }

    public Instant getPriceUpdatedAt() {
        return priceUpdatedAt;
    }

    public String getNotes() {
        return notes;
    }
}
