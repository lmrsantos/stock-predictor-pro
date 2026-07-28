// supabase/functions/hot-stocks/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight data fetcher — returns raw price data + biases to browser
// Browser runs the full AE scoring with no resource limits
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SECTOR_UNIVERSES: Record<string, string[]> = {
  "Semiconductors":         ["NVDA","AMD","AVGO","TSM","QCOM","INTC","AMAT","LRCX","KLAC","MU"],
  "Solar & Clean Energy":   ["ENPH","FSLR","SEDG","RUN","NOVA","ARRY","SHLS","CSIQ","JKS","PLUG"],
  "Software":               ["MSFT","ORCL","CRM","ADBE","NOW","INTU","PANW","SNPS","CDNS","WDAY"],
  "Mega-cap Tech":          ["AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","AVGO","ORCL","NFLX"],
  "Banks":                  ["JPM","BAC","WFC","C","GS","MS","USB","PNC","TFC","SCHW"],
  "Biotech & Pharma":       ["LLY","JNJ","ABBV","MRK","PFE","TMO","ABT","BMY","AMGN","GILD"],
  "Energy":                 ["XOM","CVX","COP","EOG","SLB","PSX","MPC","VLO","OXY","HES"],
  "Consumer Staples":       ["WMT","COST","PG","KO","PEP","MDLZ","CL","KMB","GIS","HSY"],
  "Consumer Discretionary": ["AMZN","TSLA","HD","MCD","NKE","SBUX","LOW","BKNG","TJX","CMG"],
  "Industrials & Defense":  ["CAT","BA","LMT","RTX","HON","UNP","GE","DE","NOC","GD"],
  "Utilities":              ["NEE","DUK","SO","D","AEP","SRE","XEL","EXC","PEG","WEC"],
  "Real Estate":            ["AMT","PLD","EQIX","CCI","PSA","O","WELL","VICI","DLR","SBAC"],
  "Quantum Computing":      ["IONQ","RGTI","QBTS","QUBT","ARQQ"],
  "Aerospace & Space":      ["LMT","RTX","NOC","GD","BA","HEI","TDG","RKLB","ASTS","LUNR"],
};

// Default risk tier per sector (1=safest, 4=most speculative).
const SECTOR_RISK_TIER: Record<string, number> = {
  "Utilities": 2,
  "Real Estate": 2,
  "Consumer Staples": 2,
  "Banks": 2,
  "Mega-cap Tech": 3,
  "Software": 3,
  "Semiconductors": 3,
  "Biotech & Pharma": 3,
  "Energy": 3,
  "Industrials & Defense": 3,
  "Consumer Discretionary": 3,
  "Aerospace & Space": 3,
  "Solar & Clean Energy": 4,
  "Quantum Computing": 4,
};

// Per-symbol overrides for tickers that don't match their sector default.
const RISK_TIERS: Record<string, number> = {
  // Mega-caps inside other sectors stay tier 3
  AAPL:3, MSFT:3, GOOGL:3, AMZN:3, META:3, NVDA:3, TSLA:3, AVGO:3, ORCL:3, NFLX:3,
  // SPAC-era speculative names
  RKLB:4, ASTS:4, LUNR:4, PLUG:4, BLDP:4, FCEL:4,
};

const RISK_PROFILE_TIERS: Record<string, number[]> = {
  conservative:[1,2], moderate:[1,2,3], aggressive:[1,2,3,4],
};

const SECTOR_KEYS = Object.keys(SECTOR_UNIVERSES);
const defaultBias = (): Record<string, number> =>
  Object.fromEntries(SECTOR_KEYS.map(k => [k, 1.0]));

async function fetchSectorBias(fmpKey: string): Promise<Record<string, number>> {
  const bias = defaultBias();
  try {
    const r = await fetch(`https://financialmodelingprep.com/stable/sector-performance?apikey=${fmpKey}`);
    if (!r.ok) { await r.text(); return bias; }
    const data = await r.json();
    if (!Array.isArray(data)) return bias;
    const map: Record<string, string[]> = {
      "Semiconductors":         ["Technology","Information Technology"],
      "Software":               ["Technology","Information Technology"],
      "Mega-cap Tech":          ["Technology","Information Technology"],
      "Energy":                 ["Energy"],
      "Utilities":              ["Utilities"],
      "Banks":                  ["Financials","Financial Services"],
      "Consumer Staples":       ["Consumer Defensive"],
      "Consumer Discretionary": ["Consumer Cyclical"],
      "Biotech & Pharma":       ["Healthcare"],
      "Real Estate":            ["Real Estate"],
      "Industrials & Defense":  ["Industrials"],
      "Aerospace & Space":      ["Industrials"],
      "Solar & Clean Energy":   ["Energy","Utilities"],
    };
    for (const item of data) {
      const pct = parseFloat(item.changesPercentage || item.changePercentage || "0");
      for (const [our, fmpNames] of Object.entries(map)) {
        if (fmpNames.some(n => item.sector?.includes(n))) {
          if (pct > 2) bias[our] = Math.max(bias[our], 2.0);
          else if (pct > 1) bias[our] = Math.max(bias[our], 1.5);
          else if (pct < -1) bias[our] = Math.min(bias[our], 0.7);
        }
      }
    }
  } catch(e) { console.error("Sector bias failed:", e); }
  return bias;
}

async function fetchThematicBias(supabase: ReturnType<typeof createClient>): Promise<Record<string, number>> {
  const bias = defaultBias();
  try {
    const { data } = await supabase.from("geopolitical_sentiment")
      .select("tension_score,key_events")
      .order("created_at", { ascending: false }).limit(1);
    if (!data?.length) return bias;
    const score = Number(data[0].tension_score) || 50;
    const events = (data[0].key_events || []) as { region: string; impact: string }[];
    if (score >= 60) {
      bias["Aerospace & Space"]      = score >= 75 ? 2.0 : 1.6;
      bias["Industrials & Defense"]  = score >= 75 ? 1.8 : 1.4;
      bias["Energy"]                 = score >= 75 ? 1.8 : 1.4;
      bias["Utilities"]              = score >= 75 ? 1.4 : 1.2;
      bias["Real Estate"]            = score >= 75 ? 1.4 : 1.2;
      bias["Mega-cap Tech"]          = score >= 75 ? 0.8 : 0.9;
      bias["Semiconductors"]         = score >= 75 ? 0.8 : 0.9;
      bias["Quantum Computing"]      = 1.3;
    } else if (score >= 30) {
      bias["Aerospace & Space"]      = 1.2;
      bias["Industrials & Defense"]  = 1.2;
      bias["Mega-cap Tech"]          = 1.1;
      bias["Software"]               = 1.1;
      bias["Energy"]                 = 1.1;
      bias["Quantum Computing"]      = 1.2;
    } else {
      bias["Mega-cap Tech"]          = 1.4;
      bias["Software"]               = 1.4;
      bias["Semiconductors"]         = 1.3;
      bias["Quantum Computing"]      = 1.5;
      bias["Biotech & Pharma"]       = 1.3;
      bias["Consumer Discretionary"] = 1.2;
      bias["Solar & Clean Energy"]   = 1.2;
    }
    if (events.some(e => e.region?.toLowerCase().includes("middle east") && e.impact === "high")) {
      bias["Energy"]      = Math.max(bias["Energy"], 1.8);
      bias["Real Estate"] = Math.max(bias["Real Estate"], 1.4);
    }
    if (events.some(e => (e.region?.toLowerCase().includes("europe") ||
      e.region?.toLowerCase().includes("eastern")) && e.impact === "high")) {
      bias["Aerospace & Space"]     = Math.max(bias["Aerospace & Space"], 1.8);
      bias["Industrials & Defense"] = Math.max(bias["Industrials & Defense"], 1.8);
    }
  } catch(e) { console.error("Thematic bias failed:", e); }
  return bias;
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const FMP_API_KEY = Deno.env.get("FMP_API_KEY") || "";

    let riskProfile = "aggressive";
    try {
      const body = await req.json();
      riskProfile = body.riskProfile || "aggressive";
    } catch { /* no body */ }

    if (!["conservative","moderate","aggressive"].includes(riskProfile)) {
      riskProfile = "aggressive";
    }

    const allowedTiers = RISK_PROFILE_TIERS[riskProfile];

    // Build symbol list for this profile
    const allSymbols: { symbol: string; sector: string; riskTier: number }[] = [];
    for (const [sector, syms] of Object.entries(SECTOR_UNIVERSES)) {
      for (const sym of syms) {
        const riskTier = RISK_TIERS[sym] ?? SECTOR_RISK_TIER[sector] ?? 3;
        if (allowedTiers.includes(riskTier)) {
          allSymbols.push({ symbol: sym, sector, riskTier });
        }
      }
    }

    const allTickers = [...new Set(allSymbols.map(s => s.symbol))];

    // Fetch ALL price data using pagination to bypass 1000 row limit
    const PAGE_SIZE = 1000;
    let allRows: { ticker: string; close: number }[] = [];
    let page = 0;
    while (true) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("stock_prices")
        .select("ticker,close")
        .in("ticker", allTickers)
        .order("date", { ascending: true })
        .range(from, to);
      if (error || !data?.length) break;
      allRows = allRows.concat(data);
      if (data.length < PAGE_SIZE) break;
      page++;
    }

    // Group closes by ticker
    const closesByTicker: Record<string, number[]> = {};
    for (const row of allRows) {
      if (!closesByTicker[row.ticker]) closesByTicker[row.ticker] = [];
      closesByTicker[row.ticker].push(Number(row.close));
    }

    console.log(`Fetched ${allRows.length} rows for ${Object.keys(closesByTicker).length} symbols`);

    // Fetch biases in parallel
    const [sectorBias, thematicBias] = await Promise.all([
      fetchSectorBias(FMP_API_KEY),
      fetchThematicBias(supabase),
    ]);

    // Build symbol data for browser
    const dropped = allSymbols.filter(s => !closesByTicker[s.symbol] || closesByTicker[s.symbol].length < 10);
    console.log(`Dropped ${dropped.length} symbols for insufficient data:`, dropped.map(s => s.symbol));

    const symbolData = allSymbols
      .filter(s => closesByTicker[s.symbol]?.length >= 10)
      .map(s => ({
        symbol: s.symbol,
        sector: s.sector,
        riskTier: s.riskTier,
        closes: closesByTicker[s.symbol],
        sectorBias: sectorBias[s.sector] ?? 1.0,
        thematicBias: thematicBias[s.sector] ?? 1.0,
      }));

    console.log(`Returning ${symbolData.length} symbols with price data to browser`);

    return new Response(JSON.stringify({
      symbolData,
      sectorBias,
      thematicBias,
      riskProfile,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Hot stocks error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
