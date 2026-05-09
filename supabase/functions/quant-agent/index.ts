// supabase/functions/quant-agent/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// QuantAgent — Anthropic Messages API + web_search tool
// Client sends full conversation history; server runs the tool loop.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOOL_ITERATIONS = 6;

interface BacktestResult {
  signal?: string;
  confidenceScore?: number;
  walkForwardAccuracy?: number;
  hitRate?: number;
  regime?: string;
  forecastPct?: number;
  forecastLabel?: string;
}

interface AgentContext {
  ticker?: string;
  price?: number;
  rSquared?: number;
  annualReturn?: number;
  slope?: number;
  fundamentals?: Record<string, unknown>;
  website?: string;
  backtestResult?: BacktestResult;
}

function buildSystemPrompt(ctx: AgentContext): string {
  const bt = ctx.backtestResult;
  return `You are QuantAgent, a professional quantitative financial analyst in the QuantForecast platform. You have access to a web_search tool — use it to find current news, earnings, analyst ratings, and macro context for any stock you analyze.

Current stock context:
- Ticker: ${ctx.ticker || "N/A"}
- Price: ${ctx.price ? "$" + ctx.price : "N/A"}
${ctx.annualReturn ? `- Regression Annual Return: ${(Number(ctx.annualReturn) * 100).toFixed(1)}%` : ""}
${ctx.rSquared ? `- R² (trend reliability): ${ctx.rSquared}` : ""}
${bt ? `
Autoencoder Backtest Results:
- Signal: ${bt.signal}
- Confidence: ${bt.confidenceScore}/100
- Walk-Forward Accuracy: ${bt.walkForwardAccuracy}%
- Direction Hit Rate: ${bt.hitRate}%
- Market Regime: ${bt.regime}
- Projected Move: ${bt.forecastPct}% over ${bt.forecastLabel}` : ""}

Guidelines:
- Use web_search before giving forecasts or recommendations to ground them in current news
- Be direct and specific — give actionable insights with clear reasoning
- Combine the quantitative backtest with current news for a complete picture
- State position size recommendations when asked (full/half/quarter position)
- You are NOT a licensed financial advisor — note this for specific recommendations`;
}

async function callAnthropic(apiKey: string, body: unknown): Promise<any> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${text}`);
  return JSON.parse(text);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const { action, messages = [], context = {} } = await req.json();

    // Greeting (no LLM call needed)
    if (action === "init") {
      const ctx = context as AgentContext;
      const bt = ctx.backtestResult;
      const greeting = bt
        ? `Loaded backtest for ${ctx.ticker}: **${bt.signal}** signal, ${bt.confidenceScore}/100 confidence, ${bt.hitRate}% hit rate. I'll search the web for current news to complement the model. What would you like to know?`
        : `Ready to analyze ${ctx.ticker}${ctx.price ? ` at $${ctx.price}` : ""}. I'll combine the regression model with live web search for a complete picture. Ask me anything.`;
      return new Response(JSON.stringify({ greeting }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action !== "chat") throw new Error(`Unknown action: ${action}`);

    const system = buildSystemPrompt(context);
    const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];

    // Conversation loop: handle tool_use → tool_result iterations
    const convo: any[] = [...messages];
    let finalText = "";

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const resp = await callAnthropic(apiKey, {
        model: MODEL,
        max_tokens: 2048,
        system,
        tools,
        messages: convo,
      });

      // Append assistant turn
      convo.push({ role: "assistant", content: resp.content });

      // Collect text
      const textBlocks = (resp.content || [])
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n");
      if (textBlocks) finalText = textBlocks;

      // The web_search tool runs server-side at Anthropic — no tool_result needed from us.
      // We only loop if the model returns a client-side tool_use (none defined here).
      if (resp.stop_reason !== "tool_use") break;

      const clientToolUses = (resp.content || []).filter(
        (b: any) => b.type === "tool_use" && b.name !== "web_search"
      );
      if (clientToolUses.length === 0) break;

      // No client tools defined; safety exit
      break;
    }

    return new Response(JSON.stringify({ reply: finalText || "No response generated." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("QuantAgent error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
