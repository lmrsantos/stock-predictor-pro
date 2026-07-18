// supabase/functions/quant-agent/index.ts
// Educational quant analyst chat via Lovable AI Gateway (Gemini).
// Returns responses synchronously — no managed-agent streaming.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildSystemPrompt(ctx: Record<string, any>): string {
  const bt = ctx?.backtestResult;
  return `You are QuantAgent, an educational quantitative analyst inside the QuantForecast platform.

IMPORTANT — LEGAL / TONE:
- You are NOT a financial advisor and never give personalized recommendations.
- Frame everything as education: "historically", "the model suggests", "one interpretation is…".
- Never say "you should buy/sell" or give dollar amounts. Use percentages and illustrative framing.
- Always mention that past performance does not guarantee future results when relevant.

Current context:
- Ticker: ${ctx?.ticker || "N/A"}
- Price: ${ctx?.price ? "$" + ctx.price : "N/A"}
${ctx?.annualReturn ? `- Regression annual return: ${(Number(ctx.annualReturn) * 100).toFixed(1)}%` : ""}
${ctx?.rSquared ? `- R² (trend reliability): ${ctx.rSquared}` : ""}
${bt ? `- Backtest signal: ${bt.signal} (${bt.confidenceScore}/100 confidence, ${bt.hitRate}% hit rate, regime: ${bt.regime}, projected ${bt.forecastPct}% over ${bt.forecastLabel})` : ""}

Style: concise, direct, markdown-friendly. Explain the reasoning behind model outputs. If asked about news you don't have, say so and explain what to look for.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not set");

    const body = await req.json();
    const { action, context, ticker } = body;
    const currentTicker = ticker || context?.ticker || "UNKNOWN";

    // ── init: return greeting, no remote session needed ─────────────────────
    if (action === "get_or_create_agent" || action === "create_session") {
      const bt = context?.backtestResult;
      const greeting = bt
        ? `Loaded backtest for ${currentTicker}: **${bt.signal}** signal, ${bt.confidenceScore}/100 confidence, ${bt.hitRate}% hit rate. Ask me to explain the model, walk through the regime, or discuss what typically drives moves like this. *For education only — not financial advice.*`
        : `Ready to explore ${currentTicker}${context?.price ? ` at $${context.price}` : ""}. Ask about the regression trend, historical patterns, or how to interpret the model. *For education only — not financial advice.*`;

      return new Response(JSON.stringify({
        agent_id: "lovable-ai",
        environment_id: "lovable-ai",
        session_id: `sess_${crypto.randomUUID()}`,
        is_returning: false,
        greeting,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── send_message: call Lovable AI and return the reply ──────────────────
    if (action === "send_message") {
      const { message, history } = body;
      if (!message || typeof message !== "string") {
        return new Response(JSON.stringify({ error: "Missing message" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const messages = [
        { role: "system", content: buildSystemPrompt(context || {}) },
        ...(Array.isArray(history) ? history.slice(-12).map((m: any) => ({
          role: m.role === "agent" ? "assistant" : "user",
          content: String(m.content || ""),
        })) : []),
        { role: "user", content: message },
      ];

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
        }),
      });

      if (res.status === 429) {
        return new Response(JSON.stringify({ response: "I'm getting rate-limited right now — please try again in a moment." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (res.status === 402) {
        return new Response(JSON.stringify({ response: "AI credits are exhausted for this workspace. Please add credits to keep chatting." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`AI gateway ${res.status}: ${t.slice(0, 300)}`);
      }

      const data = await res.json();
      const reply = data?.choices?.[0]?.message?.content?.trim() || "I couldn't generate a response — try rephrasing.";

      return new Response(JSON.stringify({ response: reply }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error) {
    console.error("QuantAgent error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
