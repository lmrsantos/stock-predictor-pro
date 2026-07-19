# Cross-Sector Linkages Integration Plan

Three surfaces, one shared computation. Runs the linkage test suite (validated Granger-style leader→follower pairs from `src/lib/cross-sector-linkages.ts`) once and reuses the output.

## 1. Shared linkage computation + cache

**New file `src/lib/run-linkages.ts`** — orchestrator:
- Fetches all 13 curated sectors via existing `sector-backtest` edge function (parallel batched).
- Builds sector composites + macro proxies:
  - OIL → USO close series
  - GOLD → GLD
  - US10Y → ^TNX (or IEF as fallback)
  - XLY_XLP_RATIO → Consumer Discretionary composite − Consumer Staples composite
- Calls `runLinkageTests()`, returns `LinkageResult[]`.
- Caches full result in `localStorage` (`qf.linkages.v1`) with 24h TTL.
- Also POSTs a compact summary to a new edge function `cache-linkages` so QuantAgent (server-side) can read it.

**New table `public.linkage_cache`** (single-row):
```
id (int PK, default 1), payload jsonb, updated_at timestamptz
```
RLS: `SELECT` for `anon` + `authenticated`; `INSERT/UPDATE` for `authenticated` only. Service role full.

**New edge function `cache-linkages`**: accepts POST `{ payload }` from authenticated browser, upserts row 1. GET returns current payload. No JWT required for GET.

## 2. Linkages diagnostic panel (new page)

**Route `/linkages`** → `src/pages/LinkagesPage.tsx`:
- Header + "Run linkage tests" button.
- Progress bar while fetching 13 sectors + macro (shows current sector).
- Result table (sortable): Leader → Follower | Channel | Best Lag | Coef | Sign | p (BH-adjusted) | Split-half agree | ΔR² | Validated ✓/✗.
- Validated rows highlighted green; regime-sign-flip rows tagged.
- "Last updated" timestamp; reuses 24h cache if present.
- Sidebar link "Linkages" under existing analysis tools.

## 3. QuantAgent context injection

`supabase/functions/quant-agent/index.ts`:
- On each `send_message`, fetch `linkage_cache` row (service-role client, single query).
- Filter validated linkages where `follower === ticker's primary sector` OR `leader === primary sector`.
- Append a "VALIDATED CROSS-SECTOR LINKAGES" section to the system prompt listing up to 6 relevant pairs with channel, lag, sign, coef. Prompt instructs QuantAgent to reference them when discussing catalysts/risks.
- Silently skip if cache is empty or stale (>7d).

Add `primarySectorOf` lookup using `src/lib/sector-universes.ts`'s map (mirror it into the edge function since edge functions can't import from `src/`).

## 4. Hot Stocks scoring tilt

`src/components/HotStocks.tsx`:
- After fetching `symbolData`, also load linkages from localStorage cache (do NOT trigger a fresh run — user must have visited /linkages once, or we fall back to no tilt).
- Compute "leader momentum" for each validated leader = last-5-day mean log return of that leader's composite/macro series (derive composites from `symbolData` closes; macro series unavailable in Hot Stocks context → skip macro-led links there).
- For each candidate ticker with primary sector `S`, sum `sign × leader_momentum × |coef|` across validated linkages where `follower === S`. Normalize to a tilt factor `t ∈ [0.85, 1.15]`.
- Multiply `confidence *= t` before the BUY threshold check. Tag stock with `linkageTilt` for UI hover ("Semis leader momentum +2.1% → +8% conf boost").

## Technical notes

- Macro fetch: extend `sector-backtest` edge function to accept `source: "macro"` with symbols param, OR add a tiny new `fetch-macro-series` function returning USO/GLD/^TNX 1y closes via Yahoo. Prefer the latter to keep sector-backtest single-purpose.
- `runLinkageTests` on ~13 sectors × ~22 pairs × 10 lags is fast (<1s browser).
- Total fetch cost: 13 sector calls (each returns ~10-30 tickers of 1y daily) + 1 macro call. Batch with `Promise.all`, throttle to 4 concurrent.
- No AE changes — tilt is a post-hoc confidence multiplier, keeping the AE pipeline intact.

## Files touched

New:
- `src/lib/run-linkages.ts`
- `src/pages/LinkagesPage.tsx`
- `supabase/functions/cache-linkages/index.ts`
- `supabase/functions/fetch-macro-series/index.ts`
- migration: `linkage_cache` table + RLS + GRANTs

Modified:
- `src/App.tsx` — add `/linkages` route
- `src/components/Sidebar.tsx` — nav link
- `src/components/HotStocks.tsx` — apply linkage tilt post-AE
- `supabase/functions/quant-agent/index.ts` — inject linkage context

## Build order

1. Migration + `cache-linkages` + `fetch-macro-series` edge functions.
2. `run-linkages.ts` orchestrator.
3. Linkages page + route + nav.
4. QuantAgent context injection.
5. Hot Stocks tilt.
6. Manual verification: run /linkages once, check QuantAgent references a linkage on a Semis ticker, check Hot Stocks tilt appears in console log.

Approve to proceed.
