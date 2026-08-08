import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "./useSubscription";
import { PLAN_META } from "@/lib/plans";
import { usageVerdict, type UsageVerdict } from "@/lib/ai-actions";

export interface AiActionsState {
  /** AI actions still available this month (allowance + top-ups). */
  remaining: number;
  /** AI actions included with the current plan each month. */
  allowance: number;
  /** AI actions consumed within the current month. */
  used: number;
  verdict: UsageVerdict;
  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Reads the user's AI-action balance. Internally this is the credit wallet,
 * but nothing here (or in the UI) uses the word "credit".
 */
export function useAiActions(): AiActionsState {
  const { user } = useAuth();
  const { tier, isLoading: tierLoading } = useSubscription();
  const [remaining, setRemaining] = useState(0);
  const [purchased, setPurchased] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setRemaining(0);
      setPurchased(0);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("ai_credit_wallets")
      .select("balance, allowance_granted, purchased_total")
      .eq("user_id", user.id)
      .maybeSingle();
    setRemaining(Number(data?.balance ?? 0));
    setPurchased(Number(data?.purchased_total ?? 0));
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const allowance = PLAN_META[tier].actions;
  const used = Math.max(0, Math.round(allowance - Math.min(remaining, allowance)));

  return {
    remaining: Math.max(0, Math.round(remaining)),
    allowance,
    used,
    verdict: usageVerdict(used, allowance),
    loading: loading || tierLoading,
    refetch: load,
  };
}
