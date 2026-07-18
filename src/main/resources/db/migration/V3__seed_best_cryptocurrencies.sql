-- Editorial privacy-first ranking. NOT market cap order - see CRYPTO-ROADMAP.md.
--
-- Ranks 1-12 are privacy coins ordered by how strong and how DEFAULT their privacy is.
-- Ranks 13-50 are majors with no protocol-level privacy.
--
-- transaction_time_seconds and transaction_fee_usd are an APPROXIMATE, hand-curated snapshot
-- (2026-07). Fees swing with congestion; "typical" is a judgement call, not a fact. The privacy
-- columns describe protocol design and age far better.
--
-- price_usd / price_date are intentionally NULL: they are filled in by hand.

INSERT INTO best_cryptocurrencies
(privacy, privacy_kind, privacy_by_default, anonymity_set, trusted_setup_required, fungibility,
 rank, name, symbol, transaction_time_seconds, transaction_fee_usd, block_time_seconds,
 consensus, launch_year, supply_cap, smart_contracts, notes)
VALUES
-- ---------- privacy coins ----------
('MANDATORY', 'RING_SIGNATURES_RINGCT', TRUE, 'Every transaction on the chain', FALSE, 'STRONG',
 1, 'Monero', 'XMR', 1200, 0.0200, 120, 'PoW (RandomX)', 2014, NULL, FALSE,
 'Privacy is mandatory. Ring signatures hide the sender, stealth addresses the receiver, RingCT the amount - on every transaction, so the anonymity set is the whole chain. No trusted setup, ever.'),

('OPTIONAL', 'ZK_SNARKS', FALSE, 'Shielded pool only', FALSE, 'PARTIAL',
 2, 'Zcash', 'ZEC', 750, 0.0050, 75, 'PoW (Equihash)', 2016, 21000000, FALSE,
 'Per transaction its zk-SNARKs are arguably stronger than ring signatures - but shielding is opt-in and most transactions are transparent, leaving a small anonymity set. Halo 2 (NU5, 2022) removed the original trusted setup.'),

('MANDATORY', 'ZK_SNARKS', TRUE, 'Every transaction on the chain', TRUE, 'STRONG',
 3, 'Pirate Chain', 'ARRR', 600, 0.0010, 60, 'PoW (Equihash) + dPoW', 2018, 200000000, FALSE,
 'Zcash-style zk-SNARKs, but shielding is mandatory - the anonymity set Zcash never got. Inherits a Sapling trusted setup.'),

('MANDATORY', 'MIMBLEWIMBLE', TRUE, 'Every transaction on the chain', FALSE, 'STRONG',
 4, 'Beam', 'BEAM', 600, 0.0100, 60, 'PoW (BeamHash III)', 2019, 262800000, FALSE,
 'Mimblewimble: no addresses stored on chain, amounts blinded, old outputs cut through and discarded.'),

('MANDATORY', 'MIMBLEWIMBLE', TRUE, 'Every transaction on the chain', FALSE, 'STRONG',
 5, 'Grin', 'GRIN', 600, 0.0050, 60, 'PoW (Cuckoo Cycle)', 2019, NULL, FALSE,
 'Minimalist Mimblewimble. No premine, no founder reward, linear emission.'),

('OPTIONAL', 'ZK_SNARKS', FALSE, 'Spark pool only', FALSE, 'PARTIAL',
 6, 'Firo', 'FIRO', 600, 0.0100, 300, 'PoW (FiroPoW)', 2016, 21400000, FALSE,
 'Lelantus Spark: strong opt-in privacy with no trusted setup. Held back by being opt-in.'),

('OPTIONAL', 'COINJOIN', FALSE, 'Mixing pool only', FALSE, 'PARTIAL',
 7, 'Dash', 'DASH', 150, 0.0030, 150, 'PoW (X11) + masternodes', 2014, 18900000, FALSE,
 'PrivateSend is CoinJoin mixing bolted on top, not protocol-level privacy. Amounts and addresses stay visible; often mislabelled a privacy coin.'),

('OPTIONAL', 'COINJOIN', FALSE, 'Mixing pool only', FALSE, 'PARTIAL',
 8, 'Decred', 'DCR', 300, 0.0100, 300, 'Hybrid PoW/PoS', 2016, 21000000, FALSE,
 'StakeShuffle CoinJoin mixing, opt-in, with a healthy mixed share of supply.'),

('MANDATORY', 'TEE_ENCRYPTED_STATE', TRUE, 'Contract state', FALSE, 'PARTIAL',
 9, 'Secret', 'SCRT', 6, 0.0500, 6, 'PoS (Tendermint)', 2020, NULL, TRUE,
 'Encrypted contract state via trusted execution environments - privacy rests on Intel SGX hardware, a very different trust model to cryptography.'),

('OPTIONAL', 'TEE_ENCRYPTED_STATE', FALSE, 'Contract state', FALSE, 'PARTIAL',
 10, 'Oasis', 'ROSE', 6, 0.0020, 6, 'PoS', 2020, 10000000000, TRUE,
 'Sapphire ParaTime offers opt-in confidential EVM state, also TEE-based.'),

('OPTIONAL', 'ZK_SNARKS', FALSE, 'Shielded pool only', TRUE, 'PARTIAL',
 11, 'Horizen', 'ZEN', 900, 0.0010, 150, 'PoW (Equihash)', 2017, 21000000, FALSE,
 'Zcash-derived shielded pool - opt-in and lightly used, so the same small-anonymity-set problem.'),

('OPTIONAL', 'CONFIDENTIAL_TRANSACTIONS', FALSE, 'MWEB pool only', FALSE, 'PARTIAL',
 12, 'Litecoin', 'LTC', 900, 0.0030, 150, 'PoW (Scrypt)', 2011, 84000000, FALSE,
 'MWEB adds opt-in confidential transactions in an extension block. Privacy as a feature, not a default.'),

-- ---------- transparent majors ----------
('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 13, 'Bitcoin', 'BTC', 3600, 1.5000, 600, 'PoW (SHA-256)', 2009, 21000000, FALSE,
 'A fully public ledger. Pseudonymous, not private - chain analysis is a mature industry. Coins can be tainted and blacklisted, which is what fungibility costs you.'),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 14, 'Ethereum', 'ETH', 780, 0.5000, 12, 'PoS', 2015, NULL, TRUE,
 'Transparent by default; privacy needs L2s or mixers, and mixers carry regulatory risk.'),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 15, 'Cardano', 'ADA', 300, 0.1500, 20, 'PoS (Ouroboros)', 2017, 45000000000, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 16, 'Solana', 'SOL', 13, 0.0003, 1, 'PoS + PoH', 2020, NULL, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 17, 'Polkadot', 'DOT', 60, 0.0500, 6, 'NPoS', 2020, NULL, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 18, 'Avalanche', 'AVAX', 3, 0.0500, 2, 'Avalanche consensus', 2020, 720000000, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 19, 'Cosmos', 'ATOM', 6, 0.0100, 6, 'PoS (Tendermint)', 2019, NULL, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 20, 'Chainlink', 'LINK', 780, 0.5000, 12, 'ERC-20 on Ethereum', 2017, 1000000000, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 21, 'Polygon', 'POL', 4, 0.0100, 2, 'PoS', 2020, 10000000000, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 22, 'Tron', 'TRX', 3, 0.1000, 3, 'DPoS', 2018, NULL, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 23, 'XRP', 'XRP', 4, 0.0002, 4, 'XRP Ledger Consensus', 2012, 100000000000, FALSE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 24, 'Stellar', 'XLM', 5, 0.0001, 5, 'SCP', 2014, 50000000000, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 25, 'Dogecoin', 'DOGE', 60, 0.0200, 60, 'PoW (Scrypt, merge-mined)', 2013, NULL, FALSE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 26, 'Bitcoin Cash', 'BCH', 600, 0.0030, 600, 'PoW (SHA-256)', 2017, 21000000, FALSE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 27, 'Algorand', 'ALGO', 3, 0.0002, 3, 'PPoS', 2019, 10000000000, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 28, 'Tezos', 'XTZ', 8, 0.0100, 8, 'LPoS', 2018, NULL, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 29, 'Filecoin', 'FIL', 30, 0.0100, 30, 'PoRep / PoSt', 2020, 1960000000, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 30, 'Aptos', 'APT', 1, 0.0005, 1, 'PoS (BFT)', 2022, NULL, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 31, 'Sui', 'SUI', 1, 0.0005, 1, 'PoS (Narwhal/Bullshark)', 2023, 10000000000, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 32, 'NEAR Protocol', 'NEAR', 1, 0.0010, 1, 'PoS (Nightshade)', 2020, NULL, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 33, 'Arbitrum', 'ARB', 1, 0.0200, 1, 'Optimistic rollup (L2)', 2023, 10000000000, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 34, 'Optimism', 'OP', 2, 0.0200, 2, 'Optimistic rollup (L2)', 2022, 4294967296, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 35, 'Uniswap', 'UNI', 780, 0.5000, 12, 'ERC-20 on Ethereum', 2020, 1000000000, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 36, 'Aave', 'AAVE', 780, 0.5000, 12, 'ERC-20 on Ethereum', 2020, 16000000, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 37, 'Maker', 'MKR', 780, 0.5000, 12, 'ERC-20 on Ethereum', 2017, 1005577, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 38, 'Compound', 'COMP', 780, 0.5000, 12, 'ERC-20 on Ethereum', 2020, 10000000, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 39, 'Curve DAO', 'CRV', 780, 0.5000, 12, 'ERC-20 on Ethereum', 2020, 3030000000, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 40, 'Lido DAO', 'LDO', 780, 0.5000, 12, 'ERC-20 on Ethereum', 2020, 1000000000, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 41, 'The Graph', 'GRT', 780, 0.5000, 12, 'ERC-20 on Ethereum', 2020, 10000000000, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 42, 'Injective', 'INJ', 1, 0.0010, 1, 'PoS (Tendermint)', 2021, 100000000, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 43, 'Sei', 'SEI', 1, 0.0010, 1, 'PoS (Tendermint)', 2023, 10000000000, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 44, 'Celestia', 'TIA', 6, 0.0020, 6, 'PoS (Tendermint)', 2023, NULL, FALSE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 45, 'Hedera', 'HBAR', 3, 0.0001, 3, 'Hashgraph aBFT', 2019, 50000000000, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 46, 'VeChain', 'VET', 10, 0.0010, 10, 'PoA', 2018, 86712634466, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 47, 'Internet Computer', 'ICP', 2, 0.0001, 1, 'Threshold relay', 2021, NULL, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 48, 'Ethereum Classic', 'ETC', 780, 0.0200, 13, 'PoW (Etchash)', 2016, 210700000, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 49, 'Zilliqa', 'ZIL', 30, 0.0010, 30, 'PoW + pBFT', 2019, 21000000000, TRUE, NULL),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 50, 'Ravencoin', 'RVN', 60, 0.0100, 60, 'PoW (KAWPOW)', 2018, 21000000000, FALSE, NULL);
