-- Two additions:
--
-- website_url          - the official project page, linked from the name in the table.
-- mempool_time_seconds - how long a transaction typically waits UNCONFIRMED before a miner or
--                        validator picks it up. This is the gap between broadcasting and the first
--                        confirmation, and it is not the same thing as block_time_seconds: an
--                        under-priced Bitcoin transaction can sit in the mempool for an hour while
--                        blocks keep arriving every ten minutes. Congestion and fee market, not
--                        protocol cadence.
--
-- As with the other timings, these are an APPROXIMATE snapshot. Mempool time is the most volatile
-- number in the whole table - it is a fee market, so treat it as an order of magnitude, not a fact.

ALTER TABLE best_cryptocurrencies
    ADD COLUMN website_url          VARCHAR(255),
    ADD COLUMN mempool_time_seconds INTEGER;

UPDATE best_cryptocurrencies AS c
SET website_url          = v.url,
    mempool_time_seconds = v.mempool
FROM (VALUES
    -- privacy coins
    ('XMR',  'https://www.getmonero.org',      120),
    ('ZEC',  'https://z.cash',                   75),
    ('ARRR', 'https://pirate.black',             60),
    ('BEAM', 'https://beam.mw',                  60),
    ('GRIN', 'https://grin.mw',                  60),
    ('FIRO', 'https://firo.org',                300),
    ('DASH', 'https://www.dash.org',            150),
    ('DCR',  'https://decred.org',              300),
    ('SCRT', 'https://scrt.network',              6),
    ('ROSE', 'https://oasisprotocol.org',         6),
    ('ZEN',  'https://www.horizen.io',          150),
    ('LTC',  'https://litecoin.org',            150),
    -- transparent majors
    ('BTC',  'https://bitcoin.org',            1800),
    ('ETH',  'https://ethereum.org',             15),
    ('ADA',  'https://cardano.org',              20),
    ('SOL',  'https://solana.com',                1),
    ('DOT',  'https://polkadot.network',          6),
    ('AVAX', 'https://www.avax.network',          2),
    ('ATOM', 'https://cosmos.network',            6),
    ('LINK', 'https://chain.link',               15),
    ('POL',  'https://polygon.technology',        2),
    ('TRX',  'https://tron.network',              3),
    ('XRP',  'https://xrpl.org',                  4),
    ('XLM',  'https://stellar.org',               5),
    ('DOGE', 'https://dogecoin.com',             60),
    ('BCH',  'https://bitcoincash.org',         600),
    ('ALGO', 'https://algorand.co',               3),
    ('XTZ',  'https://tezos.com',                 8),
    ('FIL',  'https://filecoin.io',              30),
    ('APT',  'https://aptosfoundation.org',       1),
    ('SUI',  'https://sui.io',                    1),
    ('NEAR', 'https://near.org',                  1),
    ('ARB',  'https://arbitrum.io',               1),
    ('OP',   'https://www.optimism.io',           2),
    ('UNI',  'https://uniswap.org',              15),
    ('AAVE', 'https://aave.com',                 15),
    ('MKR',  'https://makerdao.com',             15),
    ('COMP', 'https://compound.finance',         15),
    ('CRV',  'https://curve.fi',                 15),
    ('LDO',  'https://lido.fi',                  15),
    ('GRT',  'https://thegraph.com',             15),
    ('INJ',  'https://injective.com',             1),
    ('SEI',  'https://www.sei.io',                1),
    ('TIA',  'https://celestia.org',              6),
    ('HBAR', 'https://hedera.com',                3),
    ('VET',  'https://www.vechain.org',          10),
    ('ICP',  'https://internetcomputer.org',      2),
    ('ETC',  'https://ethereumclassic.org',      13),
    ('ZIL',  'https://www.zilliqa.com',          30),
    ('RVN',  'https://ravencoin.org',            60)
) AS v(symbol, url, mempool)
WHERE c.symbol = v.symbol;

ALTER TABLE best_cryptocurrencies
    ALTER COLUMN website_url SET NOT NULL,
    ALTER COLUMN mempool_time_seconds SET NOT NULL;
