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
  Technology:            ["NVDA","AAPL","MSFT","AMD","AVGO","META","GOOGL","QCOM","AMAT","INTC","TSLA","AMZN","TSM"],
  "Quantum Computing":   ["IONQ","ARQQ","RGTI","QBTS","QUBT"],
  "Aerospace & Defense": ["LMT","RTX","RKLB","PLTR","NOC","AXON","LUNR","KTOS"],
  Biotech:               ["LLY","ABBV","VRTX","REGN","AMGN","MRK","ISRG","MRNA"],
  Consumer:              ["WMT","COST","PG","KO","MCD"],
  "Utilities & Energy":  ["NEE","CEG","VST","XEL","ETR","XOM","CVX"],
  Financials:            ["JPM","V","GS","BLK","SPGI"],
  "Fixed Income":        ["TLT","IEF","BIL","AGG","LQD","SGOV","SHV","VCSH","VGSH","IUSB"],
  "Real Assets":         ["GLD","IAU","VNQ","AMT","O","IGSB","IGIB","IGLB"],
  "Income & Dividends":  ["SCHD","VYM","JEPI","HDV","PFFD","DVY","QDIV","DGRW"],
  "Commodities & Sectors": ["XLE","XLK","XLF","XLV","XLI","IYW","IYE","IYH"],
};

const RISK_TIERS: Record<string, number> = {
  TLT:1,IEF:1,BIL:1,AGG:1,LQD:1,SGOV:1,SHV:1,VCSH:1,VGSH:1,IUSB:1,
  GLD:2,IAU:2,VNQ:2,AMT:2,O:2,IGSB:2,IGIB:2,IGLB:2,
  VYM:2,SCHD:2,DVY:2,HDV:2,PFF:2,PFFD:2,QDIV:2,DGRW:2,
  JEPI:3,XLK:3,XLF:3,XLV:3,XLE:3,XLI:3,IYW:3,IYE:3,IYH:3,
  IONQ:4,ARQQ:4,RGTI:4,QBTS:4,QUBT:4,
};

const RISK_PROFILE_TIERS: Record<string, number[]> = {
  conservative:[1,2], moderate:[1,2,3], aggressive:[1,2,3,4],
};

async function fetchSectorBias(fmpKey: string): Promise<Record<string, number>> {
  const bias: Record<string, number> = {
    Technology:1.0,"Aerospace & Defense":1.0,Biotech:1.0,Consumer:1.0,
    "Utilities & Energy":1.0,Financials:1.0,"Fixed Income":1.0,
    "Real Assets":1.0,"Income & Dividends":1.0,"Commodities & Sectors":1.0,
    "Quantum Computing":1.0,
  };
  try {
    const r = await fetch(`https://financialmodelingprep.com/stable/sector-performance?apikey=${fmpKey}`);
    if (!r.ok) { await r.text(); return bias; }
    const data = await r.json();
    if (!Array.isArray(data)) return bias;
    const map: Record<string, string[]> = {
      Technology:["Technology","Information Technology"],
      "Utilities & Energy":["Energy","Utilities"],
      Financials:["Financials","Financial Services"],
      Consumer:["Consumer Defensive","Consumer Cyclical"],
      Biotech:["Healthcare"],"Real Assets":["Real Estate"],
      "Commodities & Sectors":["Materials","Industrials"],
      "Aerospace & Defense":["Industrials"],
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
  const bias: Record<string, number> = {
    Technology:1.0,"Aerospace & Defense":1.0,Biotech:1.0,Consumer:1.0,
    "Utilities & Energy":1.0,Financials:1.0,"Fixed Income":1.0,
    "Real Assets":1.0,"Income & Dividends":1.0,"Commodities & Sectors":1.0,
    "Quantum Computing":1.0,
  };
  try {
    const { data } = await supabase.from("geopolitical_sentiment")
      .select("tension_score,key_events")
      .order("created_at", { ascending: false }).limit(1);
    if (!data?.length) return bias;
    const score = Number(data[0].tension_score) || 50;
    const events = (data[0].key_events || []) as { region: string; impact: string }[];
    if (score >= 60) {
      bias["Aerospace & Defense"] = score >= 75 ? 2.0 : 1.6;
      bias["Utilities & Energy"]  = score >= 75 ? 1.8 : 1.4;
      bias["Real Assets"]         = score >= 75 ? 1.5 : 1.3;
      bias["Commodities & Sectors"] = 1.4;
      bias["Technology"]          = score >= 75 ? 0.8 : 0.9;
      bias["Quantum Computing"]   = 1.3;
    } else if (score >= 30) {
      bias["Aerospace & Defense"] = 1.2;
      bias["Technology"]          = 1.1;
      bias["Utilities & Energy"]  = 1.1;
      bias["Quantum Computing"]   = 1.2;
    } else {
      bias["Technology"]          = 1.4;
      bias["Quantum Computing"]   = 1.5;
      bias["Biotech"]             = 1.3;
      bias["Consumer"]            = 1.2;
    }
    if (events.some(e => e.region?.toLowerCase().includes("middle east") && e.impact === "high")) {
      bias["Utilities & Energy"] = Math.max(bias["Utilities & Energy"], 1.8);
      bias["Real Assets"] = Math.max(bias["Real Assets"], 1.4);
    }
    if (events.some(e => (e.region?.toLowerCase().includes("europe") ||
      e.region?.toLowerCase().includes("eastern")) && e.impact === "high")) {
      bias["Aerospace & Defense"] = Math.max(bias["Aerospace & Defense"], 1.8);
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
        const riskTier = RISK_TIERS[sym] ?? 4;
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
