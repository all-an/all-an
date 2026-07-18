-- A second editorial tier: feeless and instant.
--
-- V3 ranked 1-12 by privacy and then dropped straight into the transparent majors, with Bitcoin at
-- 13 on relevance alone. That skipped a distinction worth making. Once privacy is off the table the
-- next thing that separates a currency from a ledger entry is whether you can actually spend it:
-- does it settle now, and does it cost anything to move.
--
-- Bitcoin loses that comparison badly - roughly an hour to practical finality and a fee market that
-- prices out small payments - so the feeless tier goes in front of it. Bitcoin stays at the head of
-- the transparent majors, which are still ordered roughly by relevance.
--
--   1-12   privacy coins        (unchanged)
--   13-16  feeless / instant    (new)
--   17+    transparent majors   (shifted down by 4, Bitcoin now 17)
--
-- ON IOTA. It sits at 16 rather than in the feeless group proper, and that is a change of fact, not
-- of opinion. IOTA was the famous feeless DAG for most of a decade, but the Rebased upgrade (May
-- 2025) replaced the Tangle with a Move-based L1 and introduced real gas fees - averaging about
-- 0.005 IOTA, burned. It is now near-feeless and genuinely fast (~400 ms finality), which is why it
-- ranks where it does, but "feeless" is no longer true of it and the fee column says so.
--
-- ON VAULTA. EOS rebranded to Vaulta (ticker A) in 2025. Kept under its new name because that is
-- what it is now, with the EOS heritage in the notes so the row is still findable.
--
-- Vite was considered and left out: feeless, but not famous enough to earn a row, and its current
-- fee model was harder to verify than the rest. Better a short honest tier than a padded one.

-- Two steps, not one. rank carries a UNIQUE constraint and Postgres checks it per row as the index
-- is updated, so a single `SET rank = rank + 4` would collide with a rank that has not moved yet.
-- Parking the block above every real rank first sidesteps that entirely.
UPDATE best_cryptocurrencies SET rank = rank + 1000 WHERE rank >= 13;
UPDATE best_cryptocurrencies SET rank = rank - 996  WHERE rank >= 1013;

INSERT INTO best_cryptocurrencies
(privacy, privacy_kind, privacy_by_default, anonymity_set, trusted_setup_required, fungibility,
 rank, name, symbol, transaction_time_seconds, transaction_fee_usd, block_time_seconds,
 consensus, launch_year, supply_cap, smart_contracts, website_url, mempool_time_seconds, notes)
VALUES
-- ---------- feeless / instant ----------
--
-- block_time_seconds is a poor fit for the first two: a block-lattice has no global block and no
-- shared cadence, since every account owns its own chain and confirmation is a vote rather than a
-- wait for the next block. 1 stands in for "as fast as the network can agree", and mempool time is
-- a true 0 - with no fee there is no fee auction to queue in.
('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 13, 'Nano', 'XNO', 1, 0.0000, 1, 'ORV (Open Representative Voting)', 2015, 133248297, FALSE,
 'https://nano.org', 0,
 'Feeless in the strict sense: zero fee, not a low one, so the whole amount arrives. Block-lattice - every account has its own chain, so transactions settle in parallel and confirm in well under a second. Fully distributed by faucet at launch with no mining, no staking and no inflation, and representatives are unpaid, which is what keeps fees at zero rather than merely small.'),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 14, 'Banano', 'BAN', 1, 0.0000, 1, 'ORV (Open Representative Voting)', 2018, 3402823669, FALSE,
 'https://banano.cc', 0,
 'A Nano fork, so it inherits the same feeless block-lattice and sub-second settlement. Presents itself as a meme coin distributed by faucets and games, but the payment properties underneath are the real thing rather than a joke.'),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 15, 'Vaulta', 'A', 1, 0.0000, 1, 'DPoS (Savanna)', 2018, 2100000000, TRUE,
 'https://eosnetwork.com', 1,
 'Formerly EOS; rebranded to Vaulta in 2025. Feeless at the point of use, but by a different route to Nano: there is no per-transaction fee because access is bought up front by staking for CPU, NET and RAM. Ordinary activity is genuinely free to send, though heavier use needs paid resource power-ups - so the cost is moved and prepaid, not abolished.'),

('NONE', 'NONE', FALSE, 'None - pseudonymous', FALSE, 'NONE',
 16, 'IOTA', 'IOTA', 1, 0.0001, 1, 'DPoS (Mysticeti)', 2016, NULL, TRUE,
 'https://www.iota.org', 1,
 'The long-standing feeless DAG, until it stopped being one. The Rebased upgrade (May 2025) retired the Tangle and its Coordinator for a Move-based delegated-PoS L1 with elected validators, adding real gas fees - about 0.005 IOTA per transaction, burned. Ranked here on speed instead: finality lands around 400 ms and fees are negligible, but sponsored transactions now shift the cost to an application rather than removing it.');
