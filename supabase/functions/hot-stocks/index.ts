// supabase/functions/hot-stocks/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight cache reader — returns pre-computed results instantly
// Heavy computation runs in run-hot-stocks-scan every 30 min via pg_cron
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let riskProfile = "aggressive", topN = 10;
    try {
      const body = await req.json();
      riskProfile = body.riskProfile || "aggressive";
      if (body.limit) topN = Math.min(body.limit, 20);
    } catch { /* no body */ }

    if (!["conservative","moderate","aggressive"].includes(riskProfile)) {
      riskProfile = "aggressive";
    }

    const cacheKey = `ae_hot_v4_${riskProfile}_all`;

    // Read latest cached result
    const { data: cached } = await supabase
      .from("market_updates")
      .select("content, created_at")
      .eq("signal_type", cacheKey)
      .order("created_at", { ascending: false })
      .limit(1);

    if (cached?.length) {
      try {
        const stocks = JSON.parse(cached[0].content);
        if (Array.isArray(stocks) && stocks.length > 0) {
          const ageMs = Date.now() - new Date(cached[0].created_at).getTime();
          const ageMin = Math.round(ageMs / 60000);
          const isStale = ageMs > 35 * 60 * 1000; // > 35 minutes

          // If stale, trigger background refresh (fire and forget)
          if (isStale) {
            const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
            const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
            fetch(`${supabaseUrl}/functions/v1/run-hot-stocks-scan`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${serviceKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ riskProfile, triggered_by: "hot-stocks-stale" }),
            }).catch(e => console.warn("Background scan trigger failed:", e));
            console.log(`Cache stale (${ageMin} min) — triggered background refresh`);
          }

          return new Response(JSON.stringify({
            stocks: stocks.slice(0, topN),
            cached: true,
            lastUpdated: cached[0].created_at,
            ageMinutes: ageMin,
            isStale,
            riskProfile,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch { /* fall through */ }
    }

    // No cache yet — trigger scan for this profile and return status
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    fetch(`${supabaseUrl}/functions/v1/run-hot-stocks-scan`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ riskProfile, triggered_by: "hot-stocks-cold-start" }),
    }).catch(e => console.warn("Background scan trigger failed:", e));

    return new Response(JSON.stringify({
      stocks: [],
      cached: false,
      scanning: true,
      message: `Scanning ${riskProfile} profile for the first time — results ready in ~3 minutes. Click "Scan Again" after waiting.`,
      riskProfile,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Hot stocks cache error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
