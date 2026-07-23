import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "./useSubscription";
import type { Plan, UserSubscription } from "@/lib/subscription-gating";
import type { Tier } from "@/lib/stripe";

/**
 * Adapter hook — bridges the existing Stripe-backed `useSubscription` (free/pro/elite)
 * to the linkage gating vocabulary (free/standard/premium).
 *
 * free  → free
 * pro   → standard
 * elite → premium
 *
 * Also loads this month's custom_linkage_analyses count so
 * `getCustomLinkageAccess` can enforce the premium 3/month cap.
 */
function tierToPlan(tier: Tier): Plan {
  if (tier === "elite") return "premium";
  if (tier === "pro") return "standard";
  return "free";
}

export interface UsePlanResult {
  plan: Plan;
  subscription: UserSubscription;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function usePlan(): UsePlanResult {
  const { user } = useAuth();
  const { tier, isLoading: subLoading } = useSubscription();
  const [usedThisMonth, setUsedThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);

  const plan = tierToPlan(tier);

  const load = async () => {
    if (!user) {
      setUsedThisMonth(0);
      setLoading(false);
      return;
    }
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("custom_linkage_analyses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("ran_at", start.toISOString());
    setUsedThisMonth(count ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const subscription: UserSubscription = {
    userId: user?.id ?? "",
    plan,
    customAnalysesUsedThisMonth: usedThisMonth,
    customAnalysesPurchased: 0, // one-time purchases not yet wired (Stripe TODO)
    savedLinkageIds: [],
  };

  return { plan, subscription, loading: loading || subLoading, refetch: load };
}
