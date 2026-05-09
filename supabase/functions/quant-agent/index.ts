// supabase/functions/quant-agent/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// QuantAgent — Claude Opus 4.7 financial analyst with persistent memory
//
// Uses standard /v1/messages API (reliable, no beta dependencies)
// Persistence implemented via Supabase:
//   - Conversation history per user+ticker (last 10 messages)
//   - User risk profile learned over time
//   - Past signals and recommendations stored
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
  slope?: number;
  fundamentals?: Record<string, unknown>;
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
): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from("market_updates")
    .select("content")
    .eq("signal_type", `qa_history_${userId}_${ticker}`)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!data?.length) return [];
  try {
    return JSON.parse(data[0].content) as ChatMessage[];
  } catch {
    return [];
  }
}

async function saveHistory(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  ticker: string,
  messages: ChatMessage[],
) {
  // Keep last 10 messages (5 exchanges)
  const trimmed = messages.slice(-10);
  await supabase.from("market_updates").insert({
    signal_type: `qa_history_${userId}_${ticker}`,
    content: JSON.stringify(trimmed),
    ticker,
  });
}

async function getUserProfile(supabase: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const { data } = await supabase
    .from("market_updates")
    .select("content")
    .eq("signal_type", `qa_profile_${userId}`)
    .order("created_at", { ascending: false })
    .limit(1);

  return data?.[0]?.content || "";
}

async function updateUserProfile(supabase: ReturnType<typeof createClient>, userId: string, profile: string) {
  await supabase.from("market_updates").insert({
    signal_type: `qa_profile_${userId}`,
    content: profile,
    ticker: null,
  });
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx: StockContext, userProfile: string): string {
  const bt = ctx.backtestResult;
  return `You are QuantAgent, a professional quantitative financial analyst embedded in the QuantForecast platform. You are powered by Claude Opus 4.7.

## Current Stock Context
- Ticker: ${ctx.ticker || "N/A"}
- Current Price: ${ctx.price ? `$${ctx.price.toLocaleString()}` : "N/A"}
${ctx.annualReturn ? `- Regression Annual Return: ${(ctx.annualReturn * 100).toFixed(1)}%` : ""}
${ctx.rSquared ? `- R² (trend reliability): ${Number(ctx.rSquared).toFixed(3)}` : ""}
${
  bt
    ? `
## Autoencoder Backtest Results
- Signal: ${bt.signal}
- Confidence Score: ${bt.confidenceScore}/100
- Walk-Forward Accuracy: ${bt.walkForwardAccuracy}%
- Direction Hit Rate: ${bt.hitRate}%
- Market Regime: ${bt.regime}
- Projected Move: ${bt.forecastPct > 0 ? "+" : ""}${bt.forecastPct}% over ${bt.forecastLabel}`
    : ""
}

## User Profile (learned from past conversations)
${userProfile || "New user — no profile yet. Learn their risk tolerance and goals from this conversation."}

## Your Behavior
- Be direct and specific — give actionable insights
- Reference the backtest data when relevant
- Keep responses concise: 2-4 sentences for simple questions
- For recommendations always state: signal, position size, key risk
- Update your mental model of the user's risk profile as you learn more
- You are NOT a licensed financial advisor — note this for specific recommendations
- Format numbers clearly: prices in $, percentages with %`;
}

// ─── Extract profile update from conversation ─────────────────────────────────

function extractProfileUpdate(userMessage: string, currentProfile: string): string | null {
  const lower = userMessage.toLowerCase();

  // Look for risk profile signals in the user message
  const signals: string[] = [];

  if (lower.includes("conservative") || lower.includes("safe") || lower.includes("low risk")) {
    signals.push("Risk tolerance: Conservative");
  } else if (lower.includes("aggressive") || lower.includes("high risk") || lower.includes("speculative")) {
    signals.push("Risk tolerance: Aggressive");
  } else if (lower.includes("moderate") || lower.includes("balanced")) {
    signals.push("Risk tolerance: Moderate");
  }

  if (lower.includes("long term") || lower.includes("hold") || lower.includes("years")) {
    signals.push("Horizon: Long-term investor");
  } else if (lower.includes("short term") || lower.includes("trade") || lower.includes("weeks")) {
    signals.push("Horizon: Short-term trader");
  }

  if (lower.includes("income") || lower.includes("dividend")) {
    signals.push("Goal: Income/dividends");
  } else if (lower.includes("growth") || lower.includes("appreciate")) {
    signals.push("Goal: Capital appreciation");
  }

  if (signals.length === 0) return null;

  // Merge with existing profile
  const newInfo = signals.join(", ");
  return currentProfile ? `${currentProfile}\nUpdated: ${newInfo}` : `Learned from conversation: ${newInfo}`;
}

// ─── Call Claude Opus 4.7 ─────────────────────────────────────────────────────

async function callClaude(messages: ChatMessage[], system: string, apiKey: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-7", // use claude-opus-4-5 as opus-4-7 may not be on your tier yet
      max_tokens: 1024,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    // Fallback to sonnet if opus not available
    if (res.status === 404 || res.status === 403) {
      const fallback = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system,
          messages,
        }),
      });
      if (!fallback.ok) throw new Error(`Claude API error: ${await fallback.text()}`);
      const data = await fallback.json();
      return data.content?.[0]?.text || "No response";
    }
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "No response";
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set in Supabase secrets");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json();
    const { action, message, context, ticker } = body as {
      action: string;
      message?: string;
      context?: StockContext;
      ticker?: string;
    };

    // Extract user ID from auth header
    const authHeader = req.headers.get("authorization") || "";
    const userId = authHeader.length > 10 ? authHeader.slice(-12).replace(/[^a-zA-Z0-9]/g, "x") : "anonymous";

    const currentTicker = ticker || context?.ticker || "UNKNOWN";
    let result: unknown;

    // ── init_session ───────────────────────────────────────────────────────────
    if (action === "get_or_create_agent" || action === "create_session") {
      const history = await getHistory(supabase, userId, currentTicker);
      const userProfile = await getUserProfile(supabase, userId);
      const isReturning = history.length > 0;

      // Build greeting
      const bt = context?.backtestResult;
      let greeting: string;

      if (isReturning) {
        greeting = `Welcome back. I remember our previous analysis of ${currentTicker}${context?.price ? ` — currently at $${context.price.toLocaleString()}` : ""}. What would you like to explore today?`;
      } else if (bt) {
        const direction = bt.forecastPct > 0 ? "bullish" : "bearish";
        greeting = `I've loaded the backtest results for ${currentTicker}. The autoencoder model is ${direction} with a **${bt.signal}** signal, ${bt.confidenceScore}/100 confidence, and ${bt.hitRate}% directional accuracy over ${bt.forecastLabel}. What would you like to know?`;
      } else {
        greeting = `Ready to analyze ${currentTicker}${context?.price ? ` at $${context.price.toLocaleString()}` : ""}. Run a backtest first for deeper insights, or ask me anything about this stock.`;
      }

      result = {
        agent_id: "standard-claude",
        environment_id: "supabase-memory",
        session_id: `${userId}_${currentTicker}`,
        is_returning: isReturning,
        recent_messages: history.slice(-4).map((m) => ({
          role: m.role === "assistant" ? "agent" : m.role,
          content: m.content,
        })),
        greeting,
      };

      // ── send_message ───────────────────────────────────────────────────────────
    } else if (action === "send_message") {
      if (!message) throw new Error("message is required");

      // Load history and profile
      const history = await getHistory(supabase, userId, currentTicker);
      const userProfile = await getUserProfile(supabase, userId);

      // Build system prompt with full context
      const system = buildSystemPrompt(context || {}, userProfile);

      // Add new user message to history
      const updatedHistory: ChatMessage[] = [...history, { role: "user", content: message }];

      // Call Claude
      const response = await callClaude(updatedHistory, system, apiKey);

      // Save updated history with assistant response
      const finalHistory: ChatMessage[] = [...updatedHistory, { role: "assistant", content: response }];
      await saveHistory(supabase, userId, currentTicker, finalHistory);

      // Update user profile if we learned something
      const profileUpdate = extractProfileUpdate(message, userProfile);
      if (profileUpdate) {
        await updateUserProfile(supabase, userId, profileUpdate);
      }

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
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : null,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
