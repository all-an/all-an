package com.allan.app.bestcryptocurrencies;

/**
 * How much privacy the protocol actually gives you in practice.
 *
 * <p>The distinction that matters is MANDATORY vs OPTIONAL. Optional privacy is privacy most users
 * never switch on, which also shrinks the anonymity set for the few who do.
 */
public enum PrivacyLevel {

    /** Every transaction is private. No opt-out, so the anonymity set is the whole chain. */
    MANDATORY,

    /** Private transactions are available but opt-in, leaving a small shielded pool. */
    OPTIONAL,

    /** Transparent ledger. Pseudonymous at best. */
    NONE
}
