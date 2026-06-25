## Sector Backtest — Plan

Add a feature that runs the existing calibration-by-hindsight backtest model across every ticker in a chosen sector and shows a ranked results table.

### 1. Edge function: `supabase/functions/sector-backtest/index.ts`

Inputs: `{ sector: string, source?: "curated" | "yahoo", maxTickers?: number }`

Behavior:
- Resolve the universe:
  - `curated` (default, fast, reliable): reuse the same hardcoded `SECTOR_UNIVERSES` map already used by `hot-stocks`, plus add a few extra sectors the user mentioned (Semiconductors, Software, Banks, Pharma) as curated lists of 15–40 large caps.
  - `yahoo`: call Yahoo's screener with cookie/crumb auth (same pattern used by other yahoo functions) for a true sector (e.g. `Semiconductors`), filter to US major exchanges (NMS/NYQ) + min market cap $500M, cap at `maxTickers` (default 40).
- For each ticker in the universe, fetch ~6 months of daily closes from FMP (`/stable/historical-price-eod/full?symbol=...` — same endpoint `fetch-stock-data` already uses). Run in parallel batches of 8 with a small delay to stay under rate limits.
- Return `{ sector, universe: string[], prices: Record<ticker, { dates: string[], closes: number[] }>, failed: string[] }`. No heavy math server-side — the browser runs the existing `backtest()` to keep edge-function CPU usage low (same pattern as `hot-stocks`).
- `verify_jwt = false`, CORS, FMP_API_KEY from env.

### 2. Client lib: `src/lib/sector-backtest.ts`

- `runSectorBacktest(sector, source)`:
  1. Invoke the edge function via `supabase.functions.invoke`.
  2. For each ticker, build the `StockPoint[]` array and call the existing `backtest(points)` from `src/lib/backtest.ts`.
  3. Yield progress (`onProgress(done, total, currentTicker)`) so the UI can render a progress bar.
  4. Collect a row per ticker: `ticker, currentPrice, winningWindow, annualizedReturn, predictedTodayError, rSquared, forecastPct, forecastDirection, confidenceScore, regimeWarning`.
  5. Return sorted results (default: by `confidenceScore` desc, tiebreak `forecastPct` desc).

### 3. UI: `src/components/SectorBacktest.tsx`

- Modal (matches `BacktestModal` styling — dark, mono, terminal feel).
- Sector dropdown listing curated sectors + a "Yahoo: Semiconductors / Software / Biotech / Banks" group for dynamic universes.
- "Run Backtest" button → shows progress bar (`X / Y · current ticker`) while client iterates.
- Results table with sortable columns: Ticker · Price · Winner Window · Annual Return · Forecast (30d) · R² · Confidence · Regime. Color coding identical to existing `CalibrationTable`. Click a row → closes the modal and triggers the parent's `onSearch(ticker)` so the user can drill into that symbol's full chart.
- "What is it?" tooltip following the established educational-layer pattern.

### 4. Wiring

- Add a `<SectorBacktest />` trigger button in `src/components/Sidebar.tsx` next to the existing backtest / hot-stocks buttons.
- Pass `onSelectTicker={onSearch}` from the parent page (same callback the ticker search uses).

### 5. Caveats / limits

- Hard cap at 50 tickers per run (≈ 30–60s wall time including FMP fetches).
- Failed-fetch tickers shown in a small "Skipped" section below the table.
- No new DB tables — results are in-memory per run. We can add a `sector_backtest_results` cache table later if the user wants persistence/historical comparisons.

### Files

Create:
- `supabase/functions/sector-backtest/index.ts`
- `src/lib/sector-backtest.ts`
- `src/components/SectorBacktest.tsx`

Edit:
- `src/components/Sidebar.tsx` (add trigger button + modal state)

No changes to existing backtest math, DB schema, or other components.
