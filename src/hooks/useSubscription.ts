import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment, type Tier } from "@/lib/stripe";
import { useAuth } from "@/contexts/AuthContext";

interface SubscriptionState {
  tier: Tier;
  status: string | null;
  isActive: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export function useSubscription(): SubscriptionState {
  const { user } = useAuth();
  const [state, setState] = useState<Omit<SubscriptionState, "refetch">>({
    tier: "free",
    status: null,
    isActive: false,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    isLoading: true,
  });

  const fetchSub = async () => {
    if (!user) {
      setState({ tier: "free", status: null, isActive: false, currentPeriodEnd: null, cancelAtPeriodEnd: false, isLoading: false });
      return;
    }
    let env: "sandbox" | "live";
    try {
      env = getStripeEnvironment();
    } catch {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }
    const { data } = await supabase
      .from("subscriptions")
      .select("status, price_id, current_period_end, cancel_at_period_end")
      .eq("user_id", user.id)
      .eq("environment", env)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let tier: Tier = "free";
    let isActive = false;
    if (data) {
      const periodEnd = data.current_period_end ? new Date(data.current_period_end as string).getTime() : Infinity;
      const stillValid = periodEnd > Date.now();
      if ((data.status === "active" || data.status === "trialing" || data.status === "past_due") && stillValid) isActive = true;
      if (data.status === "canceled" && stillValid) isActive = true;
      if (isActive) {
        if (data.price_id === "elite_monthly" || data.price_id === "elite_yearly") tier = "elite";
        else if (data.price_id === "plus_monthly" || data.price_id === "plus_yearly") tier = "plus";
        else if (data.price_id === "pro_monthly" || data.price_id === "pro_yearly") tier = "pro";
      }

    }
    setState({
      tier,
      status: (data?.status as string) || null,
      isActive,
      currentPeriodEnd: (data?.current_period_end as string) || null,
      cancelAtPeriodEnd: !!data?.cancel_at_period_end,
      isLoading: false,
    });
  };

  useEffect(() => {
    fetchSub();
    if (!user) return;
    const channel = supabase
      .channel(`sub-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` }, () => fetchSub())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return { ...state, refetch: fetchSub };
}
