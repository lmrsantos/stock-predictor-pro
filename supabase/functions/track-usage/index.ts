import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/stripe.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Daily limits per feature per tier. null = unlimited.
const LIMITS: Record<string, Record<string, number | null>> = {
  symbol_backtest: { free: 3, pro: null, elite: null },
  sector_backtest: { free: 0, pro: 5, elite: null },
  hot_stocks: { free: 3, pro: null, elite: null },
  cycle_analysis: { free: 0, pro: null, elite: null },
  quant_agent: { free: 5, pro: 50, elite: 500 },
  portfolio_advisor: { free: 0, pro: null, elite: null },
  // Quant Moment symbol lookups — free at launch, abuse ceiling only.
  moment_lookup: { free: 60, pro: 60, elite: 60 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { feature, increment = 1 } = await req.json();
    if (!feature || !LIMITS[feature]) throw new Error("Invalid feature");

    const { data: tierData } = await supabase.rpc("get_user_tier", { user_uuid: user.id });
    const tier = (tierData as string) || "free";
    const limit = LIMITS[feature][tier];
    const today = new Date().toISOString().slice(0, 10);

    const { data: current } = await supabase
      .from("usage_counters")
      .select("count")
      .eq("user_id", user.id)
      .eq("feature", feature)
      .eq("day", today)
      .maybeSingle();

    const currentCount = (current?.count as number) || 0;

    if (limit !== null && currentCount + increment > limit) {
      return new Response(
        JSON.stringify({ allowed: false, tier, limit, used: currentCount, message: `Daily limit reached for ${feature}. Upgrade for more.` }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabase.from("usage_counters").upsert(
      {
        user_id: user.id,
        feature,
        day: today,
        count: currentCount + increment,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,feature,day" },
    );

    return new Response(
      JSON.stringify({ allowed: true, tier, limit, used: currentCount + increment }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
