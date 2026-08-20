// supabase/functions/quant-agent/index.ts
// Educational quant analyst chat via Lovable AI Gateway (Gemini).
// Returns responses synchronously — no managed-agent streaming.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargeAiCredits, refundAiCredits } from "../_shared/ai-credits.ts";


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

async function loadIpoIntel(): Promise<string> {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(url, service);
    const { data } = await client
      .from("ipo_intelligence")
      .select("name, sector, horizon, stage, risk_tier, risk_score, accredited_required, min_investment, our_view")
      .order("refreshed_at", { ascending: false })
      .limit(20);
    if (!data?.length) return "";
    const rows = data.map((r: any) => ({
      name: r.name,
      sector: r.sector,
      horizon: r.horizon,
      stage: r.stage,
      riskTier: r.risk_tier,
      riskScore: r.risk_score,
      accredited: r.accredited_required,
      minInvestment: r.min_investment,
      view: r.our_view,
    }));
    return `\n\nPRE-IPO INTELLIGENCE (most recent 20 tracked companies, scored by deterministic risk model):\n${JSON.stringify(rows)}\n\nWhen the user asks about pre-IPO opportunities, upcoming IPOs, private companies, accreditation, or their watched sectors' pipelines, reference this list. If they want to explore further, offer to navigate them there with [[ACTION:navigate:/ipo-intelligence]].`;
  } catch (e) {
    console.warn("ipo intel load failed", e);
    return "";
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

// ── LIVE RESEARCH TOOLS ────────────────────────────────────────────────────
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36";

/** Yahoo Finance news + symbol resolution. No API key needed. */
async function yahooSearch(query: string): Promise<string> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=8&quotesCount=3`;
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) return "";
    const j = await r.json();
    const news = (j?.news || []).slice(0, 8).map((n: any) => ({
      title: n.title,
      publisher: n.publisher,
      published: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString().slice(0, 16) : null,
      tickers: n.relatedTickers,
      link: n.link,
    }));
    const quotes = (j?.quotes || []).slice(0, 3).map((q: any) => ({
      symbol: q.symbol, name: q.longname || q.shortname, sector: q.sector, industry: q.industry,
    }));
    if (!news.length && !quotes.length) return "";
    return JSON.stringify({ source: "Yahoo Finance", matchedSymbols: quotes, headlines: news });
  } catch (_e) { return ""; }
}

/** Generic web search fallback via DuckDuckGo HTML endpoint. */
async function duckSearch(query: string): Promise<string> {
  try {
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": UA },
    });
    if (!r.ok) return "";
    const html = await r.text();
    const strip = (s: string) => s.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
    const results: { title: string; snippet: string }[] = [];
    const re = /class="result__a"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && results.length < 8) {
      results.push({ title: strip(m[1]).slice(0, 200), snippet: strip(m[2]).slice(0, 400) });
    }
    if (!results.length) return "";
    return JSON.stringify({ source: "DuckDuckGo web results", results });
  } catch (_e) { return ""; }
}

async function webSearchTool(query: string): Promise<string> {
  const [yf, ddg] = await Promise.all([yahooSearch(query), duckSearch(query)]);
  const parts = [yf, ddg].filter(Boolean);
  if (!parts.length) return JSON.stringify({ error: "Web search returned nothing usable for this query." });
  return parts.join("\n\n");
}

/** Live daily tape for a symbol, with an explicit single-session gap detector. */
async function liveQuoteTool(symbol: string): Promise<string> {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym) return JSON.stringify({ error: "No symbol given." });
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3mo&interval=1d`;
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) return JSON.stringify({ error: `No data for ${sym} (HTTP ${r.status}).` });
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    if (!res) return JSON.stringify({ error: `No data for ${sym}.` });
    const meta = res.meta || {};
    const ts: number[] = res.timestamp || [];
    const closes: (number | null)[] = res.indicators?.quote?.[0]?.close || [];
    const rows: { date: string; close: number }[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c == null) continue;
      rows.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: Number(c.toFixed(2)) });
    }
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    const dayPct = last && prev ? ((last.close - prev.close) / prev.close) * 100 : null;

    // Gap detector: any single session in the window moving > 25%.
    const gaps: { date: string; pct: number; from: number; to: number }[] = [];
    for (let i = 1; i < rows.length; i++) {
      const pct = ((rows[i].close - rows[i - 1].close) / rows[i - 1].close) * 100;
      if (Math.abs(pct) > 25) gaps.push({ date: rows[i].date, pct: Number(pct.toFixed(1)), from: rows[i - 1].close, to: rows[i].close });
    }

    return JSON.stringify({
      symbol: sym,
      name: meta.longName || meta.shortName || sym,
      currency: meta.currency,
      lastClose: last?.close ?? null,
      lastDate: last?.date ?? null,
      dayChangePct: dayPct != null ? Number(dayPct.toFixed(2)) : null,
      regularMarketPrice: meta.regularMarketPrice ?? null,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
      last20Closes: rows.slice(-20),
      discontinuities: gaps,
      gapWarning: gaps.length
        ? "A single-session move larger than 25% exists in this window. Regression slope, R² and annualized-return statistics are INVALID across this discontinuity — state the gap and withhold trend statistics."
        : null,
    });
  } catch (e) {
    return JSON.stringify({ error: `Quote lookup failed for ${sym}: ${e instanceof Error ? e.message : "unknown"}` });
  }
}

/**
 * Next scheduled earnings date — reuses the platform's own calendar pipeline
 * (fetch-financials: FMP confirmed calendar + authenticated Yahoo fallback),
 * so the agent sees exactly what the earnings banner shows.
 */
async function earningsCalendarTool(symbol: string): Promise<string> {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym) return JSON.stringify({ error: "No symbol given." });
  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  try {
    const r = await fetch(`${base}/functions/v1/fetch-financials`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key ?? "" },
      body: JSON.stringify({ ticker: sym, calendarOnly: true }),
    });
    if (!r.ok) return JSON.stringify({ error: `Earnings calendar lookup failed for ${sym} (HTTP ${r.status}).` });
    const j = await r.json();
    const info = j?.companyInfo ?? {};
    const date: string | null = info.nextEarningsDate ?? null;
    const daysUntil = date
      ? Math.round((Date.parse(`${date}T12:00:00Z`) - Date.now()) / 86400000)
      : null;
    return JSON.stringify({
      symbol: sym,
      today: new Date().toISOString().slice(0, 10),
      nextEarningsDate: date,
      nextEarningsTime: info.nextEarningsTime ?? null,
      confirmed: !!info.nextEarningsConfirmed,
      daysUntil,
      source: info.nextEarningsSource ?? null,
      note: date
        ? "nextEarningsDate is the authoritative next report date for this symbol. Do NOT contradict it from memory or reason about 'typical' reporting windows."
        : "The calendar publishes no next date for this symbol — say that plainly instead of guessing.",
    });
  } catch (e) {
    return JSON.stringify({ error: `Earnings calendar lookup failed for ${sym}: ${e instanceof Error ? e.message : "unknown"}` });
  }
}


const TOOL_SPECS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the live web (Yahoo Finance news + general web) for current information: news, events, earnings results, deals, approvals, macro headlines, why a stock moved. Use this whenever the answer depends on anything recent or on a company/symbol not loaded in the terminal context.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Search query, e.g. 'Moderna MRNA stock jump August 2026'" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_live_quote",
      description: "Get the live daily tape for any ticker: last close, day change, 52w range, last 20 closes, and a detector for single-session gaps larger than 25%. Use this before quoting any price, trend, slope or return for a symbol that is not the one loaded in the terminal context.",
      parameters: {
        type: "object",
        properties: { symbol: { type: "string", description: "Ticker symbol, e.g. MRNA, AAPL, ^GSPC" } },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_earnings_calendar",
      description: "Authoritative next scheduled earnings date for a ticker, whether it is confirmed or estimated, days until the report, consensus EPS/revenue estimates, and the last 4 reported quarters. MANDATORY before any statement about when a company reports, whether earnings already happened, or what to expect from an upcoming report.",
      parameters: {
        type: "object",
        properties: { symbol: { type: "string", description: "Ticker symbol, e.g. WMT, AAPL" } },
        required: ["symbol"],
      },
    },
  },
];

async function runTool(name: string, args: any): Promise<string> {
  if (name === "web_search") return await webSearchTool(String(args?.query ?? ""));
  if (name === "get_live_quote") return await liveQuoteTool(String(args?.symbol ?? ""));
  if (name === "get_earnings_calendar") return await earningsCalendarTool(String(args?.symbol ?? ""));
  return JSON.stringify({ error: `Unknown tool ${name}` });
}


function buildSystemPrompt(ctx: Record<string, any>, linkages: string): string {
  const bt = ctx?.backtestResult;
  const f = ctx?.fundamentals || {};
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const currentYear = today.getUTCFullYear();
  return `You are QuantAgent — a sharp, senior-level quantitative analyst embedded in the QuantForecast platform. You think like a hedge-fund quant: rigorous, numerate, opinionated about *what the model says*, and unafraid to discuss macro regimes, sector dynamics, factor exposures, valuation, technicals, risk, and market microstructure.

TEMPORAL AWARENESS (CRITICAL):
- **Today's date is ${todayStr}. The current year is ${currentYear}.**
- Your training data has a knowledge cutoff earlier than today. Any event, milestone, earnings date, FAA/FDA approval, election, product launch, or "expected in 20XX" reference you recall must be checked against today's date before you treat it as a future catalyst.
- If a date you would cite is on or before ${todayStr}, it is in the PAST. Do not say "watch for" or "expected in" — say "already occurred (or was expected to)" and note that you may not have the outcome in your training data.
- When you don't know the post-cutoff outcome of a past-dated catalyst, say so explicitly and pivot to what the CURRENT price action, regression slope, and fundamentals in the context above imply — the model + live data are more reliable than your stale calendar.
- Never present ${currentYear - 2} or ${currentYear - 1} milestones as forward-looking.

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
- Research the live web with the tools below whenever the answer depends on anything recent.

LIVE RESEARCH TOOLS (USE THEM — do not guess):
- \`get_live_quote(symbol)\` — real last close, day change, 52w range, last 20 closes, and a gap detector.
- \`web_search(query)\` — live Yahoo Finance news headlines plus general web results.
- \`get_earnings_calendar(symbol)\` — authoritative next earnings date (confirmed vs estimated), days until, consensus EPS/revenue, last 4 reported quarters.

Mandatory rules:
- If the user asks "what happened with X", about news, a move, an event, earnings, a deal, an approval, or about ANY symbol that is not the ticker in CURRENT CONTEXT — call the tools FIRST and answer only from what they return.
- EARNINGS: any question about when a company reports, whether earnings already happened, or what to expect from an upcoming report REQUIRES \`get_earnings_calendar(symbol)\` first. Never assert from memory that a report "already occurred" or is "typically released in mid-<month>". The calendar's \`nextEarningsDate\` overrides anything you recall; if the user says "tomorrow" and the calendar agrees, treat the report as upcoming and answer the question they asked. Also run \`web_search\` for the latest preview/expectations headlines. If the calendar has no confirmed date, say the calendar shows none and stop — do not reason about reporting cycles from memory.
- Never quote a price, day change, slope, R², or annualized return for a symbol you have not verified via \`get_live_quote\` or CURRENT CONTEXT.
- If \`get_live_quote\` returns \`discontinuities\` (a single session moving more than 25%), that gap is the most important fact: lead with it, and REFUSE to report regression slope, R², or annualized return across it — those statistics are artifacts of the jump, not a trend. Say plainly that the trend statistics are not meaningful and explain what the gap implies instead.
- If a tool returns nothing usable, say you couldn't verify it and stop — never fill the hole from memory.
- Never mention model names, training cutoffs, or API limits to the user. If you lack verified data, pivot gracefully to what you can evidence.

PLATFORM ACTIONS (VERY IMPORTANT):
You can DRIVE the platform for the user. When the user asks to switch symbol, open a page, or navigate somewhere, append an action tag on its OWN line at the END of your reply. The UI will parse and execute it, then hide the tag.

Available actions (use EXACTLY this syntax):
- [[ACTION:switch_ticker:SYMBOL]]   — load a ticker in the terminal (e.g. [[ACTION:switch_ticker:AAPL]], [[ACTION:switch_ticker:^GSPC]])
- [[ACTION:navigate:/portfolio]]    — go to My Portfolio
- [[ACTION:navigate:/sectors]]      — go to Sector Chart
- [[ACTION:navigate:/sector-backtest]] — go to Sector Backtest
- [[ACTION:navigate:/linkages]]     — go to Cross-Sector Linkage Engine
- [[ACTION:navigate:/pricing]]      — go to Plans & pricing
- [[ACTION:navigate:/account]]      — go to Account
- [[ACTION:navigate:/terminal]]     — go to the main terminal
- [[ACTION:open:hot_stocks]]        — open the Hot Stocks panel
- [[ACTION:open:sentiment]]         — open the Global Sentiment panel
- [[ACTION:open:backtest]]          — open the Symbol Backtest modal for the current ticker

Rules:
- Emit an action tag ONLY when the user's LAST message is an explicit command to move ("take me to…", "switch to Tesla", "show me hot stocks", "open the linkage engine", "load NVDA"). For ANY analysis, explanation, comparison, opinion, or follow-up question, emit NO action tag at all — never navigate the user away mid-conversation, and never volunteer a tag just because a page or symbol was mentioned.
- Confirm what you're doing in one short sentence BEFORE the tag ("Switching to NVDA now."), then put the tag alone on the final line.
- Use ONE action per reply. If the user asks for a chain, do the first one and offer the next.
- ALWAYS use uppercase symbols. Keep index symbols like ^GSPC, ^DJI, ^IXIC intact.

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
${bt ? `- Backtest: **${bt.signal}** signal, confidence ${bt.confidenceScore}/100, hit rate ${bt.hitRate}%, walk-forward acc ${bt.walkForwardAccuracy}%, regime "${bt.regime}", projected ${bt.forecastPct}% over ${bt.forecastLabel}.` : ""}${macroBlock(ctx?.macroIndicators)}${linkages}`;
}

function macroBlock(m: any): string {
  if (!m || typeof m !== "object") return "";
  const fmt = (k: string, label: string, suffix = "") => {
    const v = m[k]?.value;
    if (v == null) return null;
    const d30 = m[k]?.change_30d;
    const d30Str = d30 != null ? ` (30d ${d30 >= 0 ? "+" : ""}${Number(d30).toFixed(1)}%)` : "";
    return `  • ${label}: ${Number(v).toFixed(2)}${suffix}${d30Str}`;
  };
  const rows = [
    fmt("cpi_yoy", "CPI YoY", "%"),
    fmt("fed_funds", "Fed Funds", "%"),
    fmt("us10y", "US 10Y", "%"),
    fmt("curve_10y2y", "10Y–2Y spread"),
    fmt("vix", "VIX"),
    fmt("wti", "WTI", " $"),
    fmt("gold", "Gold", " $"),
    fmt("cape_proxy", "S&P 500 PE (trailing)"),
  ].filter(Boolean);
  if (!rows.length) return "";
  return `\n\nLIVE MACRO INDICATORS (same numbers the user sees on screen):\n${rows.join("\n")}`;
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

      const charge = await chargeAiCredits(req, "quant_agent", corsHeaders);
      if (!charge.ok) return charge.response;

      const linkCache = await loadLinkages();
      const linkageStr = linkageBlock(currentTicker, linkCache);
      const ipoStr = await loadIpoIntel();
      const messages = [
        { role: "system", content: buildSystemPrompt(context || {}, linkageStr + ipoStr) },
        ...(Array.isArray(history) ? history.slice(-12).map((m: any) => ({
          role: m.role === "agent" ? "assistant" : "user",
          content: String(m.content || ""),
        })) : []),
        { role: "user", content: message },
      ];

      const callModel = async (msgs: any[]) => fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: msgs,
          tools: TOOL_SPECS,
        }),
      });

      const convo: any[] = [...messages];
      let reply = "";
      let usedTools = false;

      for (let round = 0; round < 4; round++) {
        const res = await callModel(convo);

        if (!res.ok) {
          await refundAiCredits(charge.userId, charge.cost, "Refund — quant_agent call failed");
          if (res.status === 429) {
            return new Response(JSON.stringify({ response: "I'm getting rate-limited right now — please try again in a moment." }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (res.status === 402 || res.status === 403) {
            return new Response(JSON.stringify({ response: "AI service is temporarily unavailable. Please try again shortly." }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          const t = await res.text();
          throw new Error(`AI gateway ${res.status}: ${t.slice(0, 300)}`);
        }

        const data = await res.json();
        const msg = data?.choices?.[0]?.message;
        const toolCalls = msg?.tool_calls;

        if (Array.isArray(toolCalls) && toolCalls.length) {
          usedTools = true;
          convo.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });
          for (const tc of toolCalls.slice(0, 4)) {
            let args: any = {};
            try { args = JSON.parse(tc.function?.arguments || "{}"); } catch (_e) { /* ignore */ }
            const out = await runTool(tc.function?.name, args);
            convo.push({ role: "tool", tool_call_id: tc.id, content: out.slice(0, 12000) });
          }
          continue;
        }

        reply = msg?.content?.trim() || "";
        break;
      }

      if (!reply) reply = "I couldn't verify that from live sources — try rephrasing the question.";

      return new Response(JSON.stringify({ response: reply, researched: usedTools, creditBalance: charge.balance }), {
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
