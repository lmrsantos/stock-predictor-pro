// supabase/functions/quant-agent/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// QuantAgent — Standard /v1/messages API with Supabase conversation memory
//
// Architecture (proven reliable):
//   - Standard Claude API — no Managed Agents, no sessions, no polling
//   - Conversation history stored in Supabase per user+ticker+purpose
//   - Level 3 thematic intelligence — Claude searches and classifies dynamically
//   - Web search tool enabled for live market data
//   - Fast, reliable, no timeout risk
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface StockContext {
  ticker?: string;
  price?: number;
  annualReturn?: number;
  rSquared?: number;
  backtestResult?: {
    signal: string;
    confidenceScore: number;
    walkForwardAccuracy: number;
    hitRate: number;
    regime: string;
    forecastPct: number;
    forecastLabel: string;
  };
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function getHistory(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  ticker: string,
  purpose: string
): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from("market_updates")
    .select("content")
    .eq("signal_type", `qa_history_${userId}_${ticker}_${purpose}`)
    .order("created_at", { ascending: false })
    .limit(1);
  if (!data?.length) return [];
  try { return JSON.parse(data[0].content); } catch { return []; }
}

async function saveHistory(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  ticker: string,
  purpose: string,
  messages: ChatMessage[]
) {
  await supabase.from("market_updates").insert({
    signal_type: `qa_history_${userId}_${ticker}_${purpose}`,
    content: JSON.stringify(messages.slice(-12)),
    ticker,
  });
}

// ─── System prompt — Level 3 Dynamic Thematic Intelligence ───────────────────

function buildSystemPrompt(ctx: StockContext): string {
  const bt = ctx.backtestResult;
  const ticker = ctx.ticker || "N/A";
  const price = ctx.price ? "$" + ctx.price : "N/A";
  const annualReturnLine = ctx.annualReturn
    ? "- Regression Annual Return: " + (ctx.annualReturn * 100).toFixed(1) + "%"
    : "";
  const rSquaredLine = ctx.rSquared
    ? "- R\u00B2 (trend reliability): " + ctx.rSquared
    : "";
  const backtestSection = bt ? [
    "",
    "## Quantitative Model Results",
    "- Signal: " + bt.signal,
    "- Confidence: " + bt.confidenceScore + "/100",
    "- Walk-Forward Accuracy: " + bt.walkForwardAccuracy + "%",
    "- Direction Hit Rate: " + bt.hitRate + "%",
    "- Market Regime: " + bt.regime,
    "- Projected Move: " + bt.forecastPct + "% over " + bt.forecastLabel,
  ].join("\n") : "";

  return `You are QuantAgent, a professional quantitative financial analyst in the QuantForecast platform. You have access to web search — use it before every substantive response.

## Current Stock Context
- Ticker: ${ticker}
- Price: ${price}
${annualReturnLine}
${rSquaredLine}
${backtestSection}

## Your Analysis Framework

### Step 1: Search & Discover (always do this first)
Before answering any question about ${ticker}, search for:
1. "${ticker} stock news May 2026" — latest developments
2. "${ticker} earnings history beat miss" — pattern of beats/misses  
3. "${ticker} sector government contracts 2026" — thematic catalysts
4. "${ticker} upcoming earnings date analyst rating" — binary events

### Step 2: Thematic Classification (Level 3 — fully dynamic)
Based on your search results, determine which macro themes apply.
Do NOT use a hardcoded list. Reason from what you find.

Active 2026 themes to consider (not exhaustive):
- 🤖 AI Infrastructure: compute, data centers, power, cooling
- 🚀 Space & Defense: Golden Dome, SpaceX IPO, NATO spending
- 🔬 Semiconductor Reshoring: CHIPS Act, US fab buildout
- ⚡ Energy & Power: AI electricity demand, nuclear renaissance
- 💊 Biotech M&A: pharma patent cliff, deregulation
- 🌍 Geopolitics: Iran oil, US-China decoupling, European defense
- ⚛️ Quantum Computing: DARPA contracts, post-quantum security
- Any other theme you discover

For each theme: is this stock a DIRECT (order 1), SECONDARY (order 2), or INDIRECT (order 3) beneficiary?

### Step 3: Ripple Effect Assessment
Think: Government/narrative signal → sector momentum → stock price
- Has the ripple already reached this stock or is it incoming?
- Pattern of earnings beats = conservative guidance = positive surprise setup?
- What's the next binary event (earnings date, contract announcement, FDA decision)?

### Step 4: Response Structure
Always respond with ALL of these sections:

**📍 What This Company Does**
(1-2 sentences)

**🌊 Thematic Position**
(Theme name, conviction level, direct/secondary/indirect, has ripple arrived?)

**📅 Key Catalyst**
(Most important near-term driver — specific date and dollar amount)

**📊 Quant Signal Context**
(Does the ${price} and model forecast align with the fundamental story? Any contradictions?)

**⚠️ Key Risk**
(Specific risk with numbers — valuation multiple, execution risk, etc.)

**🎯 Bottom Line**
(2-3 sentences. Actionable. Include position sizing suggestion.)

---
Not financial advice. Quantitative + thematic analysis only.`;
}

// ─── Call Claude with web search tool ────────────────────────────────────────

async function callClaude(
  messages: ChatMessage[],
  system: string,
  apiKey: string
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system,
      messages,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
        }
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    // Fallback without web search if tool not supported
    if (res.status === 400 && err.includes("tool")) {
      const fallback = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1500,
          system,
          messages,
        }),
      });
      if (!fallback.ok) throw new Error(`Claude error: ${await fallback.text()}`);
      const data = await fallback.json();
      return extractText(data);
    }
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return extractText(data);
}

function extractText(data: { content: { type: string; text?: string }[]; stop_reason?: string }): string {
  // Handle tool use responses — concatenate all text blocks
  const texts = (data.content || [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text!)
    .join("\n");
  return texts || "No response generated.";
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set in Supabase secrets");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action, message, context, ticker } = body as {
      action: string;
      message?: string;
      context?: StockContext;
      ticker?: string;
    };

    const currentTicker = ticker || context?.ticker || "UNKNOWN";
    const purpose = body.purpose || "chat";

    // User ID from auth header
    const authHeader = req.headers.get("authorization") || "";
    const userId = authHeader.length > 10
      ? authHeader.slice(-12).replace(/[^a-zA-Z0-9]/g, "x")
      : "anonymous";

    let result: unknown;

    // ── init (get_or_create_agent or create_session) ───────────────────────────
    if (action === "get_or_create_agent" || action === "create_session") {
      const history = await getHistory(supabase, userId, currentTicker, purpose);
      const isReturning = history.length > 0;
      const bt = context?.backtestResult;

      let greeting: string;
      if (isReturning) {
        greeting = `Welcome back. I remember our previous analysis of ${currentTicker}${context?.price ? " at $" + context.price : ""}. What would you like to explore?`;
      } else if (bt) {
        const direction = bt.forecastPct > 0 ? "bullish" : "bearish";
        greeting = `I've loaded the backtest results for ${currentTicker}. The model is ${direction} — **${bt.signal}** signal with ${bt.confidenceScore}/100 confidence and ${bt.hitRate}% directional hit rate. I'll search for current news to complement the model. What would you like to know?`;
      } else {
        greeting = `Ready to analyze ${currentTicker}${context?.price ? " at $" + context.price : ""}. I'll combine the quant model with live web search and thematic analysis. Ask me anything.`;
      }

      result = {
        agent_id: "claude-sonnet-4-6",
        environment_id: "supabase-memory",
        session_id: `${userId}_${currentTicker}_${purpose}`,
        is_returning: isReturning,
        recent_messages: history.slice(-4).map(m => ({
          role: m.role === "assistant" ? "agent" : m.role,
          content: m.content,
        })),
        greeting,
        anthropic_api_key: null,
      };

    // ── send_message ───────────────────────────────────────────────────────────
    } else if (action === "send_message") {
      if (!message) throw new Error("message is required");

      const history = await getHistory(supabase, userId, currentTicker, purpose);
      const system = buildSystemPrompt(context || {});

      // Enrich user message with context
      const bt = context?.backtestResult;
      const enriched = message + (bt || context?.price ? `

[Context: ${currentTicker} at ${context?.price ? "$" + context.price : "current price"}${bt ? `, model signal: ${bt.signal} ${bt.confidenceScore}/100, forecast: ${bt.forecastPct > 0 ? "+" : ""}${bt.forecastPct}% over ${bt.forecastLabel}, regime: ${bt.regime}` : ""}]` : "");

      const updatedHistory: ChatMessage[] = [
        ...history,
        { role: "user", content: enriched },
      ];

      const response = await callClaude(updatedHistory, system, apiKey);

      // Save history
      await saveHistory(supabase, userId, currentTicker, purpose, [
        ...updatedHistory,
        { role: "assistant", content: response },
      ]);

      result = { response };

    } else {
      throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
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
