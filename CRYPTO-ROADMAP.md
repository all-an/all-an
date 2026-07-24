# Crypto Dashboard Roadmap

A privacy-first ranking of cryptocurrencies, served as a front page → dashboard flow. It exists to
demonstrate Angular (components, signals, directives, routing) and Java (Flyway, JPA, records,
enums, layered packages) on top of the existing Spring Boot + Postgres + Docker setup.

---

## 1. The editorial angle

This is **not** a market-cap ranking. Monero is #1 because the list is ordered by *privacy
guarantees*, and that ordering is the whole point of the demo. A market-cap table is a commodity;
an opinionated one has a thesis worth defending.

Three tiers, in order of what the thesis says matters: privacy first, then whether you can actually
spend the thing — does it settle now, and does it cost anything to move.

| Rank | Tier | Ordered by |
|---|---|---|
| 1–12 | Privacy coins | How strong and how *default* the privacy is |
| 13–16 | Feeless / instant | Zero fee first, then time to finality |
| 17–54 | Transparent majors | Time to finality, ties broken on fee |

Tiers 2 and 3 arrived in `V6` and `V7`. Before them, everything below the privacy coins sat in one
block ordered "roughly by relevance", which is market cap with a thumb on it — the exact thing the
first paragraph disclaims. The ordering rule now sorts on the two columns it names, so a reader can
check it by eye.

**What this costs Bitcoin.** It finishes 54th of 54, last on the list it used to head at 13: about
an hour to practical finality at roughly $1.50, against a feeless coin that settles in under a
second. That is the thesis working rather than a bug. Bitcoin still leads on relevance and on
security budget; this table does not rank on either, and a ranking that quietly protected its most
famous entry would not be worth publishing.

Note that the privacy tier is *not* speed-sorted — Monero is #1 at 1200s while Nano settles in
under one. That is the hierarchy doing its job: privacy outranks speed, so a slow private coin
still beats a fast transparent one. Speed only decides positions *within* the tiers below it.

---

## 2. Why Monero ranks above Zcash

The honest case, because a demo that overstates it is worse than one that doesn't:

| | Monero | Zcash |
|---|---|---|
| Privacy | **Mandatory** — every transaction | **Optional** — shielded (`z`) or transparent (`t`) |
| Anonymity set | Every transaction on the chain | Only the shielded pool |
| Trusted setup | Never required one | Sprout required one; removed in Halo 2 (NU5, 2022) |
| Fungibility | Strong — coins are interchangeable | Partial — transparent coins can be tainted or blacklisted |

**The core argument is defaults, not cryptography.** Zcash's zk-SNARKs are, per transaction,
arguably the stronger primitive: they hide the transaction graph outright, while Monero's ring
signatures are probabilistic — a true spend is hidden among a ring of decoys, and statistical
analysis has degraded the privacy of older Monero transactions.

But privacy that is opt-in is privacy most people don't get. In practice the great majority of Zcash
transactions have been transparent, which leaves the shielded pool small — and a small anonymity set
weakens the protection even for those who *do* shield. Moving between `t` and `z` addresses leaks
metadata at the boundary. Monero has no boundary: there is one transaction type and everyone is in
the same set.

That's the thesis of the `privacy` and `privacy_by_default` columns. **`privacy_by_default` is the
most important column in the table** — it's what separates "has privacy features" from "is private".

Fair to Zcash: Halo 2 removed the trusted setup, so that criticism is historical. Monero has its own
roadmap here (full-chain membership proofs would replace ring signatures and close the statistical
gap).

---

## 3. Schema — `best_cryptocurrencies`

Requested columns first, as specified:

| Column | Type | Notes |
|---|---|---|
| `privacy` | enum | `MANDATORY` / `OPTIONAL` / `NONE` — **first column**, Monero is `MANDATORY` |
| `privacy_kind` | enum | `RING_SIGNATURES_RINGCT`, `ZK_SNARKS`, `MIMBLEWIMBLE`, `COINJOIN`, `CONFIDENTIAL_TRANSACTIONS`, `TEE_ENCRYPTED_STATE`, `NONE` |
| `name` | varchar | |
| `mempool_time_seconds` | int | Time waiting **unconfirmed** before pickup — see below |
| `transaction_time_seconds` | int | Typical time to practical finality |
| `transaction_fee_usd` | numeric(12,4) | Approximate — see *Data honesty* |
| `website_url` | varchar | Official project page; the name in the table links here |

### The three time columns are three different things

Easy to conflate, so worth stating plainly:

```
broadcast ──[ mempool_time ]──▶ 1st confirmation ──...──▶ [ transaction_time ] = settled
                                     ▲
                              block_time = cadence between blocks
```

- **`mempool_time_seconds`** — how long a transaction sits unconfirmed waiting for a miner or
  validator to pick it up. A **fee market**, not a protocol cadence: an under-priced Bitcoin
  transaction waits an hour while blocks keep arriving every ten minutes.
- **`block_time_seconds`** — how often blocks arrive. A protocol constant.
- **`transaction_time_seconds`** — total time to practical finality.

Mempool time is the most volatile figure in the table. Treat it as an order of magnitude.

### Suggested additional columns

You asked for more ideas. Ranked by how much each earns its place:

1. **`privacy_by_default`** (bool) — the Monero-vs-Zcash differentiator. Non-negotiable.
2. **`symbol`** (varchar) — XMR, ZEC. Needed for any sane UI.
3. **`rank`** (int) — the editorial position, and the table's default sort.
4. **`fungibility`** (enum `STRONG`/`PARTIAL`/`NONE`) — the practical consequence of privacy.
5. **`trusted_setup_required`** (bool) — a sharp technical distinction, one glance.
6. **`anonymity_set`** (varchar) — "entire chain" vs "shielded pool only" vs "none".
7. **`consensus`** (varchar) — PoW / PoS / other.
8. **`launch_year`** (int) — free context, sortable.
9. **`block_time_seconds`** (int) — distinct from finality; interesting next to it.
10. **`supply_cap`** (numeric, nullable) — null means uncapped, which is itself informative.
11. **`smart_contracts`** (bool) — explains why some chains skip privacy entirely.
12. **`notes`** (text) — the one-line "why it's here", good for a detail row.

### Price — maintained by hand

No live API. `price_usd` is a real column you update daily, and it needs **three** columns, not one:

| Column | Type | Who sets it |
|---|---|---|
| `price_usd` | numeric(18,6), nullable | You. Null = not filled in yet, which is honest rather than a fake `0` |
| `price_date` | date, nullable | **You** — the day the price refers to |
| `price_updated_at` | timestamp, nullable | The server, on every write |

`price_date` and `price_updated_at` look redundant and are not. They answer different questions:

- **`price_date`** — *what day is this price for?* You might enter Monday's closing price on
  Wednesday. Only you know which day it belongs to, so you supply it.
- **`price_updated_at`** — *when did this row last change?* An audit fact. The server stamps it, so
  it cannot be wrong or backdated.

Keeping both means the dashboard can show the price *as of* a date while still revealing that nobody
has touched the row in a week. Collapse them into one and you lose the ability to tell "an old price,
correctly labelled" from "a stale price nobody updated" — which is exactly the distinction that
makes hand-maintained data trustworthy.

One write endpoint: `PUT /api/cryptocurrencies/{symbol}/price`, taking `price_usd` and `price_date`,
stamping `price_updated_at` itself.

Deliberately **excluded**: `market_cap`. It's derivable (price × circulating supply) and would need
a second hand-maintained number to stay right. Not worth the upkeep.

---

## 4. Auth — admin login and the registration switch

An admin account, and a switch the admin flips to open or close registration. When it's off, nobody
can register and the register button disappears.

### `register_settings`

A single-row table (`CHECK (id = 1)` keeps it that way):

| Column | Notes |
|---|---|
| `registration_enabled` | The flag |
| `updated_at`, `updated_by` | Who closed registration, and when |

The flag lives in the **database**, not in `application.yml`. The admin toggles it at runtime, and it
has to survive restarts and redeploys — a config property would need a deploy to change and would
reset every time the container restarts.

### The button is not the control

This is the part that matters:

```
Angular hides the button   →  UX. Stops honest users from seeing a dead form.
Backend checks the flag    →  Security. Stops everyone else.
```

`POST /api/auth/register` **must** read `registration_enabled` and return `403` when it is false. A
hidden button changes nothing about what the server accepts — `curl -X POST /api/auth/register` does
not care what the UI rendered. If only one of the two is built, build the backend check; the hidden
button without it is security theatre.

So the flag is exposed twice, with different access:

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/settings/registration` | public | So the login page knows whether to show the button |
| `PUT` | `/api/admin/settings/registration` | `ADMIN` | The toggle |
| `POST` | `/api/auth/register` | public, **gated by the flag** | `403` when disabled |
| `POST` | `/api/auth/login` | public | |
| `POST` | `/api/auth/logout` | authenticated | |
| `GET` | `/api/auth/me` | authenticated | Current user + role, for the UI |

The public `GET` leaks only one boolean — whether registration is open — which a visitor would learn
from the page anyway.

### `users`

`id`, `username`, `password_hash` (BCrypt), `role` (`ADMIN`/`USER`), `enabled`, `created_at`.

**No seeded password in a migration.** Migrations are committed to git and readable by anyone who
clones the repo, so a hash in `V4` is a credential in your history forever. Instead the bootstrap
admin is created at startup from `ADMIN_USERNAME` / `ADMIN_PASSWORD`, and only when no admin exists.
On Render those are environment variables; locally they're compose env. If the vars are absent, no
admin is created and the app logs a warning — it never falls back to a default password.

### Session or JWT?

**Session cookie**, `HttpOnly` + `Secure` + `SameSite=Lax`. In production Spring Boot serves the
Angular bundle from the same origin, so cookies just work — no `Authorization` header plumbing, no
token in `localStorage` for an XSS to steal, no refresh-token dance. JWT is the more common demo
answer and the one interviewers expect, but for a same-origin SPA it is strictly more work and a
weaker default. In dev the `/api` proxy forwards cookies fine.

Roles are enforced with `@PreAuthorize("hasRole('ADMIN')")` on the admin endpoints — including
`PUT /api/cryptocurrencies/{symbol}/price`, since prices are now admin-maintained.

### Angular side

- `auth.service.ts` — a `currentUser` signal, `isAdmin = computed(() => user()?.role === 'ADMIN')`
- `login/` — the form; the register button renders behind `@if (registrationEnabled())`
- `authGuard` / `adminGuard` — `CanActivateFn` on `/admin`
- `*appIfRole="'ADMIN'"` — the structural directive from §6, now with something real to hide

Same rule as above: the guard and the directive are UX. Every one of them is backed by a server-side
check, because a determined user can edit the bundle in DevTools but cannot edit the backend.

---

## 5. Java — `com.allan.app.bestcryptocurrencies`

Separated classes, one responsibility each:

```
bestcryptocurrencies/
├── Cryptocurrency.java              @Entity -> best_cryptocurrencies
├── PrivacyLevel.java                enum: MANDATORY, OPTIONAL, NONE
├── PrivacyKind.java                 enum: RING_SIGNATURES_RINGCT, ZK_SNARKS, ...
├── Fungibility.java                 enum: STRONG, PARTIAL, NONE
├── CryptocurrencyDto.java           record — the API shape, decoupled from the entity
├── CryptocurrencyMapper.java        entity -> dto
├── CryptocurrencyRepository.java    JpaRepository
├── CryptocurrencyService.java       read logic, ordering, filtering
└── CryptocurrencyController.java    GET /api/cryptocurrencies
```

The entity is never returned directly — `CryptocurrencyDto` is. That keeps the JSON contract stable
when the schema changes, and it's the layering a reviewer looks for.

Endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/cryptocurrencies` | Ranked list |
| `GET` | `/api/cryptocurrencies/{symbol}` | One, or `404` |
| `PUT` | `/api/cryptocurrencies/{symbol}/price` | Daily manual price update |

Everything except the price arrives via migration and never changes at runtime — it's editorial
data, not user data. The price is the single mutable field, which keeps the write surface to exactly
one endpoint.

---

## 6. Angular — components

```
frontend/src/app/
├── front-page/          black page, centered card -> routes to /crypto
├── crypto/
│   ├── crypto-dashboard/    container: fetches, owns filter + sort state
│   ├── crypto-table/        presentational: takes rows via input(), emits sort
│   ├── privacy-badge/       presentational: colours MANDATORY vs OPTIONAL vs NONE
│   └── crypto.service.ts    HTTP
└── about-me/            stack and professional background, behind /about
```

Routes: `/` → front page, `/crypto` → dashboard, `/about` → about me. `App` becomes a shell
with `<router-outlet>` and the About me button.

### Which Angular feature does what

- **Signals** — `signal()` for raw rows, `computed()` for the filtered+sorted view. Sorting a table
  is the textbook case: change `sortKey`, the view recomputes, no subscriptions.
- **`input()` / `output()`** — signal-based component I/O, not decorators.
- **Directives** — a `appHighlightRow` attribute directive to mark `privacy_by_default` rows; later
  a structural `*appIfPrivate` to filter the DOM.
- **Control flow** — `@if` / `@for` with `track`, `@empty`.
- **`@defer`** — for the chart in phase 5.

---

## 7. Phases

| Phase | Deliverable |
|---|---|
| **1** | Flyway + `best_cryptocurrencies` schema + 50-row seed |
| **2** | Java package + `GET /api/cryptocurrencies` |
| **3** | Front page (black, centered card) + routing |
| **4** | Dashboard table with signal-driven sort/filter + privacy badge |
| **5** | Auth: users + `register_settings`, login, admin toggle, guards |
| **6** | Inline price editing in the table, `@defer`-loaded chart, privacy directive |

Phases 1–4 are a working demo on their own. Auth (5) is what makes the price endpoint safe to
expose, so it lands before inline editing.

For phase 6, the natural finish is editing the price straight from the dashboard row rather than
curling the endpoint each morning — a `model()` signal on the cell, `PUT` on blur with the date.
Until then the endpoint (or plain SQL) does the job.

---

## 8. Data honesty

**The seeded fees and times are approximate, hand-curated, and dated.** They are illustrative demo
data captured as a snapshot — not live market data, and they will drift. Fees especially swing with
network congestion; a "typical" fee is a judgement call, not a fact.

The same applies to `price_usd`, which you fill in by hand. The mitigation is the pair of date
columns: show the price *as of* `price_date`, and let `price_updated_at` betray a row nobody has
touched in a week. A stale price labelled stale is fine; a stale price presented as current is not.

Seeded prices are `NULL` on purpose. A placeholder `0` would render as a real number in the table
and be a lie; `NULL` renders as "—" and tells the truth until you fill it in.

The UI should say plainly that fees and times are an approximate snapshot, and that prices are
manually maintained. That's one line under the table and it's the difference between a demo that's
honest and one that quietly misleads.

The *privacy* columns are different: they describe protocol design, not market state, so they age
well and are the part of this table worth trusting.
