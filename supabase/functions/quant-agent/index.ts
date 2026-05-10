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

// ─── Active macro themes (updated periodically) ──────────────────────────────
// These encode the "ripple effect" thematic intelligence:
// Government/narrative signal → sector momentum → individual stock price

const MACRO_THEMES = [
  {
    name: "AI Infrastructure Build-Out",
    conviction: "HIGH",
    catalysts: ["AI token usage up 250% since Jan 2026", "Compute demand exceeds supply", "Hyperscaler capex at record levels"],
    ripple1: ["NVDA", "AMD", "AVGO", "AMAT", "MU"],
    ripple2: ["NEE", "CEG", "VST", "EQIX", "DLR", "AMT"],
    ripple3: ["CPER", "XLI", "CAT", "PWR"],
  },
  {
    name: "Space Economy & Defense",
    conviction: "HIGH",
    catalysts: ["Golden Dome missile defense program", "SpaceX IPO anticipation", "NATO 5% GDP defense target", "RKLB backlog doubled to $2.2B"],
    ripple1: ["RKLB", "LUNR", "ASTS", "RDW"],
    ripple2: ["LMT", "RTX", "NOC", "KTOS", "AXON", "PLTR"],
    ripple3: ["HWM", "TDG", "CW", "HII", "GD"],
  },
  {
    name: "Semiconductor Reshoring (CHIPS Act)",
    conviction: "HIGH",
    catalysts: ["CHIPS Act funding deployment", "Government investing in INTC", "AI chip demand structural shortage"],
    ripple1: ["INTC", "AMAT", "KLAC", "LRCX", "SNPS"],
    ripple2: ["ON", "WOLF", "SWKS", "MPWR", "MCHP"],
    ripple3: ["XLI", "CAT", "EMR"],
  },
  {
    name: "Energy & Power Infrastructure",
    conviction: "HIGH",
    catalysts: ["AI data center power demand up 15-yr high", "Nuclear renaissance", "Oil elevated on Iran conflict ($95+ Brent)"],
    ripple1: ["NEE", "CEG", "VST", "NRG"],
    ripple2: ["XEL", "ETR", "EXC", "PPL"],
    ripple3: ["PWR", "HUBB", "ETN"],
  },
  {
    name: "Biotech M&A Wave",
    conviction: "MEDIUM",
    catalysts: ["Pharma patent cliff $200B+ at risk", "Biotech M&A 2025 surpassed all of 2024", "Trump deregulation speeding FDA approvals"],
    ripple1: ["MRNA", "BIIB", "SGEN", "ALNY", "VRTX"],
    ripple2: ["LLY", "ABBV", "JNJ", "MRK", "PFE"],
    ripple3: ["ISRG", "DXCM", "ILMN"],
  },
  {
    name: "Multipolar World & Geopolitics",
    conviction: "MEDIUM",
    catalysts: ["Iran Strait of Hormuz disruption", "US-China tech decoupling", "European defense spending revival"],
    ripple1: ["XLE", "USO", "CVX", "XOM"],
    ripple2: ["GLD", "IAU", "SLV"],
    ripple3: ["LMT", "RTX", "NOC"],
  },
];

function getThematicContext(ticker: string): string {
  const upper = ticker.toUpperCase();
  const matches: { themeName: string; order: number; conviction: string; catalysts: string[] }[] = [];

  for (const theme of MACRO_THEMES) {
    if (theme.ripple1.includes(upper)) {
      matches.push({ themeName: theme.name, order: 1, conviction: theme.conviction, catalysts: theme.catalysts });
    } else if (theme.ripple2.includes(upper)) {
      matches.push({ themeName: theme.name, order: 2, conviction: theme.conviction, catalysts: theme.catalysts });
    } else if (theme.ripple3.includes(upper)) {
      matches.push({ themeName: theme.name, order: 3, conviction: theme.conviction, catalysts: theme.catalysts });
    }
  }

  if (matches.length === 0) return "No active macro themes directly apply to this ticker.";

  const orderLabel = (o: number) => o === 1 ? "DIRECT beneficiary" : o === 2 ? "SECONDARY beneficiary" : "INDIRECT beneficiary";
  return matches.map(m =>
    `📊 Theme: ${m.themeName} [${m.conviction} conviction]
` +
    `   Position: ${orderLabel(m.order)} (order ${m.order} of 3)
` +
    `   Active catalysts:
${m.catalysts.map(c => `     - ${c}`).join("
")}`
  ).join("

");
}

function buildSystemPrompt(ctx: Record<string, unknown>): string {
  const bt = ctx.backtestResult as Record<string, unknown> | undefined;
  const ticker = (ctx.ticker as string) || "N/A";
  const thematicContext = getThematicContext(ticker);

  return `You are QuantAgent, a professional quantitative financial analyst in the QuantForecast platform. You have access to web search — use it to find current news, earnings dates, analyst ratings, and macro context.

## Current Stock Context
- Ticker: ${ticker}
- Price: ${ctx.price ? "$" + ctx.price : "N/A"}
${ctx.annualReturn ? `- Regression Annual Return: ${(Number(ctx.annualReturn) * 100).toFixed(1)}%` : ""}
${ctx.rSquared ? `- R² (trend reliability): ${ctx.rSquared}` : ""}
${bt ? `
## Quantitative Backtest Results
- Signal: ${bt.signal}
- Confidence: ${bt.confidenceScore}/100
- Walk-Forward Accuracy: ${bt.walkForwardAccuracy}%
- Direction Hit Rate: ${bt.hitRate}%
- Market Regime: ${bt.regime}
- Projected Move: ${bt.forecastPct}% over ${bt.forecastLabel}` : ""}

## Active Macro Themes (Thematic Intelligence)
${thematicContext}

## How to Think About This Stock
1. First check if the thematic context above applies — is this stock in the path of a major catalyst ripple?
2. Search for current news — earnings date, recent contracts, analyst upgrades/downgrades
3. Check if there's a pattern of earnings beats (conservative guidance = positive surprise setup)
4. Look for upcoming binary events (earnings, FDA decisions, government contract announcements)
5. Combine quant signal + thematic position + current news for a complete picture

## Your Response Format
Always structure your response as:
- **Thematic Position:** (is this stock in a hot theme? which order?)
- **Key Catalyst:** (what's the most important near-term driver?)
- **Quant Signal Context:** (does the price model align with the theme?)
- **Key Risk:** (what could go wrong?)
- **Bottom Line:** (1-2 sentence actionable conclusion)

## Guidelines
- Always search the web before responding
- Be direct — no hedging on every sentence
- Reference specific data points (exact %, dates, dollar amounts)
- Note upcoming earnings dates if known — these are binary events
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

    // ── ACTION: get_or_create_agent ───────────────────────────────────────────
    // Returns agent_id + environment_id (cached after first call).
    // Cheap — just reads from Supabase if already created.

    if (action === "get_or_create_agent") {
      const { data: cachedAgentOnly } = await supabase
        .from("market_updates").select("content")
        .eq("signal_type", "qa_managed_agent_id_v1")
        .order("created_at", { ascending: false }).limit(1);

      let agentId = cachedAgentOnly?.[0]?.content || null;
      if (!agentId) {
        const agent = await anthropicPost("/v1/agents", {
          name: "QuantForecast Financial Analyst",
          model: { id: "claude-sonnet-4-6" },
          system: buildSystemPrompt(context || {}),
          tools: [{ type: "agent_toolset_20260401" }],
        }, apiKey);
        agentId = agent.id;
        await supabase.from("market_updates").insert({
          signal_type: "qa_managed_agent_id_v1", content: agentId, ticker: null,
        });
      }

      const { data: cachedEnvOnly } = await supabase
        .from("market_updates").select("content")
        .eq("signal_type", "qa_managed_env_id_v1")
        .order("created_at", { ascending: false }).limit(1);

      let envId = cachedEnvOnly?.[0]?.content || null;
      if (!envId) {
        const env = await anthropicPost("/v1/environments", {
          name: "quantforecast-env",
          config: { type: "cloud", networking: { type: "unrestricted" } },
        }, apiKey);
        envId = env.id;
        await supabase.from("market_updates").insert({
          signal_type: "qa_managed_env_id_v1", content: envId, ticker: null,
        });
      }

      return new Response(JSON.stringify({ agent_id: agentId, environment_id: envId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // ── ACTION: create_session ────────────────────────────────────────────────
    // Creates a new session for a specific ticker + purpose.
    // Each caller (chat, backtest, hotspot) gets its own session.
    // Sessions are cached per userId + ticker + purpose for 2 hours.

    } else if (action === "create_session") {
      const { agent_id, environment_id, ticker: t, purpose = "chat" } = body;

      const sessionKey = `qa_session_${userId}_${t}_${purpose}`;
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
      let cachedSessionValid = false;

      if (cachedSession?.length) {
        const candidateId = JSON.parse(cachedSession[0].content).session_id;
        const checkRes = await fetch(`https://api.anthropic.com/v1/sessions/${candidateId}`, {
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-beta": BETA_HEADER },
        });
        if (checkRes.ok) {
          sessionId = candidateId;
          isReturning = true;
          cachedSessionValid = true;
        }
        if (!checkRes.ok) await checkRes.text();
      }

      if (!cachedSessionValid) {
        const session = await anthropicPost("/v1/sessions", {
          agent: agent_id,
          environment_id,
          title: `QuantForecast — ${t} (${purpose})`,
        }, apiKey);
        sessionId = session.id;
        await supabase.from("market_updates").insert({
          signal_type: sessionKey,
          content: JSON.stringify({ session_id: sessionId }),
          ticker: t,
        });
      }

      // Build greeting for chat sessions
      const bt = context?.backtestResult;
      const greeting = isReturning
        ? `Welcome back. Resuming our analysis of ${currentTicker}${context?.price ? ` at $${context.price}` : ""}. What would you like to explore?`
        : bt
        ? `Loaded backtest for ${currentTicker}: **${bt.signal}** signal, ${bt.confidenceScore}/100 confidence, ${bt.hitRate}% hit rate. I'll search for current news to complement the model. What would you like to know?`
        : `Ready to analyze ${currentTicker}${context?.price ? ` at $${context.price}` : ""}. I'll combine the regression model with live web search for a complete picture. Ask me anything.`;

      return new Response(JSON.stringify({
        session_id: sessionId,
        is_returning: isReturning,
        recent_messages: [],
        greeting,
        anthropic_api_key: apiKey,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // ── LEGACY: get_or_create_agent + create_session combined ────────────────
    // Kept for backward compatibility with QuantAgent.tsx chat bubble.

    } else if (action === "get_or_create_agent_and_session") {

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
