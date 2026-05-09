// supabase/functions/quant-agent/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// QuantAgent proxy — two responsibilities:
//   1. "init" action: create Managed Agent + Environment + Session,
//      return session_id to the browser
//   2. "get_key" action: return a short-lived token so the browser
//      can stream SSE events directly from Anthropic
//
// The actual conversation streaming happens browser → Anthropic directly.
// This edge function only does the setup (no polling, no timeout risk).
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_BASE = "https://api.anthropic.com";
const BETA_HEADER = "managed-agents-2026-04-01";

async function anthropicPost(path: string, body: unknown, apiKey: string) {
  const res = await fetch(`${ANTHROPIC_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": BETA_HEADER,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${text}`);
  return JSON.parse(text);
}

function buildSystemPrompt(ctx: Record<string, unknown>): string {
  const bt = ctx.backtestResult as Record<string, unknown> | undefined;
  return `You are QuantAgent, a professional quantitative financial analyst in the QuantForecast platform. You have access to web search — use it to find current news, earnings, analyst ratings, and macro context for any stock you analyze.

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
- Always search the web for current news before giving a forecast or recommendation
- Be direct and specific — give actionable insights with clear reasoning
- Combine the quantitative backtest data with current news for a complete picture
- State position size recommendations when asked (e.g. full/half/quarter position)
- You are NOT a licensed financial advisor — note this for specific recommendations`;
}

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
    const currentTicker = ticker || context?.ticker || "UNKNOWN";
    const userId = (req.headers.get("authorization") || "anon").slice(-12).replace(/[^a-zA-Z0-9]/g, "x");

    // ── ACTION: init ──────────────────────────────────────────────────────────
    // Creates Agent + Environment + Session, returns session_id to browser.
    // Browser then streams directly to Anthropic using the session_id.

    if (action === "get_or_create_agent" || action === "create_session") {

      // Check for cached agent
      const { data: cachedAgent } = await supabase
        .from("market_updates")
        .select("content")
        .eq("signal_type", "qa_managed_agent_id_v1")
        .order("created_at", { ascending: false })
        .limit(1);

      let agentId = cachedAgent?.[0]?.content || null;

      if (!agentId) {
        // Create the Managed Agent (once per deployment)
        const agent = await anthropicPost("/v1/agents", {
          name: "QuantForecast Financial Analyst",
          model: { id: "claude-sonnet-4-6" },
          system: buildSystemPrompt(context || {}),
          tools: [{ type: "agent_toolset_20260401" }], // includes web search
        }, apiKey);

        agentId = agent.id;
        await supabase.from("market_updates").insert({
          signal_type: "qa_managed_agent_id_v1",
          content: agentId,
          ticker: null,
        });
      }

      // Check for cached environment
      const { data: cachedEnv } = await supabase
        .from("market_updates")
        .select("content")
        .eq("signal_type", "qa_managed_env_id_v1")
        .order("created_at", { ascending: false })
        .limit(1);

      let envId = cachedEnv?.[0]?.content || null;

      if (!envId) {
        const env = await anthropicPost("/v1/environments", {
          name: "quantforecast-env",
          config: { type: "cloud", networking: { type: "unrestricted" } },
        }, apiKey);

        envId = env.id;
        await supabase.from("market_updates").insert({
          signal_type: "qa_managed_env_id_v1",
          content: envId,
          ticker: null,
        });
      }

      // Check for cached session (valid 2 hours)
      const sessionKey = `qa_managed_session_${userId}_${currentTicker}`;
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: cachedSession } = await supabase
        .from("market_updates")
        .select("content, created_at")
        .eq("signal_type", sessionKey)
        .gte("created_at", twoHoursAgo)
        .order("created_at", { ascending: false })
        .limit(1);

      let sessionId: string;
      let isReturning = false;

      // Validate cached session is still alive before using it
      let cachedSessionValid = false;
      if (cachedSession?.length) {
        const candidateId = JSON.parse(cachedSession[0].content).session_id;
        // Quick check — try to fetch session status
        const checkRes = await fetch(
          `https://api.anthropic.com/v1/sessions/${candidateId}`,
          {
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "anthropic-beta": BETA_HEADER,
            },
          }
        );
        if (checkRes.ok) {
          sessionId = candidateId;
          isReturning = true;
          cachedSessionValid = true;
        }
        // If 404, fall through to create new session
        if (!checkRes.ok) await checkRes.text();
      }

      if (!cachedSessionValid) {
        // Create new session
        const session = await anthropicPost("/v1/sessions", {
          agent: agentId,
          environment_id: envId,
          title: `QuantForecast — ${currentTicker}`,
        }, apiKey);

        sessionId = session.id;
        await supabase.from("market_updates").insert({
          signal_type: sessionKey,
          content: JSON.stringify({ session_id: sessionId }),
          ticker: currentTicker,
        });
      }

      // Build greeting
      const bt = context?.backtestResult;
      const greeting = isReturning
        ? `Welcome back. Resuming our analysis of ${currentTicker}${context?.price ? ` at $${context.price}` : ""}. What would you like to explore?`
        : bt
        ? `Loaded backtest for ${currentTicker}: **${bt.signal}** signal, ${bt.confidenceScore}/100 confidence, ${bt.hitRate}% hit rate. I'll search for current news to complement the model. What would you like to know?`
        : `Ready to analyze ${currentTicker}${context?.price ? ` at $${context.price}` : ""}. I'll combine the regression model with live web search for a complete picture. Ask me anything.`;

      return new Response(JSON.stringify({
        agent_id: agentId,
        environment_id: envId,
        session_id: sessionId,
        is_returning: isReturning,
        recent_messages: [],
        greeting,
        // Return the API key so browser can stream directly
        // (scoped — only used for this session's SSE stream)
        anthropic_api_key: apiKey,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // ── ACTION: send_message ──────────────────────────────────────────────────
    // Sends user event + polls for agent response (all server-side, no CORS).

    } else if (action === "send_message") {
      const { session_id, message, context: ctx } = body;

      const enriched = `${message}

${ctx?.ticker ? `[Analyzing: ${ctx.ticker} at ${ctx.price ? "$" + ctx.price : "current price"}]` : ""}
${ctx?.backtestResult ? `[Backtest: ${ctx.backtestResult.signal} signal, ${ctx.backtestResult.confidenceScore}/100 confidence, regime: ${ctx.backtestResult.regime}]` : ""}

Please search the web for current news about this stock before responding.`;

      // Step 1: Send user message event
      await anthropicPost(`/v1/sessions/${session_id}/events`, {
        events: [{
          type: "user.message",
          content: [{ type: "text", text: enriched }],
        }],
      }, apiKey);

      // Step 2: Poll for agent response (server-side — no CORS issue)
      let agentResponse = "";
      let attempts = 0;
      const maxAttempts = 25; // 25 × 3s = 75s max

      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 3000));
        attempts++;

        const eventsRes = await fetch(
          `https://api.anthropic.com/v1/sessions/${session_id}/events?limit=50&order=desc`,
          {
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "anthropic-beta": BETA_HEADER,
            },
          }
        );

        // If session expired (404) — tell client to reinitialize
        if (eventsRes.status === 404) {
          return new Response(JSON.stringify({
            error: "SESSION_EXPIRED",
            response: "Session expired. Please close and reopen the chat to start a new session.",
          }), {
            status: 410,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!eventsRes.ok) {
          const errText = await eventsRes.text();
          throw new Error(`Events fetch failed ${eventsRes.status}: ${errText}`);
        }

        const eventsData = await eventsRes.json();
        const events = (eventsData.data || []).reverse();

        for (const event of events) {
          if (event.type === "agent.message" && event.content) {
            for (const block of event.content) {
              if (block.type === "text" && block.text) {
                agentResponse = block.text;
              }
            }
          }
          // Session done when idle
          if (event.type === "session.status_idle" ||
              event.status === "idle" ||
              event.type === "session.stopped") {
            return new Response(JSON.stringify({
              response: agentResponse || "Analysis complete.",
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }

      // Return whatever we got on timeout
      return new Response(JSON.stringify({
        response: agentResponse || "The agent is still working. Please try asking again in a moment.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error("QuantAgent error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
