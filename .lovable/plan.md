# Better 30-Day Projection — Staged Upgrade

Goal: make the 30d projection meaningful for the portfolio (and reuse it in the backtest modal). Ship in three stages so we can measure each lever independently against the existing Backtest 30d tool.

## Stage 1 — Fix the inputs (EWMA weighting)

Replace the equal-weight OLS in `src/lib/regression.ts` (Enhanced-V2) with an **exponentially-weighted** regression.

- Weight each daily close by `w_i = λ^(N-i)` with a half-life of ~45 trading days (λ ≈ 0.9847). Recent prices dominate; year-old prices contribute ~10%.
- Same slope/intercept output shape — no downstream changes needed.
- Applies automatically to: main chart projection, `Portfolio.tsx` 30d proj columns, `PortfolioBacktest.tsx`, and Sector Chart trendlines.

Expected impact: the biggest single win. Handles regime shifts (earnings pop, breakout, breakdown) without changing the UI.

## Stage 2 — Honest projection bands (drift + volatility)

Add a **log-return** model alongside the trend line:

- Compute daily log returns from EWMA-weighted history.
- Extract `μ` (drift) and `σ` (volatility).
- Project 30d forward as a distribution: `P20 / P50 / P80` price cones.

UI changes:
- Portfolio page: 30d Proj column shows `P50` value with a small `±` range chip (P20–P80).
- Backtest modal: draw the cone as a shaded band and check whether the actual price landed inside it (a "calibration hit" metric, not just point error).
- Main chart: optional toggle to show the 30d cone at the right edge.

Why this matters: a single-point 30d forecast is misleading. A cone that says "there's an 80% chance we land between $180–$215" is defensible and matches how real forecasts are presented (and it's consistent with our disclaimer stance).

## Stage 3 — Ensemble with momentum + macro regime

Blend three signals into the final 30d projection:

1. **EWMA trend** (Stage 1) — long-horizon direction.
2. **Short-momentum slope** — 20d and 60d OLS slopes, weighted average.
3. **Macro regime bias** — pull the current regime from `MacroIndicatorStrip` cache: Risk-on tilts the drift up, Risk-off tilts it down, Caution leaves it neutral. Small bias (e.g. ±0.1σ/day), not a hard override.

Blend weights start at 50% trend / 30% momentum / 20% macro, exposed as constants so we can tune after backtesting.

Backtest modal gains a **model comparison** view: for the same as-of date, show projection error for (a) old linear, (b) Stage 1 EWMA, (c) Stage 3 ensemble — so we can see the lift.

## Technical Details

**Files touched:**
- `src/lib/regression.ts` — add `ewmaRegression()`, `logReturnBands()`, `ensembleProjection()`; keep old functions available for the backtest comparison view.
- `src/pages/Portfolio.tsx` — swap 30d call sites, add `±` range chip in the 30d Proj column.
- `src/components/PortfolioBacktest.tsx` — draw cone band, add hit-rate metric, add model comparison toggle.
- `src/pages/Index.tsx` main chart — optional cone toggle at the right edge.
- New: `src/lib/macro-regime.ts` — thin reader that pulls the current regime label from the existing `fetch-macro-indicators` cache (no new edge function).

**Math (all client-side, cheap):**
- EWMA slope: weighted least squares, closed form.
- Log-return drift/vol: `μ = mean(log(P_t/P_{t-1}))`, `σ = std(...)`, both EWMA-weighted.
- 30d cone: `P_0 · exp(30μ ± z · σ · √30)` for z ∈ {−0.84, 0, +0.84} → P20/P50/P80.
- Ensemble: `slope_final = 0.5·slope_ewma + 0.3·slope_momentum + 0.2·macro_bias·σ`.

**No backend changes.** All three stages run in the browser on data we already fetch.

## Rollout

Stage 1 lands first and I'll pause so you can eyeball the numbers in Backtest 30d. If projection error drops meaningfully, we continue with Stages 2 and 3.