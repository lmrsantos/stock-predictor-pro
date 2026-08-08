import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, ArrowLeft, Crown, Activity, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";

type Cycle = "monthly" | "yearly";

// Plans align with subscription-gating.ts. Everything the member sees is
// expressed in **AI actions** — never "credits".
const PLANS = [
  {
    id: "free" as const,
    stripeTier: "free" as const,
    name: "Market Pulse",
    tagline: "Free",
    profile: "Light user",
    monthly: 0,
    yearly: 0,
    blurb: "The full analytics terminal — minus the AI assistants",
    actions: "20 AI actions / month",
    actionsDetail: "≈ 20 chart insights a month (QuantAgent starts at Sector Intel)",
    devices: "1 person · 2 devices",
    features: [
      "Regression chart + all 4 forecast models, any ticker",
      "30-day forecast horizon",
      "Model calibration — true out-of-sample backtest per symbol",
      "Symbol detail: key levels, Fibonacci & base-rate evidence",
      "Live market ticker, macro strip & geopolitical tension index",
      "Investment simulator + portfolio tracking (no AI advisor)",
      "Hot Stocks: Aggressive only (top 5)",
      "Full Linkage Graph — blurred, 2 pairs unlocked (Banks → Real Estate, US10Y → Utilities)",
    ],
  },

  {
    id: "standard" as const,
    stripeTier: "pro" as const,
    name: "Sector Intel",
    tagline: "For active traders",
    profile: "Medium user",
    monthly: 49,
    yearly: 490,
    priceMonthlyId: "pro_monthly",
    priceYearlyId: "pro_yearly",
    blurb: "All 22 linkages, event catalog, ticker-level view",
    highlight: true,
    actions: "500 AI actions / month",
    actionsDetail: "≈ 16 questions a day, or 160 portfolio reviews",
    devices: "1 person · 3 devices",
    features: [
      "Everything in Market Pulse",
      "🔗 All 22 cross-sector linkages unlocked",
      "Event catalog — what moves each sector",
      "Ticker-level linkage view",
      "Sector & symbol backtests",
      "Cycle Analysis + QuantAgent + Portfolio Insights",
      "All 3 Hot Stocks risk tiers",
      "Custom linkage analysis — buy a single run for $29 (one-off, kept forever)",
      "CSV exports",

    ],
  },
  {
    id: "plus" as const,
    stripeTier: "plus" as const,
    name: "Signal Pro",
    tagline: "For heavy daily users",
    profile: "Heavy user",
    monthly: 89,
    yearly: 890,
    priceMonthlyId: "plus_monthly",
    priceYearlyId: "plus_yearly",
    badge: "Best value per action",
    blurb: "Everything in Sector Intel with room to work all day",
    actions: "1,200 AI actions / month",
    actionsDetail: "≈ 40 questions every single day",
    devices: "1 person · 4 devices",
    features: [
      "Everything in Sector Intel",
      "Live Linkage Engine re-runs + CSV export",
      "Custom forecast horizons",
      "Priority model refreshes",
      "Excel exports for portfolio proposals",
    ],
  },
  {
    id: "premium" as const,
    stripeTier: "elite" as const,
    name: "Custom Intel",
    tagline: "For pros & funds",
    profile: "Power user",
    monthly: 149,
    yearly: 1490,
    priceMonthlyId: "elite_monthly",
    priceYearlyId: "elite_yearly",
    badge: "Full Quant Suite",
    blurb: "Run and monitor your own leader → follower pairs",
    actions: "2,500 AI actions / month",
    actionsDetail: "≈ 80 questions a day, plus custom research runs",
    devices: "1 person · 6 devices",
    features: [
      "Everything in Signal Pro",
      "👑 3 custom linkage analyses / month",
      "Save & monitor private linkages over time",
      "Rebalance alerts on your saved pairs",
      "API & data access",
      "Priority support",
    ],
  },
];


export default function Pricing() {
  const { user } = useAuth();
  const { tier } = useSubscription();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [checkoutPriceId, setCheckoutPriceId] = useState<string | null>(null);

  const handleSubscribe = (priceId?: string) => {
    if (!priceId) return;
    if (!user) { navigate("/auth?redirect=/pricing"); return; }
    setCheckoutPriceId(priceId);
  };

  if (checkoutPriceId) {
    return (
      <div className="min-h-screen bg-background">
        <PaymentTestModeBanner />
        <div className="max-w-3xl mx-auto p-6">
          <button onClick={() => setCheckoutPriceId(null)} className="text-sm text-muted-foreground mb-4 flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Back to pricing
          </button>
          <StripeEmbeddedCheckout priceId={checkoutPriceId} userId={user?.id} customerEmail={user?.email} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PaymentTestModeBanner />
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link to="/terminal" className="text-sm text-muted-foreground flex items-center gap-1 mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to terminal
          </Link>
          <h1 className="text-4xl font-bold mb-2">Pricing</h1>
          <p className="text-muted-foreground">Start free. Upgrade when you need more.</p>
        </div>

        <div className="mb-10 rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 via-background to-background p-6 flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="p-3 rounded-full bg-primary/15 shrink-0">
            <Activity className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-mono uppercase tracking-widest">
                <Crown className="w-3 h-3" /> Signature Tool
              </span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Included in Pro</span>
            </div>
            <h3 className="text-lg font-bold">Cross-Sector Linkage Engine</h3>
            <p className="text-sm text-muted-foreground">
              22 economically-motivated lead-lag pairs, BH-corrected & split-half validated. Powers Hot Stocks confidence tilts and QuantAgent macro reasoning.
            </p>
          </div>
          <Link to="/linkages" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-mono flex items-center gap-2 shrink-0">
            <Sparkles className="w-4 h-4" /> See it live
          </Link>
        </div>

        <div className="flex justify-center gap-2 mb-10">
          <button
            onClick={() => setCycle("monthly")}
            className={`px-4 py-2 rounded-lg text-sm font-mono ${cycle === "monthly" ? "bg-foreground text-background" : "bg-muted"}`}
          >Monthly</button>
          <button
            onClick={() => setCycle("yearly")}
            className={`px-4 py-2 rounded-lg text-sm font-mono ${cycle === "yearly" ? "bg-foreground text-background" : "bg-muted"}`}
          >Yearly <span className="text-xs opacity-70">(2 mo free)</span></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {PLANS.map((p) => {
            const isCurrent = tier === p.stripeTier;
            const price = cycle === "monthly" ? p.monthly : p.yearly;
            const priceId = cycle === "monthly" ? p.priceMonthlyId : p.priceYearlyId;
            return (
              <div
                key={p.id}
                className={`rounded-2xl border p-6 flex flex-col ${p.highlight ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
              >
                {p.highlight && <div className="text-xs font-mono uppercase text-primary mb-2">Most popular</div>}
                {"badge" in p && p.badge && (
                  <div className="inline-flex items-center gap-1 text-xs font-mono uppercase text-primary mb-2">
                    <Crown className="w-3 h-3" /> {p.badge}
                  </div>
                )}
                <h3 className="text-xl font-bold">{p.name}</h3>
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">{p.tagline}</p>
                <p className="text-sm text-muted-foreground mb-4">{p.blurb}</p>
                <div className="mb-4">
                  <span className="text-4xl font-bold">${price}</span>
                  <span className="text-muted-foreground text-sm">/{cycle === "monthly" ? "mo" : "yr"}</span>
                </div>

                <div className="rounded-xl border border-border bg-secondary/40 p-3 mb-5 space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    Sized for the {p.profile.toLowerCase()}
                  </div>
                  <div className="text-sm font-bold">{p.actions}</div>
                  <div className="text-xs text-muted-foreground">{p.actionsDetail}</div>
                  <div className="text-xs text-muted-foreground">{p.devices}</div>
                </div>

                <ul className="space-y-2 text-sm mb-6 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />{f}</li>
                  ))}
                </ul>
                {p.id === "free" ? (
                  <button disabled={isCurrent} className="w-full py-2 rounded-lg border border-border text-sm font-mono disabled:opacity-50">
                    {isCurrent ? "Current plan" : "Free forever"}
                  </button>
                ) : (
                  <button
                    onClick={() => handleSubscribe(priceId)}
                    disabled={isCurrent}
                    className={`w-full py-2 rounded-lg text-sm font-mono ${p.highlight ? "bg-primary text-primary-foreground" : "bg-foreground text-background"} disabled:opacity-50`}
                  >
                    {isCurrent ? "Current plan" : `Upgrade to ${p.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-12 rounded-2xl border border-border p-6">
          <h2 className="text-lg font-bold mb-2">What is an “AI action”?</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Anything where the platform does the thinking for you. Everything else — charts,
            forecasts, backtests, linkage graphs, Hot Stocks — is unlimited on every paid plan.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border border-border p-3">
              <div className="font-bold">1 action</div>
              <div className="text-muted-foreground text-xs">One QuantAgent question, or one chart insight</div>
            </div>
            <div className="rounded-xl border border-border p-3">
              <div className="font-bold">3 actions</div>
              <div className="text-muted-foreground text-xs">One full Portfolio Insights proposal</div>
            </div>
            <div className="rounded-xl border border-border p-3">
              <div className="font-bold">5 actions</div>
              <div className="text-muted-foreground text-xs">One IPO intelligence report</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Your allowance resets on the 1st of each month. Your account page always shows how many
            actions you have left, and whether you're running light, medium or heavy for your plan.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-border p-6">
          <h2 className="text-lg font-bold mb-2">What “custom linkage analysis — $29 one-time” means</h2>
          <p className="text-sm text-muted-foreground">
            The 22 published linkages are ready-made leader → follower pairs. A <b>custom</b> analysis
            is you choosing your own pair (for example Crude Oil → Airlines) and having the engine run
            the full lead-lag study on it: correlation at each lag, significance testing, split-half
            validation and a plain-English read of what it implies.
          </p>
          <p className="text-sm text-muted-foreground mt-3">
            On <b>Sector Intel</b> these aren't included in the monthly plan — you buy a single run for
            $29, and that analysis is saved to your account permanently. On <b>Custom Intel</b> you get
            3 custom runs every month included, plus the ability to save and monitor those pairs over
            time with rebalance alerts.
          </p>
        </div>


        <div className="mt-8 rounded-2xl border border-border p-6">
          <h2 className="text-lg font-bold mb-2">One person per account</h2>
          <p className="text-sm text-muted-foreground">
            Plans are personal. Each plan covers a set number of devices for one person — a shared
            login gets flagged automatically, drains the monthly AI actions fast, and may be limited.
            Working with a team? Contact us for a team plan instead.
          </p>
        </div>

        <div className="mt-12 text-center text-xs text-muted-foreground">
          All plans renew automatically. Cancel anytime from your account page.
        </div>

      </div>
    </div>
  );
}
