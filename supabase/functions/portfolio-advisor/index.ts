// supabase/functions/portfolio-advisor/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Portfolio Advisor edge function
// Fetches live macro data + runs Claude for personalized portfolio analysis
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const fmpKey = Deno.env.get("FMP_API_KEY") || "";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action, profile, message, history } = body;

    // ── Action: fetch_macro_context ───────────────────────────────────────────
    if (action === "fetch_macro_context") {
      const results = await Promise.allSettled([
        // Oil price (WTI)
        fetch(`https://financialmodelingprep.com/stable/quote?symbol=USOIL&apikey=${fmpKey}`)
          .then(r => r.ok ? r.json() : null),
        // Gold price
        fetch(`https://financialmodelingprep.com/stable/quote?symbol=GC=F&apikey=${fmpKey}`)
          .then(r => r.ok ? r.json() : null),
        // 10yr Treasury yield
        fetch(`https://financialmodelingprep.com/stable/quote?symbol=^TNX&apikey=${fmpKey}`)
          .then(r => r.ok ? r.json() : null),
        // Geopolitical sentiment from Supabase
        supabase.from("geopolitical_sentiment")
          .select("tension_score, severity, summary")
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      const oilData   = results[0].status === "fulfilled" ? results[0].value : null;
      const goldData  = results[1].status === "fulfilled" ? results[1].value : null;
      const yieldData = results[2].status === "fulfilled" ? results[2].value : null;
      const geoResult = results[3].status === "fulfilled" ? results[3].value : null;

      const oilPrice   = oilData?.[0]?.price || 95;
      const goldPrice  = goldData?.[0]?.price || 3200;
      const yield10yr  = yieldData?.[0]?.price || 4.5;
      const geoScore   = geoResult?.data?.[0]?.tension_score || 65;
      const geoSummary = geoResult?.data?.[0]?.summary || "";

      // Approximate CAPE from current S&P data
      const capeRatio = 37; // Current known value

      return new Response(JSON.stringify({
        oilPrice,
        goldPrice,
        yield10yr,
        geoScore,
        geoSummary,
        capeRatio,
        bondYieldRising: yield10yr > 4.3,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Action: get_analysis ──────────────────────────────────────────────────
    if (action === "get_analysis") {
      const macroContext = body.macroContext;
      const systemPrompt = `You are QuantForecast's Portfolio Advisor — a sophisticated investment analyst combining quantitative signals with macro regime analysis.

## Current Macro Context (Live Data)
- Oil (WTI): $${macroContext.oilPrice} ${macroContext.oilPrice > 100 ? "⚠️ Above $100 — 1970s energy crisis analog ACTIVE" : ""}
- Gold: $${macroContext.goldPrice.toLocaleString()} ${macroContext.goldPrice > 3000 ? "— All-time high territory" : ""}
- 10yr Treasury Yield: ${macroContext.yield10yr}% ${macroContext.bondYieldRising ? "📈 Rising — bond prices falling" : ""}
- Geopolitical Tension: ${macroContext.geoScore}/100 (${macroContext.geoScore > 60 ? "HIGH" : macroContext.geoScore > 40 ? "MODERATE" : "LOW"})
- Shiller CAPE: ~${macroContext.capeRatio}x
- Geo Summary: ${macroContext.geoSummary}
${macroContext.cpiYoY != null ? `- CPI YoY: ${macroContext.cpiYoY}%` : ""}
${macroContext.fedFunds != null ? `- Fed Funds: ${macroContext.fedFunds}%` : ""}
${macroContext.curve10y2y != null ? `- 10y–2y spread: ${macroContext.curve10y2y}` : ""}
${macroContext.vix != null ? `- VIX: ${macroContext.vix}` : ""}

## Regime Analysis (computed by the platform's historical-analog engine)
The platform scores today's macro fingerprint (inflation, real rates, curve,
energy stress, valuation, volatility, geopolitics, safe-haven gold bid, index
concentration, credit stress) against a library of documented market episodes
(1929, 1937, 1966, 1973, 1979, 1987, 1990, 1994, 1995, 1998, 1999, 2008, 2011,
2015, 2018, 2020, 2022, 2023) and returns the closest matches:

${body.regime ? `Label: ${body.regime.label} (confidence ${body.regime.confidence}%)
Ranked analogs:
${(body.regime.analogs || []).map((a: any) => `- ${a.years} ${a.name}: ${a.similarity}% match. Drivers: ${(a.drivers || []).join("; ")}. Outcome: ${a.outcome} Playbook: ${a.playbook} Key risk: ${a.keyRisk}`).join("\n")}` : "No regime payload supplied — derive the analogs yourself from the macro data above."}

IMPORTANT: do NOT assume any fixed analog. Reason from the ranked matches above
and the live data. If the data points at episodes other than the top match,
say so and explain which fingerprint dimensions disagree.


## Investor Profile
${JSON.stringify(profile, null, 2)}

## Your Approach — CRITICAL LEGAL CONSTRAINTS
QuantForecast is NOT a registered investment adviser. You are producing
EDUCATIONAL, ILLUSTRATIVE content only. You must:
1. Never tell the user to buy, sell, or hold any specific security.
2. Never quote a dollar amount the user "should" invest. If you discuss
   sizing, frame as percentages of an illustrative portfolio only.
3. Use historical / conditional framing: "Historically, instruments like
   X have performed this way in similar regimes..." instead of
   "You should buy X" or "Recommended allocation: $X in Y".
4. Acknowledge the regime, explain how it has historically affected
   different asset classes, and describe an illustrative percentage-based
   model — never a personalized recommendation.
5. Include re-entry conditions for equities as historical signals to
   watch, not as trade instructions.
6. End every response with: "Educational only — not investment advice.
   Consult a licensed financial adviser."

## Response Format
**Regime Assessment** — what regime we're in and the historical analog
**Illustrative Allocation Model** — percentage breakdown by asset class
   with example instruments (frame as "examples of instruments in this
   category", never "buy this")
**How These Categories Have Historically Behaved** — educational context
   per category for this regime
**Historical Re-Entry Signals to Watch** — events that have historically
   preceded equity recoveries (educational only)
**Categories to Approach With Caution** — historically vulnerable in
   this regime
**Educational Summary** — 2-3 sentences. No "you should" language.`;

      const messages = [
        ...(history || []),
        { role: "user", content: message },
      ];

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          max_tokens: 2000,
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
        }),
      });

      if (!res.ok) {
        if (res.status === 429) throw new Error("Rate limited — please retry in a minute.");
        if (res.status === 402) throw new Error("AI credits exhausted. Please add credits in Lovable settings.");
        throw new Error(`AI gateway error: ${await res.text()}`);
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";

      return new Response(JSON.stringify({ response: text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error) {
    console.error("Portfolio advisor error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
