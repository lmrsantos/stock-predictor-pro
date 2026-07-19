import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, ArrowLeft, Crown, Activity, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";

type Cycle = "monthly" | "yearly";

const PLANS = [
  {
    id: "free" as const,
    name: "Free",
    monthly: 0,
    yearly: 0,
    blurb: "Try the terminal",
    features: [
      "Regression chart, any ticker",
      "30-day forecast horizon",
      "3 symbol backtests / day",
      "Hot Stocks: Aggressive only (top 5)",
      "5 QuantAgent chats / day",
    ],
  },
  {
    id: "pro" as const,
    name: "Pro",
    monthly: 19,
    yearly: 190,
    priceMonthlyId: "pro_monthly",
    priceYearlyId: "pro_yearly",
    blurb: "For active traders",
    highlight: true,
    features: [
      "Everything in Free",
      "30 / 90 / 180-day forecasts",
      "Unlimited symbol backtests",
      "Sector Backtest (5/day)",
      "All 3 Hot Stocks risk tiers",
      "Cycle Analysis",
      "Full Portfolio Insights",
      "🔗 Cross-Sector Linkage Graph (read-only)",
      "50 QuantAgent chats / day",
      "CSV exports",
    ],
  },
  {
    id: "elite" as const,
    name: "Elite",
    monthly: 49,
    yearly: 490,
    priceMonthlyId: "elite_monthly",
    priceYearlyId: "elite_yearly",
    blurb: "For pros & funds",
    badge: "Full Quant Suite",
    features: [
      "Everything in Pro",
      "👑 Linkage Engine — live re-runs & CSV",
      "Unlimited Sector Backtests",
      "Custom forecast horizons",
      "Rebalance alerts",
      "500 QuantAgent chats / day",
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
          <Link to="/" className="text-sm text-muted-foreground flex items-center gap-1 mb-4">
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((p) => {
            const isCurrent = tier === p.id;
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
                <p className="text-sm text-muted-foreground mb-4">{p.blurb}</p>
                <div className="mb-6">
                  <span className="text-4xl font-bold">${price}</span>
                  <span className="text-muted-foreground text-sm">/{cycle === "monthly" ? "mo" : "yr"}</span>
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

        <div className="mt-12 text-center text-xs text-muted-foreground">
          All plans renew automatically. Cancel anytime from your account page.
        </div>
      </div>
    </div>
  );
}
