package com.allan.helloworld.bestcryptocurrencies;

/**
 * The practical consequence of privacy: whether one coin is interchangeable with another, or
 * whether its history can get it tainted, flagged or refused by an exchange.
 */
public enum Fungibility {

    /** Every coin is indistinguishable. No history to taint. */
    STRONG,

    /** Fungible only inside the shielded or mixed pool. */
    PARTIAL,

    /** Fully traceable history; coins can be blacklisted. */
    NONE
}
