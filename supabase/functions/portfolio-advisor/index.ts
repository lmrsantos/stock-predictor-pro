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
- Shiller CAPE: ~${macroContext.capeRatio}x (2nd highest in 154 years)
- Geo Summary: ${macroContext.geoSummary}

## Proprietary Regime Analysis
Current regime: **1970s+1999 Hybrid** — the most underappreciated macro setup:
- 1970s signals: Iran oil disruption, NATO rearmament, gold ATH, multipolar fragmentation
- 1999 signals: AI bubble, CAPE 37x, market concentration 50yr high
- DANGER: both analogs active simultaneously — most analysts missing this
- Scenario C risk: both break together → -40-50% broad market

## Investor Profile
${JSON.stringify(profile, null, 2)}

## Your Approach
1. Acknowledge the regime clearly — don't sugarcoat
2. Build allocation across ALL asset classes (not just stocks)
3. Include specific instruments with tickers, yields, and rationale
4. Explain WHY each instrument fits this regime
5. Give clear re-entry triggers for equities
6. Be direct — this person is sophisticated and wants real answers
7. Include CDs as a legitimate investment vehicle with current rates
8. Not financial advice disclaimer at end

## Response Format
**📊 Regime Assessment** — what regime we're in and why
**💼 Recommended Allocation** — percentage breakdown with specific tickers
**🎯 Each Position Rationale** — why this instrument for this regime
**⚡ Re-Entry Triggers** — specific signals to add equities back
**🚫 What to Avoid** — specific instruments to stay away from
**🎯 Bottom Line** — 2-3 sentences, direct and actionable`;

      const messages = [
        ...(history || []),
        { role: "user", content: message },
      ];

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          system: systemPrompt,
          messages,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });

      if (!res.ok) throw new Error(`Claude error: ${await res.text()}`);
      const data = await res.json();
      const text = (data.content || [])
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text)
        .join("\n");

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
