-- Reorder the transparent majors by speed and cost, replacing "roughly by relevance".
--
-- V6 added the feeless tier but left ranks 17+ in the order V3 seeded them, which was relevance -
-- essentially market cap with a pundit's thumb on it. That contradicted the stated thesis. If the
-- ranking claims that privacy comes first and then speed and fees, then the majors have to be
-- ordered by speed and fees, including when the answer is unflattering.
--
--   1-12   privacy coins      (unchanged)
--   13-16  feeless / instant  (unchanged)
--   17-54  transparent majors (reordered here)
--
-- THE RULE, in order:
--   1. transaction_time_seconds ascending - time to practical finality, the headline number
--   2. transaction_fee_usd ascending      - the tie-break, and there are many ties at 1s
--   3. host chain before its tokens       - see below
--   4. name                               - so the order is total and the migration is repeatable
--
-- Deliberately lexicographic rather than a weighted score. Any formula mixing seconds and dollars
-- needs an exchange rate between them that would be invented, and inventing one would hide the
-- judgement inside a constant. Sorting on time and breaking ties on fee is a rule a reader can
-- check by eye against the two columns it sorts on.
--
-- Rule 3 exists because the ERC-20 rows carry Ethereum's own timing and fees - they settle on
-- Ethereum, so they cannot be faster than it. Without the rule, alphabetical tie-breaking scattered
-- Ethereum to 49th among eight of its own tokens, which is an artifact of sorting rather than a
-- claim anyone would defend. A host now leads the tokens that depend on it.
--
-- WHAT THIS COSTS BITCOIN. It finishes 54th of 54, last on the list it used to head at 13. That is
-- the thesis working, not a bug: roughly an hour to practical finality at around $1.50, against a
-- feeless coin that settles in under a second. Bitcoin is still first by relevance and by security
-- budget - this table just does not rank on either. Worth stating plainly, because a ranking that
-- quietly protected its most famous entry would not be worth publishing.

-- Same collision dodge as V6: rank is UNIQUE and checked per row, so park the block out of range
-- before assigning final positions.
UPDATE best_cryptocurrencies SET rank = rank + 1000 WHERE rank >= 17;

UPDATE best_cryptocurrencies AS c
SET rank = ordered.new_rank
FROM (
    SELECT id,
           16 + ROW_NUMBER() OVER (
               ORDER BY transaction_time_seconds,
                        transaction_fee_usd,
                        (consensus LIKE 'ERC-20%'),
                        name
           ) AS new_rank
    FROM best_cryptocurrencies
    WHERE rank >= 1017
) AS ordered
WHERE c.id = ordered.id;
