# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Sandivisi/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Sandivisi/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: reads a sealed DefiLlama snapshot of 758 protocols, ranks every rankable pre-token protocol by an implied value, and hands in a dashboard a reader can actually use — a board, a detail view for each protocol, filters, and a concrete farm plan per row.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

---

# Token Radar — token-radar-01

A token launch radar: it reads a sealed DefiLlama snapshot of 758 protocols,
ranks every rankable pre-token protocol by an implied value, and hands in a
dashboard a reader can actually use — a board, a detail view for each
protocol, filters, and a concrete farm plan per row.

## The model (radar-2)

Implied value is this entry's own claim, computed only from the snapshot's
fields — TVL, 7-day change, listing date, category, chains. No protocol name
is ever special-cased.

```
implied = round( tvl_usd × base × growth × maturity × chains )
```

| Factor | Formula | Range |
| --- | --- | --- |
| **Base** | Median `mcap_usd / tvl_usd` over the live-token protocols in the same snapshot (CEX excluded, ratios outside (0, 20] dropped), clamped to [0.05, 0.50]. The market prices live tokens against the TVL they secure; the median is the calibration. On this snapshot: **0.236x** from 117 live protocols. | 0.05–0.50 |
| **Growth** | `1 + clamp(change_7d, −50, 150) / 100 × 0.6` | 0.70–1.90 |
| **Maturity** | `0.70 + min(age_days, 1460) / 1460 × 0.30`, where age is days since DefiLlama first listed the protocol — how long it has run with no token on record. Unknown listing date uses 365 days. | 0.70–1.00 |
| **Chains** | `min(1 + 0.05 × ln(chain count), 1.25)` | 1.00–1.25 |

Worked example: a $1B-TVL protocol, flat over 7 days, ~1 year old, on
2 chains is worth about `1e9 × 0.236 × 1.00 × 0.775 × 1.035 ≈ $189M`.

## Coverage

- **Board: 198 rows** — all 40 watchlist slugs (TVL ≥ $50M, no token on
  record, not a wrapped/staked/bridged product) plus all 158 other rankable
  pre-token protocols below the floor. The watchlist is a floor, never a
  ceiling: a small protocol growing fast is exactly what a radar exists to
  find early.
- **Rankable** means: records no token (`mcap_usd`, `gecko_id` and `symbol`
  all null), and not a wrapped, staked or bridged product of a token that
  already trades — not a Bridge / Canonical Bridge / Liquid Staking /
  Liquid Restaking / Restaked BTC / CEX category, no whole word wrapped,
  staked or staking in its name, no exchange's name at the start, and no
  version marker (a name ending in V2 / 2.0 is a pool of another protocol,
  not a launch of its own). WBTC is Bitcoin on Ethereum and Binance staked
  ETH is ETH in Binance's staking product; neither is a protocol still
  waiting on a launch of its own.
- **Live tokens set aside:** the 24 largest live-token protocols by market
  cap are shown in their own view with the market's own values — and their
  median mcap/TVL ratio is what calibrates the board.
- **"Records no token"** is DefiLlama's record, never proof a protocol has
  none: a protocol on the list may still have a token its record does not
  carry. Implied value does not predict whether or when a token is issued.

## Farm plans

Every row carries a 7-step plan derived from its own record (category,
chains, TVL, age): a fresh wallet, the category's main action with a capital
tier ($50–$250 by TVL), a second qualifying action, a weekly action, a hold
of 30–60 days, a weekly points check (claim only from a link the protocol
itself publishes — never pay to claim), and a farm log with an exit plan.
Each step states its cost and its time. The dashboard regenerates the same
plan from the same derivation, so the page and `board.json` always agree —
and the page recomputes each row's implied value and says so in the detail
view.

## The dashboard

A static page, no network, no framework. Dark radar-room theme.

- **Board:** sortable by rank/implied value, name, TVL, 7-day growth and
  age; top-3 "farm first" spotlight; watchlist and hot (+10% in 7d) tags.
- **Filters:** search (name, category, chain), category, chain, 7-day
  growth (growing / hot / falling), minimum TVL, watchlist-only. State is
  kept in the URL hash, so a filtered view is a link.
- **Detail:** click any row — model breakdown with every multiplier,
  the recomputed value, and the 7-step farm plan.
- **Views:** Pre-token board, Live token (the calibration set), Method
  (the formula, the calibration and the caveats, in plain words).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes
`board.json`, `data.js`, copies `dashboard/` and `screenshots/`, and writes
`dossier.json` with `buildDossier` from `vendor/makefun-board.ts`.

## Layout

```
main.ts                  entrypoint
lib/model.ts             the radar-2 model, farm plans, snapshot parsing
vendor/makefun-board.ts  make.fun dossier library (unchanged)
dashboard/               index.html, app.css, app.js (the page)
screenshots/             1-board.png, 2-detail.png, 3-filtered.png
```

## License

MIT. See `LICENSE`.
