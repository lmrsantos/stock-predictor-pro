import { useSubscription } from "./useSubscription";
import type { Tier } from "@/lib/stripe";

export type Feature =
  | "symbol_backtest"
  | "sector_backtest"
  | "hot_stocks_all_tiers"
  | "cycle_analysis"
  | "quant_agent"
  | "portfolio_advisor"
  | "csv_export"
  | "custom_forecast"
  | "rebalance_alerts";

// Minimum tier required for each feature.
const REQUIRED: Record<Feature, Tier> = {
  symbol_backtest: "free",     // free has daily limit
  sector_backtest: "pro",
  hot_stocks_all_tiers: "pro", // free only sees aggressive
  cycle_analysis: "pro",
  quant_agent: "free",         // tiered limits
  portfolio_advisor: "pro",
  csv_export: "pro",
  custom_forecast: "elite",
  rebalance_alerts: "elite",
};

const RANK: Record<Tier, number> = { free: 0, pro: 1, elite: 2 };

export function useEntitlement() {
  const sub = useSubscription();
  const can = (feature: Feature): boolean => RANK[sub.tier] >= RANK[REQUIRED[feature]];
  return { tier: sub.tier, isActive: sub.isActive, isLoading: sub.isLoading, can };
}
