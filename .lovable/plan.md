# Launch Plan — Subscriptions + Cost Control

Goal: launch the terminal as a freemium SaaS with paid tiers, while keeping tight control over upstream API spend (FMP, Yahoo Finance, Anthropic, Lovable AI) so a viral day can't bankrupt you or break the service.

---

## 1. Subscription Tiers

| Feature | Free | Pro ($19/mo) | Elite ($49/mo) |
|---|---|---|---|
| Regression chart (any ticker) | ✅ | ✅ | ✅ |
| Forecast horizons | 30d only | 30 / 90 / 180d | All + custom |
| Symbol Backtest | 3 / day | Unlimited | Unlimited |
| Sector Backtest | ❌ | 5 / day | Unlimited |
| Hot Stocks | Aggressive only, top 5 | All 3 risk tiers | All + alerts |
| Cycle Analysis | ❌ | ✅ | ✅ |
| Portfolio Advisor | View only | Full | Full + rebalance alerts |
| QuantAgent chat | 5 msgs/day | 50/day | 500/day |
| Data export (CSV) | ❌ | ✅ | ✅ + API access |

Annual pricing: 2 months free (Pro $190/yr, Elite $490/yr).

---

## 2. Build Order (3 phases)

**Phase A — Paywall infrastructure (week 1)**
1. Enable Stripe payments (built-in, Lovable-managed, no Stripe account needed).
2. Create products: Pro monthly/yearly, Elite monthly/yearly.
3. DB tables: `subscribers` (user_id, tier, status, current_period_end), `usage_counters` (user_id, feature, count, day).
4. Edge function `check-entitlement` → returns `{ tier, limits, usageRemaining }`.
5. Edge function `track-usage` → increments counter, returns 429 if over limit.
6. Front-end `useEntitlement()` hook, `<PaywallGate feature="...">` wrapper.

**Phase B — Pricing + auth polish (week 2)**
1. `/pricing` page with 3 tier cards + FAQ.
2. Upgrade CTA in sidebar when limit hit.
3. `/account` page: current plan, manage subscription (Stripe portal), usage meters.
4. Email/password + Google sign-in (already wired); require auth for Pro features.

**Phase C — Cost controls (week 2–3, see §3).**

---

## 3. Upstream API Cost Controls — What You Need to Watch

This is the part that protects your margins. Each upstream has different risk:

### 3a. FMP (Financial Modeling Prep)
- **Risk:** rate-limited plan. Backfill currently hits ~124 symbols every 6h.
- **Controls to add:**
  - Daily call counter in DB (`api_usage` table, key=`fmp`, day=today).
  - Hard cap in `backfill-prices` edge function: `if (today_calls > MAX) skip`.
  - Set `MAX` to ~80% of your FMP plan limit.
  - Alert (email via Resend) when 90% reached.
- **What you control manually:** the `MAX` env var per plan tier.

### 3b. Yahoo Finance (unofficial)
- **Risk:** no contract, IP bans if abused. Used as fallback + ticker search.
- **Controls to add:**
  - In-memory + DB cache: 15 min for quotes, 6h for historical, 24h for fundamentals.
  - Per-IP rate limit on `search-ticker` and `fetch-stock-data` (10 req/min).
  - Circuit breaker: if Yahoo returns 429/403 → pause calls 30 min, serve from cache.

### 3c. Anthropic (Claude — quant-agent, portfolio-advisor, geopolitical-sentiment)
- **Risk:** highest $ per call. Already hit 429s. This is where users can burn you fastest.
- **Controls to add:**
  - Per-user message counters (already in tier table: 5/50/500 per day).
  - Global daily $ cap: track input+output tokens per call, sum in `api_usage`. Hard stop at $X/day.
  - Use cheaper model (Haiku) for free tier, Sonnet for Pro, Opus for Elite.
  - Cache geopolitical-sentiment + market-update results 30–60 min (already partially done).

### 3d. Lovable AI Gateway
- Same pattern as Anthropic. Free monthly allowance (40 cr Free/Pro plan, 20 cr Business). Buy top-ups in Lovable settings.
- Monitor via Lovable's credit dashboard; mirror counter in your `api_usage` so you can throttle BEFORE Lovable does.

### 3e. Edge function CPU (Supabase)
- **Risk:** already hit "CPU exceeded" with hot-stocks AE training. Solved by moving AE to browser.
- **Rule going forward:** any new heavy compute → run in browser, not edge.

---

## 4. The Master Control Panel (Admin-only page)

Build `/admin` (gated by `has_role(user, 'admin')`):
- Live counters: FMP calls today, Anthropic $ today, Lovable AI credits used, active subscriptions.
- Per-API kill switches (boolean in `api_config` table): `fmp_enabled`, `anthropic_enabled`, `lovable_ai_enabled`.
- Per-API daily caps (editable from UI).
- Recent errors / 429s log.

This is your "panic button" — flip a switch, the app falls back to cached data instead of breaking.

---

## 5. Technical Stack Additions

```
DB tables:
  subscribers(user_id pk, stripe_customer_id, tier, status, current_period_end)
  usage_counters(user_id, feature, day, count)  -- per-user limits
  api_usage(api_name, day, calls, cost_usd)     -- global spend tracking
  api_config(api_name pk, enabled bool, daily_cap_usd, daily_cap_calls)
  user_roles(user_id, role)                     -- for admin gate

Edge functions:
  stripe-checkout      -- create checkout session
  stripe-webhook       -- update subscribers table on events
  stripe-portal        -- manage subscription
  check-entitlement    -- read tier + limits
  track-usage          -- increment + enforce
  admin-metrics        -- read counters for /admin

Front-end:
  /pricing, /account, /admin pages
  useEntitlement() hook
  <PaywallGate feature="sector-backtest"> wrapper
  Usage meter component in sidebar
```

---

## 6. What I Need From You Before Starting

1. **Confirm pricing** ($19 / $49) or adjust.
2. **Stripe enable**: I'll call `enable_stripe_payments` — you fill the form (business name, email).
3. **Caps**: rough monthly budget for Anthropic + FMP plan tier so I can set sane defaults.
4. **Start phase**: A only (paywall infra) first, or A+B together?

Once confirmed I'll execute Phase A end-to-end (Stripe + DB + gating hook) and you can test before we move on.
