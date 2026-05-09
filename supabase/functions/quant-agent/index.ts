// supabase/functions/quant-agent/index.ts
// QuantAgent — uses standard Anthropic Messages API.
// Keeps the same client action contract: get_or_create_agent / create_session / send_message.
// "Sessions" are simulated by persisting message history in market_updates.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 1024;

type ChatMsg = { role: "user" | "assistant"; content: string };

async function callAnthropic(system: string, messages: ChatMsg[], apiKey: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${text}`);
  const data = JSON.parse(text);
  const block = (data.content || []).find((b: { type: string }) => b.type === "text");
  return block?.text || "No response.";
}

function buildSystem(ctx: Record<string, unknown>): string {
  const br = ctx.backtestResult as Record<string, unknown> | undefined;
  return `You are QuantAgent, a professional quantitative financial analyst in the QuantForecast platform.

Current analysis context:
- Ticker: ${ctx.ticker || "N/A"}
- Price: ${ctx.price ? `$${ctx.price}` : "N/A"}
${ctx.annualReturn ? `- Projected Annual Return: ${(Number(ctx.annualReturn) * 100).toFixed(1)}%` : ""}
${ctx.rSquared ? `- R²: ${ctx.rSquared}` : ""}
${br ? `- Backtest Signal: ${br.signal}
- Confidence: ${br.confidenceScore}/100
- Walk-Forward Accuracy: ${br.walkForwardAccuracy}%
- Hit Rate: ${br.hitRate}%
- Regime: ${br.regime}
- Forecast Move: ${br.forecastPct}%` : ""}

Be direct, specific, and concise (2-4 sentences for simple questions). Reference backtest data when relevant.
You are NOT a licensed financial advisor — note this when giving specific recommendations.`;
}

async function getStored(supabase: ReturnType<typeof createClient>, key: string) {
  const { data } = await supabase
    .from("market_updates")
    .select("content")
    .eq("signal_type", key)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.content || null;
}

async function setStored(
  supabase: ReturnType<typeof createClient>,
  key: string,
  value: string,
  ticker: string | null = null,
) {
  await supabase.from("market_updates").insert({ signal_type: key, content: value, ticker });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { action } = body;
    let result: unknown;

    if (action === "get_or_create_agent") {
      // No real agent in Messages API — return stable synthetic IDs.
      result = { agent_id: "quantagent-v1", environment_id: "default" };

    } else if (action === "create_session") {
      const { ticker: t } = body;
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
        result = {
          session_id: stored.session_id,
          is_returning: true,
          recent_messages: stored.messages || [],
        };
      } else {
        const sessionId = `sess_${crypto.randomUUID()}`;
        await setStored(supabase, sessionKey,
          JSON.stringify({ session_id: sessionId, messages: [] }), t);
        result = { session_id: sessionId, is_returning: false, recent_messages: [] };
      }

    } else if (action === "send_message") {
      const { session_id, message, context: ctx } = body;
      const userId = (req.headers.get("authorization") || "anon").slice(-8);
      const sessionKey = `qa_session_${userId}_${ctx?.ticker}`;

      // Load history
      const stored = await getStored(supabase, sessionKey);
      const parsed = stored ? JSON.parse(stored) : { session_id, messages: [] };
      const history: { role: string; content: string }[] = parsed.messages || [];

      const chatMessages: ChatMsg[] = history.slice(-10).map((m) => ({
        role: m.role === "agent" ? "assistant" : "user",
        content: m.content,
      }));
      chatMessages.push({ role: "user", content: message });

      const response = await callAnthropic(buildSystem(ctx || {}), chatMessages, apiKey);

      const updatedMessages = [
        ...history,
        { role: "user", content: message },
        { role: "agent", content: response },
      ].slice(-20);

      await setStored(
        supabase,
        sessionKey,
        JSON.stringify({ session_id, messages: updatedMessages }),
        ctx?.ticker,
      );

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
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
