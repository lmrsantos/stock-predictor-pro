// supabase/functions/quant-agent/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Supabase edge function that proxies all Claude Managed Agents API calls.
// Keeps the Anthropic API key server-side only.
//
// Actions:
//   get_or_create_agent  → create or retrieve the persistent agent definition
//   create_session       → start a new session tied to ticker + user
//   send_message         → send a message and stream back the response
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_BASE = "https://api.anthropic.com";
const MANAGED_AGENTS_BETA = "managed-agents-2026-04-01";
const AGENT_MODEL = "claude-opus-4-7";

// ─── Anthropic API helper ─────────────────────────────────────────────────────

async function anthropic(
  path: string,
  method: string,
  body?: unknown,
  apiKey?: string
): Promise<unknown> {
  const key = apiKey || Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured");

  const res = await fetch(`${ANTHROPIC_API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": MANAGED_AGENTS_BETA,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }
  return res.json();
}

// ─── Agent registry — persist agent_id in Supabase ───────────────────────────
// We create the agent once and reuse it across all users/sessions.
// The agent definition (system prompt, tools, model) is stored in Anthropic's
// infrastructure — we just keep the ID in our DB.

async function getOrCreateAgent(
  supabase: ReturnType<typeof createClient>,
  name: string,
  model: string,
  system: string,
  apiKey: string
): Promise<string> {
  // Check if we already have an agent stored
  const { data: existing } = await supabase
    .from("market_updates")
    .select("content")
    .eq("signal_type", `managed_agent_id_${name}`)
    .order("created_at", { ascending: false })
    .limit(1);

  if (existing?.length && existing[0].content) {
    return existing[0].content;
  }

  // Create new agent via Managed Agents API
  const agent = await anthropic("/v1/agents", "POST", {
    name,
    model: { id: model },
    system,
    tools: [
      { type: "agent_toolset_20260401" }, // full toolset: bash, files, web search
    ],
    mcp_servers: [
      // Moody's MCP for financial data (requires Moody's connector enabled)
      // Uncomment when Moody's MCP is configured in your Anthropic account:
      // { type: "url", url: "https://mcp.moodys.com/sse", name: "moodys" },
    ],
  }, apiKey) as { id: string };

  // Store agent ID
  await supabase.from("market_updates").insert({
    signal_type: `managed_agent_id_${name}`,
    content: agent.id,
    ticker: null,
  });

  return agent.id;
}

// ─── Session management ───────────────────────────────────────────────────────
// Sessions are per-user per-ticker. We store session IDs in Supabase.
// A returning session means the agent already has context about this ticker.

async function getOrCreateSession(
  supabase: ReturnType<typeof createClient>,
  agentId: string,
  userId: string,
  ticker: string,
  context: unknown,
  apiKey: string
): Promise<{ session_id: string; is_returning: boolean; recent_messages: unknown[] }> {
  const sessionKey = `agent_session_${userId}_${ticker}`;

  // Check for existing active session
  const { data: existing } = await supabase
    .from("market_updates")
    .select("content, created_at")
    .eq("signal_type", sessionKey)
    .order("created_at", { ascending: false })
    .limit(1);

  // Session is valid if created within 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  if (existing?.length && existing[0].created_at > oneDayAgo) {
    const stored = JSON.parse(existing[0].content);
    return {
      session_id: stored.session_id,
      is_returning: true,
      recent_messages: stored.recent_messages || [],
    };
  }

  // Create new session with memory store attached
  const session = await anthropic("/v1/sessions", "POST", {
    agent_id: agentId,
    // Memory store: agent reads/writes user profile and ticker history here
    memory: {
      stores: [
        {
          name: "user_profile",
          // Initial context about this analysis session
          initial_content: `# User Analysis Session\n\nTicker: ${ticker}\nContext: ${JSON.stringify(context, null, 2)}\n\n# Investment Profile\nRisk tolerance: To be learned from conversation\nPrevious tickers analyzed: ${ticker}`,
        }
      ],
    },
    // Enable dreaming so agent self-improves from past sessions
    dreaming: {
      enabled: true,
      mode: "automatic",
    },
  }, apiKey) as { id: string };

  // Store session ID
  await supabase.from("market_updates").insert({
    signal_type: sessionKey,
    content: JSON.stringify({ session_id: session.id, recent_messages: [] }),
    ticker,
  });

  return { session_id: session.id, is_returning: false, recent_messages: [] };
}

// ─── Send message and get response ───────────────────────────────────────────

async function sendMessage(
  sessionId: string,
  agentId: string,
  message: string,
  context: unknown,
  apiKey: string
): Promise<string> {
  // Send message to the managed agent session
  const run = await anthropic(`/v1/sessions/${sessionId}/runs`, "POST", {
    agent_id: agentId,
    input: {
      type: "text",
      text: `User question about ${(context as { ticker?: string }).ticker || "this stock"}: ${message}

Current market context: ${JSON.stringify(context)}`,
    },
    // Wait for completion (sync mode for chat UX)
    wait: true,
    max_wait_seconds: 30,
  }, apiKey) as { output?: { text?: string }; status?: string; error?: string };

  // Extract text response
  if (run.output?.text) return run.output.text;
  if (run.status === "error") throw new Error(run.error || "Agent run failed");

  return "I encountered an issue processing your request. Please try again.";
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured in Supabase secrets");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action } = body;

    // Extract user ID from auth header (or use anonymous)
    const authHeader = req.headers.get("authorization") || "";
    const userId = authHeader ? authHeader.split(".")[1] || "anonymous" : "anonymous";

    let result: unknown;

    if (action === "get_or_create_agent") {
      const { name, model, system } = body;
      const agentId = await getOrCreateAgent(supabase, name, model, system, apiKey);
      result = { agent_id: agentId };

    } else if (action === "create_session") {
      const { agent_id, ticker, context } = body;
      const sessionData = await getOrCreateSession(
        supabase, agent_id, userId, ticker, context, apiKey
      );
      result = sessionData;

    } else if (action === "send_message") {
      const { session_id, agent_id, message, context } = body;
      const response = await sendMessage(session_id, agent_id, message, context, apiKey);

      // Store message in session history for future reference
      const sessionKey = `agent_session_${userId}_${context.ticker}`;
      const { data: existing } = await supabase
        .from("market_updates")
        .select("content")
        .eq("signal_type", sessionKey)
        .order("created_at", { ascending: false })
        .limit(1);

      if (existing?.length) {
        const stored = JSON.parse(existing[0].content);
        const recent = [
          ...(stored.recent_messages || []),
          { role: "user", content: message },
          { role: "agent", content: response },
        ].slice(-10); // keep last 10 messages

        await supabase.from("market_updates").insert({
          signal_type: sessionKey,
          content: JSON.stringify({ session_id, recent_messages: recent }),
          ticker: context.ticker,
        });
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
