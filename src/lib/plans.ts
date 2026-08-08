// Single source of truth for plan names, prices, AI-action allowances and
// device limits. "Credits" never appear in the UI — everything the user sees is
// expressed in **AI actions** (one question, one analysis, one report).

import type { Tier } from "@/lib/stripe";

export type UsageProfile = "light" | "medium" | "heavy" | "power";

export interface PlanMeta {
  tier: Tier;
  name: string;
  tagline: string;
  monthly: number;
  yearly: number;
  priceMonthlyId?: string;
  priceYearlyId?: string;
  /** AI actions included every month. */
  actions: number;
  /** Devices that may sign in on the same account within 24h. */
  devices: number;
  /** Who this plan is sized for. */
  profile: UsageProfile;
  profileLabel: string;
  /** Plain-English description of what the monthly allowance buys. */
  allowanceExample: string;
}

export const PLAN_META: Record<Tier, PlanMeta> = {
  free: {
    tier: "free",
    name: "Market Pulse",
    tagline: "Free — take a look around",
    monthly: 0,
    yearly: 0,
    actions: 20,
    devices: 2,
    profile: "light",
    profileLabel: "Light user",
    allowanceExample: "≈ 20 chart insights a month (QuantAgent starts at Sector Intel)",
  },
  pro: {
    tier: "pro",
    name: "Sector Intel",
    tagline: "For the light-to-medium user",
    monthly: 49,
    yearly: 490,
    priceMonthlyId: "pro_monthly",
    priceYearlyId: "pro_yearly",
    actions: 500,
    devices: 3,
    profile: "medium",
    profileLabel: "Medium user",
    allowanceExample: "≈ 500 questions, or 160 portfolio reviews a month",
  },
  plus: {
    tier: "plus",
    name: "Signal Pro",
    tagline: "For the heavy daily user",
    monthly: 89,
    yearly: 890,
    priceMonthlyId: "plus_monthly",
    priceYearlyId: "plus_yearly",
    actions: 1200,
    devices: 4,
    profile: "heavy",
    profileLabel: "Heavy user",
    allowanceExample: "≈ 40 questions every single day",
  },
  elite: {
    tier: "elite",
    name: "Custom Intel",
    tagline: "For power users, advisors & small funds",
    monthly: 149,
    yearly: 1490,
    priceMonthlyId: "elite_monthly",
    priceYearlyId: "elite_yearly",
    actions: 2500,
    devices: 6,
    profile: "power",
    profileLabel: "Power user",
    allowanceExample: "≈ 80 questions a day, plus custom research runs",
  },
};

export const TIER_ORDER: Tier[] = ["free", "pro", "plus", "elite"];

export function planName(tier: Tier): string {
  return PLAN_META[tier].name;
}

/** Next paid tier up, for upgrade prompts. */
export function nextTier(tier: Tier): Tier | null {
  const i = TIER_ORDER.indexOf(tier);
  return i >= 0 && i < TIER_ORDER.length - 1 ? TIER_ORDER[i + 1] : null;
}
