import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { useEntitlement, type Feature } from "@/hooks/useEntitlement";
import type { Tier } from "@/lib/stripe";

const PLAN_LABEL: Record<Tier, string> = {
  free: "Market Pulse",
  pro: "Sector Intel",
  plus: "Signal Pro",
  elite: "Custom Intel",
};


const FEATURE_COPY: Record<Feature, { title: string; blurb: string; plan: Tier }> = {
  symbol_backtest: { title: "Symbol backtest", blurb: "", plan: "free" },
  quant_agent: {
    title: "QuantAgent",
    blurb: "Ask about any linkage, the current regime, or what to watch this week.",
    plan: "pro",
  },
  sector_backtest: {
    title: "Sector backtest",
    blurb: "Score every ticker in a sector out-of-sample and rank by model accuracy.",
    plan: "pro",
  },
  hot_stocks_all_tiers: {
    title: "All Hot Stocks tiers",
    blurb: "Free shows the strong-evidence set only. Unlock hot and full result tiers.",
    plan: "pro",
  },
  cycle_analysis: {
    title: "Cycle analysis",
    blurb: "Structural pivots, cycle length stats and projected support/resistance.",
    plan: "pro",
  },
  portfolio_advisor: {
    title: "Portfolio advisor",
    blurb: "Allocation buckets, liquidity constraints and portfolio-level backtests.",
    plan: "pro",
  },
  csv_export: {
    title: "Data export",
    blurb: "Export scan results and tables to Excel/CSV.",
    plan: "pro",
  },
  custom_forecast: {
    title: "Custom forecasts",
    blurb: "Run your own pairs and horizons with saved monitoring.",
    plan: "elite",
  },
  rebalance_alerts: {
    title: "Rebalance alerts",
    blurb: "Get notified when your allocation drifts out of band.",
    plan: "elite",
  },
  linkages_view: {
    title: "Linkage engine",
    blurb: "All 22 cross-sector linkages with validation stats.",
    plan: "pro",
  },
  linkages_run: {
    title: "Live linkage re-runs",
    blurb: "Re-run the linkage engine on demand and export the results.",
    plan: "elite",
  },
};

interface FeatureGateProps {
  feature: Feature;
  children: ReactNode;
  /** Compact inline lock (for buttons/rows) instead of a full card. */
  compact?: boolean;
  /** Optional label override for the compact variant. */
  label?: string;
}

export function FeatureGate({ feature, children, compact, label }: FeatureGateProps) {
  const { can, isLoading } = useEntitlement();
  const copy = FEATURE_COPY[feature];

  if (isLoading) return null;
  if (can(feature)) return <>{children}</>;

  if (compact) {
    return (
      <Link
        to="/pricing"
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-border bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Lock className="w-3.5 h-3.5" />
        {label ?? copy.title} — {PLAN_LABEL[copy.plan]}
      </Link>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-8 text-center flex flex-col items-center justify-center gap-3 min-h-[240px]">
      <div className="inline-flex p-3 rounded-full bg-primary/10">
        <Lock className="w-5 h-5 text-primary" />
      </div>
      <h3 className="text-base font-bold">
        {copy.title} is available with {PLAN_LABEL[copy.plan]}
      </h3>
      <p className="text-sm text-muted-foreground max-w-md">{copy.blurb}</p>
      <Link
        to="/pricing"
        className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-mono"
      >
        See pricing
      </Link>
    </div>
  );
}
