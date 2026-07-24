package com.allan.app.bestcryptocurrencies;

/**
 * The mechanism behind the privacy, which is not the same question as how much privacy you get.
 * Zcash's zk-SNARKs are arguably the stronger primitive; Monero's ring signatures are probabilistic.
 * Monero still ranks higher because its privacy is on by default. See CRYPTO-ROADMAP.md.
 */
public enum PrivacyKind {

    /** Monero: ring signatures + stealth addresses + RingCT. */
    RING_SIGNATURES_RINGCT,

    /** Zcash, Pirate Chain, Horizen, Firo: zero-knowledge proofs. */
    ZK_SNARKS,

    /** Beam, Grin: no on-chain addresses, blinded amounts, cut-through. */
    MIMBLEWIMBLE,

    /** Dash, Decred: mixing bolted on top of a transparent ledger. */
    COINJOIN,

    /** Litecoin MWEB: blinded amounts in an extension block. */
    CONFIDENTIAL_TRANSACTIONS,

    /** Secret, Oasis: encrypted state in trusted hardware - a hardware trust model, not crypto. */
    TEE_ENCRYPTED_STATE,

    /** No privacy mechanism. */
    NONE
}
