package com.allan.helloworld.bestcryptocurrencies;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * The daily manual price update.
 *
 * <p>{@code priceDate} is required rather than defaulted to today: entering Monday's close on
 * Wednesday is a normal thing to do, and guessing the date on the user's behalf would quietly
 * mislabel the number. {@code PastOrPresent} because a price for a future day is not a thing.
 */
public record UpdatePriceRequest(
        @NotNull(message = "priceUsd is required")
        @DecimalMin(value = "0.0", inclusive = false, message = "priceUsd must be positive")
        BigDecimal priceUsd,

        @NotNull(message = "priceDate is required")
        @PastOrPresent(message = "priceDate cannot be in the future")
        LocalDate priceDate) {
}
