// supabase/functions/quant-agent/index.ts
// Educational quant analyst chat via Lovable AI Gateway (Gemini).
// Returns responses synchronously — no managed-agent streaming.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mirror of primary sector membership from src/lib/sector-universes.ts.
// Only the sectors we actually run linkage tests over.
const SECTOR_OF: Record<string, string> = {};
const SECTOR_UNIVERSES: Record<string, string[]> = {
  "Semiconductors":         ["NVDA","AMD","AVGO","TSM","QCOM","INTC","AMAT","LRCX","KLAC","MU","ASML","MRVL","NXPI","ADI","TXN","ON","MCHP","SWKS","QRVO","MPWR","ARM","SMCI","WOLF","STM","TER","ENTG","ALAB","CRDO","SITM","RMBS"],
  "Software":               ["MSFT","ORCL","CRM","ADBE","NOW","INTU","PANW","SNPS","CDNS","WDAY","TEAM","DDOG","CRWD","SNOW","NET","ZS","MDB","HUBS","DOCU","OKTA","ZM","SHOP"],
  "Mega-cap Tech":          ["AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","AVGO","ORCL","NFLX"],
  "Banks":                  ["JPM","BAC","WFC","C","GS","MS","USB","PNC","TFC","SCHW","COF","BK","STT","RF","FITB","HBAN","KEY","MTB","CFG","ZION"],
  "Biotech & Pharma":       ["LLY","JNJ","ABBV","MRK","PFE","TMO","ABT","BMY","AMGN","GILD","VRTX","REGN","MRNA","BIIB","ISRG","ZTS","CVS","UNH"],
  "Energy":                 ["XOM","CVX","COP","EOG","SLB","PSX","MPC","VLO","OXY","PXD","HES","DVN","FANG","HAL","BKR","KMI","WMB","OKE"],
  "Consumer Staples":       ["WMT","COST","PG","KO","PEP","MDLZ","CL","KMB","GIS","K","HSY","SYY","CHD","CLX","MNST","STZ","TGT","KR"],
  "Consumer Discretionary": ["AMZN","TSLA","HD","MCD","NKE","SBUX","LOW","BKNG","TJX","CMG","ABNB","ORLY","AZO","DPZ","YUM","MAR","DRI","RCL","CCL"],
  "Industrials & Defense":  ["CAT","BA","LMT","RTX","HON","UNP","GE","DE","NOC","GD","ETN","EMR","ITW","PH","CSX","NSC","FDX","UPS","WM"],
  "Utilities":              ["NEE","DUK","SO","D","AEP","SRE","XEL","EXC","PEG","WEC","ED","ETR","ES","AWK","PCG","CEG","VST"],
  "Real Estate":            ["AMT","PLD","EQIX","CCI","PSA","O","WELL","VICI","DLR","SBAC","SPG","AVB","EQR","ARE","EXR","VTR","WY"],
  "Quantum Computing":      ["IONQ","RGTI","QBTS","QUBT","ARQQ"],
  "Aerospace & Space":      ["LMT","RTX","NOC","GD","BA","HEI","TDG","RKLB","ASTS","LUNR","SPCE","PL"],
};
for (const [sector, syms] of Object.entries(SECTOR_UNIVERSES)) {
  for (const s of syms) if (!SECTOR_OF[s]) SECTOR_OF[s] = sector;
}

interface ValidatedLinkage {
  leader: string; follower: string; lag: number;
  sign: 1 | -1; coef: number; pAdj: number; dRsq: number;
  channel: string; regimeSignFlip: boolean;
}

async function loadLinkages(): Promise<{ asOf?: string; validated: ValidatedLinkage[] } | null> {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(url, service);
    const { data } = await client
      .from("linkage_cache").select("payload, updated_at").eq("id", 1).maybeSingle();
    if (!data?.payload) return null;
    return data.payload as any;
  } catch (e) {
    console.warn("linkage load failed", e);
    return null;
  }
}

function linkageBlock(ticker: string, cache: { asOf?: string; validated: ValidatedLinkage[] } | null): string {
  if (!cache || !cache.validated?.length) return "";
  const sector = SECTOR_OF[ticker.toUpperCase()];
  const relevant = cache.validated.filter(
    (v) => v.leader === sector || v.follower === sector,
  ).slice(0, 6);
  if (relevant.length === 0) return "";
  const lines = relevant.map((v) => {
    const dir = v.sign > 0 ? "positive" : "inverse";
    const flip = v.regimeSignFlip ? " (regime-dependent sign)" : "";
    return `  • ${v.leader} → ${v.follower}: ${dir}, lag ${v.lag}d, coef ${v.coef}, ΔR² ${v.dRsq}${flip} — ${v.channel}`;
  });
  return `

VALIDATED CROSS-SECTOR LINKAGES (as of ${cache.asOf?.slice(0,10) ?? "recent"}, ${ticker}'s sector: ${sector ?? "n/a"}):
${lines.join("\n")}

When discussing catalysts, risks, or what could move ${ticker}, reference these lead-lag relationships where relevant. They come from BH-corrected, split-half validated Granger-style regressions on the platform's sector composites.`;
}

function buildSystemPrompt(ctx: Record<string, any>, linkages: string): string {
  const bt = ctx?.backtestResult;
  const f = ctx?.fundamentals || {};
  return `You are QuantAgent — a sharp, senior-level quantitative analyst embedded in the QuantForecast platform. You think like a hedge-fund quant: rigorous, numerate, opinionated about *what the model says*, and unafraid to discuss macro regimes, sector dynamics, factor exposures, valuation, technicals, risk, and market microstructure.

TONE & DEPTH:
- Talk like a smart quant desk analyst, not a chatbot. Direct, substantive, high signal-to-noise.
- Use concrete numbers from the context whenever possible. Reference R², slope, hit rate, regime, P/E, sector, etc.
- Explain *why* — walk through the reasoning, mechanisms, historical analogues, and what would invalidate the thesis.
- Discuss trade-offs, base rates, and what typically drives moves like this in similar regimes.
- Markdown-friendly: use **bold**, bullet lists, and small tables when they add clarity.
- Length: match the question. Quick question → 2-4 sentences. Analytical question → structured breakdown with sections.

LEGAL FRAMING (mandatory but light-touch — don't neuter every answer):
- You are NOT a registered financial advisor; this is educational analysis of models and market data.
- Frame conclusions as "the model suggests", "historically", "one interpretation", "the setup looks like…".
- Never say "you should buy/sell X shares" or give personalized dollar amounts. Percentages and illustrative math are fine.
- Add a brief "past performance ≠ future results" note only when the user is clearly leaning on a projection.

WHAT YOU CAN DO:
- Interpret the backtest, regression, and regime.
- Discuss fundamentals (P/E, EPS, margins, sector context) when provided.
- Compare against typical behavior of the sector or similar setups.
- Explain risks, catalysts, what to watch, and how the thesis would break.
- If asked about very recent news you don't have, say so once and pivot to what the *model + fundamentals* imply.

CURRENT CONTEXT:
- Ticker: ${ctx?.ticker || "N/A"}
- Price: ${ctx?.price ? "$" + ctx.price : "N/A"}
${ctx?.annualReturn != null ? `- Regression implied annual return: ${(Number(ctx.annualReturn) * 100).toFixed(1)}%` : ""}
${ctx?.rSquared != null ? `- R² (trend reliability, 0-1): ${ctx.rSquared}` : ""}
${ctx?.slope != null ? `- Trend slope: $${Number(ctx.slope).toFixed(4)}/day` : ""}
${f.sector ? `- Sector: ${f.sector}` : ""}
${f.industry ? `- Industry: ${f.industry}` : ""}
${f.pe_ratio != null ? `- P/E: ${Number(f.pe_ratio).toFixed(2)}` : ""}
${f.forward_pe != null ? `- Forward P/E: ${Number(f.forward_pe).toFixed(2)}` : ""}
${f.eps != null ? `- EPS: $${Number(f.eps).toFixed(2)}` : ""}
${f.market_cap != null ? `- Market Cap: $${(Number(f.market_cap) / 1e9).toFixed(1)}B` : ""}
${f.dividend_yield != null ? `- Dividend Yield: ${(Number(f.dividend_yield) * 100).toFixed(2)}%` : ""}
${bt ? `- Backtest: **${bt.signal}** signal, confidence ${bt.confidenceScore}/100, hit rate ${bt.hitRate}%, walk-forward acc ${bt.walkForwardAccuracy}%, regime "${bt.regime}", projected ${bt.forecastPct}% over ${bt.forecastLabel}.` : ""}${linkages}`;
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

      const linkCache = await loadLinkages();
      const linkageStr = linkageBlock(currentTicker, linkCache);
      const messages = [
        { role: "system", content: buildSystemPrompt(context || {}, linkageStr) },
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
          model: "google/gemini-3-flash-preview",
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
