# Launch Plan — Payments, Subscriptions, Feature Gating, Emails

Goal: ship the freemium SaaS end-to-end. The earlier work created DB tables, hooks, and a Pricing/Account page, but the **payments connector is not actually enabled yet** (your Payments view still shows "no integration"). We need to enable it for real, finish the flows, gate features, and wire emails.

---

## Phase 1 — Payments (foundation, must come first)

1. **Enable built-in Stripe payments** via Lovable's managed connector (no Stripe account needed to start; sandbox keys auto-provisioned).
2. **Re-create products in the connector** with proper tax codes (digital SaaS = `txcd_10103001`): Pro monthly/yearly, Elite monthly/yearly.
3. **Rewrite `create-checkout`** to use the **Embedded Checkout** pattern (current code likely uses redirect / wrong client). Pin `@stripe/stripe-js@9.2.0` and `@stripe/react-stripe-js@6.2.0`.
4. **Rewrite `payments-webhook`** to use the shared `_shared/stripe.ts` `verifyWebhook` helper, key tiers off `lookup_key` (stable across sandbox/live), and stamp `environment`.
5. **Fix `src/lib/stripe.ts`** to derive env from `VITE_PAYMENTS_CLIENT_TOKEN` prefix (throw on missing — do NOT default to live).
6. Add `CheckoutReturn` page at `/checkout/return` and wire `PaymentTestModeBanner` into the app shell.

## Phase 2 — Subscription state + feature gating (Phase B)

1. Confirm `useSubscription` filters by `environment` and orders `created_at desc` (per shared utility rules).
2. Wire `useEntitlement` checks into:
   - **HotStocks**: free = aggressive top 5 only; Pro/Elite = all 3 tiers.
   - **SectorBacktest**: free = blocked with upgrade card; Pro = 5/day; Elite = unlimited.
   - **CycleAnalysis tab in BacktestModal**: Pro+ only.
   - **BacktestModal (symbol backtest)**: free = 3/day counter via `track-usage`.
   - **QuantAgent**: msg cap via `track-usage` (5/50/500).
   - **PortfolioAdvisor**: free = view only, no AI calls.
3. Build a reusable `<PaywallGate feature="...">` component that renders children when allowed, otherwise an upgrade card linking to `/pricing`.
4. Sidebar: show current tier badge + "Upgrade" CTA when on free.

## Phase 3 — Emails

1. Set up email domain (prompt user — required before anything else).
2. Run email infra setup (queues, cron, send-log).
3. Scaffold transactional templates:
   - **welcome** (on signup)
   - **subscription-activated** (from webhook on `customer.subscription.created`)
   - **subscription-canceled** (on `customer.subscription.deleted`)
   - **payment-failed** (on `invoice.payment_failed`)
   - **usage-limit-warning** (optional, sent by `track-usage` at 80%)
4. Customize auth emails (signup confirmation, password reset) with QuantForecast branding.
5. Wire send-calls into webhook + signup flow.

## Phase 4 — Admin / cost control

1. `/admin` route gated by `has_role(_, 'admin')`.
2. Live counters: today's FMP calls, Lovable AI credits, active subs by tier, recent 429s.
3. Per-API kill switches (write to `api_config`); edge functions short-circuit when disabled.
4. Editable daily caps (FMP, Lovable AI).

---

## Things I need from you before I start

1. **Confirm pricing stays $19 / $49** monthly, $190 / $490 yearly. ✅ or change.
2. **Daily caps to seed in `api_config`**:
   - FMP: 250 calls/day default — your plan limit?
   - Lovable AI: $5/day default — bump to $10 or $20?
3. **Your email — make you admin?** I'll insert your `user_id` into `user_roles` with role `admin` so you can see `/admin`.
4. **Email domain**: do you have one ready (e.g. `quantforecast.com`)? If yes, I'll trigger the setup dialog. If not, we ship Phase 1+2+4 first and add emails later.
5. **Build order**: do all 4 phases sequentially, or pause for testing after each? My recommendation: **Phase 1 → test checkout in sandbox → Phase 2 → Phase 3 → Phase 4**.

Once you answer those, I'll execute Phase 1 immediately.
