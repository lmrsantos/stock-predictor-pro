// supabase/functions/quant-agent/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// QuantAgent — Claude Managed Agents proxy (correct API per official docs)
//
// Managed Agents flow (from platform.claude.com/docs/en/managed-agents):
//   1. Create agent (model + system prompt + tools) → save agent.id
//   2. Create environment (cloud container) → save environment.id
//   3. Create session (agent + environment) → get session.id
//   4. Send user.message event to session
//   5. Poll session events until session.status_idle
//
// All requires: anthropic-beta: managed-agents-2026-04-01
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://api.anthropic.com";
const BETA = "managed-agents-2026-04-01";
const MODEL = "claude-opus-4-7";

// ─── Anthropic API helper ─────────────────────────────────────────────────────

async function ant(path: string, method: string, body?: unknown, key?: string) {
  const apiKey = key || Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": BETA,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${text}`);
  return JSON.parse(text);
}

// ─── Persist IDs in Supabase ──────────────────────────────────────────────────

async function getStored(supabase: ReturnType<typeof createClient>, key: string) {
  const { data } = await supabase
    .from("market_updates")
    .select("content")
    .eq("signal_type", key)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.content || null;
}

async function setStored(supabase: ReturnType<typeof createClient>, key: string, value: string, ticker: string | null = null) {
  await supabase.from("market_updates").insert({
    signal_type: key, content: value, ticker,
  });
}

// ─── Step 1: Get or create agent ──────────────────────────────────────────────

async function getOrCreateAgent(
  supabase: ReturnType<typeof createClient>,
  system: string,
  apiKey: string
): Promise<string> {
  const stored = await getStored(supabase, "qa_agent_id_v2");
  if (stored) return stored;

  const agent = await ant("/v1/beta/agents", "POST", {
    name: "QuantForecast Financial Analyst",
    model: { id: MODEL },
    system,
    tools: [{ type: "agent_toolset_20260401" }],
  }, apiKey);

  await setStored(supabase, "qa_agent_id_v2", agent.id);
  console.log("Created agent:", agent.id);
  return agent.id;
}

// ─── Step 2: Get or create environment ───────────────────────────────────────

async function getOrCreateEnvironment(
  supabase: ReturnType<typeof createClient>,
  apiKey: string
): Promise<string> {
  const stored = await getStored(supabase, "qa_environment_id_v2");
  if (stored) return stored;

  const env = await ant("/v1/beta/environments", "POST", {
    name: "quantforecast-env",
    config: {
      type: "cloud",
      networking: { type: "unrestricted" },
    },
  }, apiKey);

  await setStored(supabase, "qa_environment_id_v2", env.id);
  console.log("Created environment:", env.id);
  return env.id;
}

// ─── Step 3: Create session ───────────────────────────────────────────────────

async function createSession(
  agentId: string,
  environmentId: string,
  ticker: string,
  apiKey: string
): Promise<string> {
  const session = await ant("/v1/beta/sessions", "POST", {
    agent: agentId,
    environment_id: environmentId,
    title: `QuantForecast — ${ticker} analysis`,
  }, apiKey);

  console.log("Created session:", session.id);
  return session.id;
}

// ─── Step 4+5: Send message and collect response ──────────────────────────────

async function sendAndReceive(
  sessionId: string,
  message: string,
  apiKey: string
): Promise<string> {
  // Send the user message event
  await ant(`/v1/beta/sessions/${sessionId}/events`, "POST", {
    events: [{
      type: "user.message",
      content: [{ type: "text", text: message }],
    }],
  }, apiKey);

  // Poll for events until session goes idle
  let response = "";
  let attempts = 0;
  const maxAttempts = 30; // 30 × 2s = 60s max

  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 2000));
    attempts++;

    const events = await ant(
      `/v1/beta/sessions/${sessionId}/events?limit=50&order=desc`,
      "GET", undefined, apiKey
    ) as { data: { type: string; content?: { type: string; text?: string }[]; status?: string }[] };

    for (const event of (events.data || []).reverse()) {
      if (event.type === "agent.message" && event.content) {
        for (const block of event.content) {
          if (block.type === "text" && block.text) {
            response = block.text;
          }
        }
      }
      if (event.type === "session.status_idle" || event.status === "idle") {
        return response || "Analysis complete.";
      }
    }
  }

  return response || "Response timed out. Please try again.";
}

// ─── System prompt builder ────────────────────────────────────────────────────

function buildSystem(ctx: Record<string, unknown>): string {
  return `You are QuantAgent, a professional quantitative financial analyst in the QuantForecast platform.

Current analysis context:
- Ticker: ${ctx.ticker || "N/A"}
- Price: ${ctx.price ? `$${ctx.price}` : "N/A"}
${ctx.annualReturn ? `- Projected Annual Return: ${(Number(ctx.annualReturn) * 100).toFixed(1)}%` : ""}
${ctx.rSquared ? `- R² (trend reliability): ${ctx.rSquared}` : ""}
${ctx.backtestResult ? `- Backtest Signal: ${(ctx.backtestResult as Record<string,unknown>).signal}
- Confidence: ${(ctx.backtestResult as Record<string,unknown>).confidenceScore}/100
- Walk-Forward Accuracy: ${(ctx.backtestResult as Record<string,unknown>).walkForwardAccuracy}%
- Hit Rate: ${(ctx.backtestResult as Record<string,unknown>).hitRate}%
- Regime: ${(ctx.backtestResult as Record<string,unknown>).regime}
- Forecast Move: ${(ctx.backtestResult as Record<string,unknown>).forecastPct}%` : ""}

You can use web search to get current news and market data. Be direct and specific.
Always note you are not a licensed financial advisor when giving specific recommendations.`;
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
    const { action, context, ticker } = body;

    let result: unknown;

    // ── get_or_create_agent ──────────────────────────────────────────────────
    if (action === "get_or_create_agent") {
      const system = buildSystem(context || {});
      const agentId = await getOrCreateAgent(supabase, system, apiKey);
      const envId = await getOrCreateEnvironment(supabase, apiKey);
      result = { agent_id: agentId, environment_id: envId };

    // ── create_session ───────────────────────────────────────────────────────
    } else if (action === "create_session") {
      const { agent_id, environment_id, ticker: t } = body;

      // Check for cached session (valid 4 hours)
      const userId = (req.headers.get("authorization") || "anon").slice(-8);
      const sessionKey = `qa_session_${userId}_${t}`;
      const since = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
      const { data: cached } = await supabase
        .from("market_updates")
        .select("content, created_at")
        .eq("signal_type", sessionKey)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1);

      if (cached?.length) {
        const stored = JSON.parse(cached[0].content);
        result = { session_id: stored.session_id, is_returning: true, recent_messages: stored.messages || [] };
      } else {
        const sessionId = await createSession(agent_id, environment_id, t, apiKey);
        await setStored(supabase, sessionKey,
          JSON.stringify({ session_id: sessionId, messages: [] }), t);
        result = { session_id: sessionId, is_returning: false, recent_messages: [] };
      }

    // ── send_message ─────────────────────────────────────────────────────────
    } else if (action === "send_message") {
      const { session_id, message, context: ctx } = body;

      // Build enriched message with current context
      const enriched = `Regarding ${ctx?.ticker || "this stock"} (current price: ${ctx?.price ? `$${ctx.price}` : "N/A"}):

${message}

${ctx?.backtestResult ? `Backtest context: Signal=${ctx.backtestResult.signal}, Confidence=${ctx.backtestResult.confidenceScore}/100, HitRate=${ctx.backtestResult.hitRate}%, Regime=${ctx.backtestResult.regime}` : ""}`;

      const response = await sendAndReceive(session_id, enriched, apiKey);

      // Update session message history
      const userId = (req.headers.get("authorization") || "anon").slice(-8);
      const sessionKey = `qa_session_${userId}_${ctx?.ticker}`;
      const { data: existing } = await supabase
        .from("market_updates").select("content")
        .eq("signal_type", sessionKey)
        .order("created_at", { ascending: false }).limit(1);

      if (existing?.length) {
        const stored = JSON.parse(existing[0].content);
        const messages = [
          ...(stored.messages || []),
          { role: "user", content: message },
          { role: "agent", content: response },
        ].slice(-10);
        await setStored(supabase, sessionKey,
          JSON.stringify({ session_id: session_id, messages }), ctx?.ticker);
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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
