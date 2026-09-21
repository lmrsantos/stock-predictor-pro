# Quant Moment — standalone build handover

This document is written for the agent of the NEW project that will serve
`quant-moment.com`. That project starts empty. Read this project
(`stock-predictor-pro`) read-only with `cross_project--checkout_project`, then
copy the files listed below into the new project verbatim. Do not re-derive the
math — it is validated.

## Product

One mobile-first screen. Search a ticker, get: live quote, a plain-language
read, chart with forecast band, four questions, support/resistance + cycle
projection, four fundamentals, followed tickers, and "Worth a look today".

Rules inherited from the existing app (non-negotiable):

- Never print the words buy / sell / expect-to-rise style advice. The product's
  value is withholding confidence.
- Every card fails independently, has a skeleton and a written empty state.
- No horizontal scroll at 375px.
- A forecast never renders without its expected-move band.
- Never invent data. Empty state with a written reason instead.
- Dark stock-app skin, green/red moves, live quotes on every price shown.

## Files to copy

Pages / UI
- `src/pages/Moment.tsx` (becomes the root route `/`)
- `src/pages/MomentAuth.tsx` (becomes `/auth`)
- `src/pages/Terms.tsx`, `src/pages/Disclaimer.tsx` — keep only the Quant
  Moment branches, drop the QuantForecast copy and the Pro/Elite references
- `src/components/moment/*` (all 8 files)
- `src/components/DisclaimerBar.tsx`, `src/components/InfoTooltip.tsx`

Hooks
- `src/hooks/useMomentSymbol.ts`, `useMomentQuotes.ts`, `useMyTickers.ts`,
  `useMomentSkin.ts`, `use-mobile.tsx`, `use-toast.ts`

Compute layer (copy verbatim, no edits)
- `src/lib/` — `regression.ts`, `backtest.ts`, `support-resistance.ts`,
  `base-rate-pipeline.ts`, `conditioned-base-rates.ts`, `moment-read.ts`,
  `monte-carlo.ts`, `model-validation.ts`, `stock-data.ts`,
  `yahoo-finance.ts`, `trend-term-structure.ts`, `setup-detector.ts`,
  `hold-window.ts`, `regime-signal.ts`, `types.ts`, `utils.ts`

Edge functions
- `moment-quotes`, `fetch-stock-data`, `fetch-symbol-metadata`,
  `fetch-financials`, `fetch-extended-hours`, `search-ticker`, `hot-stocks`
- All keep `verify_jwt = false` in `config.toml` except the billing ones.
- Do NOT copy: `quant-agent`, `chat-insights`, `portfolio-advisor`,
  `geopolitical-sentiment`, `cache-linkages`, `mcp`, `sector-backtest`,
  `fetch-ipo-*`, `fetch-macro-*`, `reviewer-login`.

PWA
- `public/manifest.webmanifest` with `"id": "/"`, `"scope": "/"`,
  `"start_url": "/"`, plus `public/icon-192.png`, `public/favicon.png`
- `src/components/moment/UpdateBanner.tsx` handles new-version detection.

Remove every link back to quant-forecast.com. This app is self-contained.

## Database (new backend)

Tables needed by the copied code: the price/metadata cache tables read by
`fetch-stock-data` / `fetch-symbol-metadata` / `hot-stocks`, plus:

```
check_wallets   user_id pk, checks_remaining int default 0, created_at
check_ledger    id, user_id, delta int, reason text, stripe_session_id, created_at
```

RLS: owner-only select on both; writes only from edge functions via
service_role. GRANT select to `authenticated`, GRANT all to `service_role`.

## Metering and paywall

- Anonymous: 5 checks total, counted in `localStorage` (`qm_anon_checks`).
  On the 6th, show the paywall card — no free account allowance, no signup
  bonus. Signing in does not grant free checks.
- Signed in: every symbol lookup calls an edge function `consume-check` which
  decrements `check_wallets.checks_remaining` inside a single SQL function and
  returns `{ allowed, remaining }`. Zero remaining → paywall.
- Purchase: one-off pack, **$9.90 for 50 checks**, repeatable. Not a
  subscription — no recurring charge, no portal needed.
- Use Lovable built-in Stripe payments (`payments--enable_stripe_payments`) in
  the new project. One Stripe price, one-time payment mode. The webhook credits
  `+50` to `check_wallets` and writes a `check_ledger` row keyed by the Stripe
  session id so a replayed webhook cannot double-credit.
- Show remaining checks in the header once signed in, and "50 checks — $9.90"
  on the paywall card with no dark patterns.

## Domain

`quant-moment.com` is already owned. Connect it to the new project once the
first build is up.
