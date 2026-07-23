// subscription-gating.ts
// Tier-based access control for QuantForecast linkage features.
// All gating decisions are pure functions of the user's plan — no side effects.
// The Supabase table `subscriptions` (Stripe-backed) is the source of truth for
// plan; this module only reads plan strings and returns access decisions.
//
// NOTE: In this project the plan is derived from the existing Stripe tiers via
// `usePlan` (free → "free", pro → "standard", elite → "premium").

import type { LinkageResult, SectorName, LeaderName } from "@/lib/cross-sector-linkages";

// ---------------------------------------------------------------------------
// Plan types
// ---------------------------------------------------------------------------

export type Plan = "free" | "standard" | "premium";

export interface UserSubscription {
  userId: string;
  plan: Plan;
  customAnalysesUsedThisMonth: number;   // premium: cap 3; standard: one-time purchases tracked separately
  customAnalysesPurchased: number;       // standard: $29 one-time purchases remaining
  savedLinkageIds: string[];             // premium: user's private monitored pairs
}

// ---------------------------------------------------------------------------
// Which linkages each tier unlocks
// ---------------------------------------------------------------------------

// Free tier: 2 unlocked edges — the most textbook, lowest-controversy pairs.
export const FREE_UNLOCKED_PAIRS: Array<{ leader: LeaderName; follower: SectorName }> = [
  { leader: "Banks",  follower: "Real Estate" },
  { leader: "US10Y",  follower: "Utilities" },
];

// ---------------------------------------------------------------------------
// Access decisions
// ---------------------------------------------------------------------------

export interface LinkageAccess {
  visible: boolean;
  unlocked: boolean;
  blurred: boolean;
  reason?: string;
}

export function getLinkageAccess(
  link: Pick<LinkageResult, "leader" | "follower">,
  plan: Plan,
): LinkageAccess {
  const isFreeUnlocked = FREE_UNLOCKED_PAIRS.some(
    (p) => p.leader === link.leader && p.follower === link.follower,
  );

  if (plan === "free") {
    if (isFreeUnlocked) return { visible: true, unlocked: true, blurred: false };
    return {
      visible: true,
      unlocked: false,
      blurred: true,
      reason: "Unlock all 22 linkages with Sector Intel",
    };
  }
  return { visible: true, unlocked: true, blurred: false };
}

export interface CustomLinkageAccess {
  canRun: boolean;
  reason?: string;
  upgradeTarget?: Plan;
}

export function getCustomLinkageAccess(sub: UserSubscription): CustomLinkageAccess {
  if (sub.plan === "free") {
    return {
      canRun: false,
      reason: "Custom analyses are available from Sector Intel — or $29 one-time",
      upgradeTarget: "standard",
    };
  }
  if (sub.plan === "standard") {
    if (sub.customAnalysesPurchased > 0) return { canRun: true };
    return {
      canRun: false,
      reason: "Run a custom linkage analysis for $29 — yours permanently",
      upgradeTarget: "standard",
    };
  }
  if (sub.customAnalysesUsedThisMonth >= 3) {
    return {
      canRun: false,
      reason: "You've used your 3 custom analyses this month. Resets on the 1st.",
    };
  }
  return { canRun: true };
}

export function canSaveLinkage(plan: Plan): boolean { return plan === "premium"; }
export function canAccessEventCatalog(plan: Plan): boolean { return plan !== "free"; }
export function canAccessTickerView(plan: Plan): boolean { return plan !== "free"; }
export function canAccessQuantAgent(plan: Plan): boolean { return plan !== "free"; }
export function canAccessBacktest(plan: Plan): boolean { return plan !== "free"; }

export interface GateProps {
  locked: boolean;
  blurred: boolean;
  upgradeMessage: string;
  upgradePlan: Plan | null;
}

export function getGateProps(
  feature:
    | "event_catalog"
    | "ticker_view"
    | "quant_agent"
    | "backtest"
    | "custom_analysis"
    | "save_linkage",
  sub: UserSubscription,
): GateProps {
  const ok: GateProps = { locked: false, blurred: false, upgradeMessage: "", upgradePlan: null };
  switch (feature) {
    case "event_catalog":
      return canAccessEventCatalog(sub.plan) ? ok
        : { locked: true, blurred: false, upgradeMessage: "See which events move each sector — available from Sector Intel", upgradePlan: "standard" };
    case "ticker_view":
      return canAccessTickerView(sub.plan) ? ok
        : { locked: true, blurred: false, upgradeMessage: "See linkages at ticker level — available from Sector Intel", upgradePlan: "standard" };
    case "quant_agent":
      return canAccessQuantAgent(sub.plan) ? ok
        : { locked: true, blurred: false, upgradeMessage: "Ask QuantAgent about any linkage — available from Sector Intel", upgradePlan: "standard" };
    case "backtest":
      return canAccessBacktest(sub.plan) ? ok
        : { locked: true, blurred: false, upgradeMessage: "Run sector backtests — available from Sector Intel", upgradePlan: "standard" };
    case "custom_analysis": {
      const a = getCustomLinkageAccess(sub);
      return a.canRun ? ok
        : { locked: true, blurred: false, upgradeMessage: a.reason ?? "", upgradePlan: a.upgradeTarget ?? null };
    }
    case "save_linkage":
      return canSaveLinkage(sub.plan) ? ok
        : { locked: true, blurred: false, upgradeMessage: "Save and monitor your linkages over time — available with Custom Intelligence", upgradePlan: "premium" };
  }
}

// ---------------------------------------------------------------------------
// Plan label helpers (for badge display)
// ---------------------------------------------------------------------------

export function planLabel(plan: Plan): string {
  return plan === "free" ? "Free" : plan === "standard" ? "Sector Intel" : "Custom Intel";
}
