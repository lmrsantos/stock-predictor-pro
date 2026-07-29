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

// ─────────────────────────────────────────────────────────────────────────────
// Sector universe — MIRROR of src/lib/sector-universes.ts and
// supabase/functions/sector-backtest/index.ts. Keep in sync so every feature
// (Hot Stocks, Sector Backtest, Cross-Sector Linkages, QuantAgent) reasons over
// the exact same symbol set.
// ─────────────────────────────────────────────────────────────────────────────
const SECTOR_UNIVERSES: Record<string, string[]> = {
  // Technology
  "Mega-cap Tech":               ["AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","AVGO","ORCL","NFLX"],
  "Semiconductors":              ["NVDA","AMD","AVGO","TSM","QCOM","INTC","AMAT","LRCX","KLAC","MU","ASML","MRVL","NXPI","ADI","TXN","ON","MCHP","SWKS","QRVO","MPWR","ARM","SMCI","WOLF","STM","TER","ENTG","ALAB","CRDO","SITM","RMBS"],
  "Semis: AI & GPU":             ["NVDA","AMD","AVGO","ARM","SMCI","MRVL","ALAB","CRDO"],
  "Semis: Foundry & Equipment":  ["TSM","ASML","AMAT","LRCX","KLAC","TER","ENTG","KLIC"],
  "Semis: Memory":               ["MU","WDC","STX"],
  "Semis: Analog":               ["ADI","TXN","ON","MCHP","NXPI","MPWR","SWKS","QRVO","SITM","RMBS"],
  "Software":                    ["MSFT","ORCL","CRM","ADBE","NOW","INTU","PANW","SNPS","CDNS","WDAY","TEAM","DDOG","CRWD","SNOW","NET","ZS","MDB","HUBS","DOCU","OKTA","ZM","SHOP"],
  "Software: Cybersecurity":     ["PANW","CRWD","ZS","OKTA","NET","FTNT","S","CYBR","QLYS","RBRK"],
  "Software: Data & AI":         ["SNOW","DDOG","MDB","PLTR","AI","PATH","ESTC","CFLT","GTLB"],
  "Software: Cloud Infra":       ["MSFT","ORCL","NOW","WDAY","ADBE","CRM","INTU","HUBS"],

  // Financials
  "Banks":                       ["JPM","BAC","WFC","C","GS","MS","USB","PNC","TFC","SCHW","COF","BK","STT","RF","FITB","HBAN","KEY","MTB","CFG","ZION"],
  "Money Center Banks":          ["JPM","BAC","WFC","C","GS","MS"],
  "Regional Banks":              ["USB","PNC","TFC","RF","FITB","HBAN","KEY","MTB","CFG","ZION"],

  // Healthcare
  "Biotech & Pharma":            ["LLY","JNJ","ABBV","MRK","PFE","TMO","ABT","BMY","AMGN","GILD","VRTX","REGN","MRNA","BIIB","ISRG","ZTS","CVS","UNH"],
  "Pharma: Big Pharma":          ["LLY","JNJ","ABBV","MRK","PFE","BMY","NVS","AZN","GSK","NVO"],
  "Biotech":                     ["VRTX","REGN","MRNA","BIIB","GILD","AMGN","BMRN","BEAM","CRSP","NTLA","ARWR","ALNY"],
  "Medical Devices":             ["ISRG","ABT","MDT","SYK","BSX","EW","ZBH","DXCM","IDXX","BAX"],

  // Energy
  "Energy":                      ["XOM","CVX","COP","EOG","SLB","PSX","MPC","VLO","OXY","PXD","HES","DVN","FANG","HAL","BKR","KMI","WMB","OKE"],
  "Energy: Integrated Majors":   ["XOM","CVX","BP","SHEL","TTE","COP","EQNR"],
  "Energy: E&P":                 ["EOG","OXY","HES","DVN","FANG","MRO","APA","CTRA","PR"],
  "Energy: Oilfield Services":   ["SLB","HAL","BKR","NOV","FTI","WFRD","LBRT"],
  "Energy: Midstream":           ["KMI","WMB","OKE","ET","EPD","MPLX","TRGP","LNG"],

  // Consumer
  "Consumer Staples":            ["WMT","COST","PG","KO","PEP","MDLZ","CL","KMB","GIS","K","HSY","SYY","CHD","CLX","MNST","STZ","TGT","KR"],
  "Consumer Discretionary":      ["AMZN","TSLA","HD","MCD","NKE","SBUX","LOW","BKNG","TJX","CMG","ABNB","ORLY","AZO","DPZ","YUM","MAR","DRI","RCL","CCL"],
  "Retail":                      ["WMT","COST","TGT","TJX","HD","LOW","ORLY","AZO","DG","DLTR","ROST","BBY","ULTA"],
  "Restaurants":                 ["MCD","SBUX","CMG","YUM","DPZ","DRI","QSR","WING","TXRH","SG"],
  "Travel & Leisure":            ["BKNG","MAR","ABNB","RCL","CCL","NCLH","HLT","EXPE","H","VAC","LYV","UAL","DAL","AAL","LUV"],
  "Autos & EVs":                 ["TSLA","GM","F","RIVN","LCID","NIO","LI","XPEV","TM","HMC","STLA","BYDDY"],

  // Industrials
  "Industrials & Defense":       ["CAT","BA","LMT","RTX","HON","UNP","GE","DE","NOC","GD","ETN","EMR","ITW","PH","CSX","NSC","FDX","UPS","WM"],
  "Defense":                     ["LMT","RTX","NOC","GD","BA","HII","LDOS","LHX","KTOS","AVAV"],
  "Aerospace & Space":           ["LMT","RTX","NOC","GD","BA","HEI","TDG","RKLB","ASTS","LUNR","SPCE","PL"],
  "Space":                       ["RKLB","ASTS","LUNR","SPCE","PL","IRDM","MAXR","BKSY"],

  // Utilities & REITs
  "Utilities":                   ["NEE","DUK","SO","D","AEP","SRE","XEL","EXC","PEG","WEC","ED","ETR","ES","AWK","PCG","CEG","VST"],
  "Real Estate":                 ["AMT","PLD","EQIX","CCI","PSA","O","WELL","VICI","DLR","SBAC","SPG","AVB","EQR","ARE","EXR","VTR","WY"],
  "Data Center REITs":           ["EQIX","DLR","AMT","CCI","SBAC","IRM"],
  "Residential REITs":           ["AVB","EQR","ESS","MAA","INVH","UDR","CPT","AMH"],

  // Materials
  "Materials":                       ["LIN","APD","SHW","ECL","FCX","NEM","NUE","DOW","DD","PPG","VMC","MLM","CTVA","IFF","ALB","MOS","CF","STLD","X","AA"],
  "Rare Earth & Critical Minerals":  ["MP","USAR","TMC","UUUU","IPX","TROX","REEMF","LYSDY"],
  "Nickel & Battery Metals":         ["VALE","BHP","RIO","GLNCY","NILSY","SBSW","TMC","MP"],
  "Lithium":                         ["ALB","SQM","LTHM","PLL","LAC","SGML","LITM","IONR"],
  "Gold & Precious Metals":          ["NEM","GOLD","AEM","KGC","WPM","FNV","PAAS","AG","HL","RGLD","AU"],
  "Copper":                          ["FCX","SCCO","TECK","HBM","ERO","TRQ","IVN","LUN"],
  "Steel":                           ["NUE","STLD","X","CLF","RS","MT","TX","CMC"],

  // Emerging
  "Quantum Computing":           ["IONQ","RGTI","QBTS","QUBT","ARQQ"],
};

// Default risk tier per sector (1=safest, 4=most speculative).
const SECTOR_RISK_TIER: Record<string, number> = {
  // Defensive
  "Utilities": 2, "Real Estate": 2, "Data Center REITs": 2, "Residential REITs": 2,
  "Consumer Staples": 2, "Banks": 2, "Money Center Banks": 2, "Regional Banks": 3,
  "Pharma: Big Pharma": 2, "Medical Devices": 2,
  // Core growth
  "Mega-cap Tech": 3, "Software": 3, "Software: Cloud Infra": 3, "Software: Cybersecurity": 3,
  "Software: Data & AI": 3, "Semiconductors": 3, "Semis: AI & GPU": 3, "Semis: Foundry & Equipment": 3,
  "Semis: Memory": 3, "Semis: Analog": 3, "Biotech & Pharma": 3, "Biotech": 4,
  "Energy": 3, "Energy: Integrated Majors": 2, "Energy: E&P": 3, "Energy: Oilfield Services": 3, "Energy: Midstream": 2,
  "Industrials & Defense": 3, "Defense": 3, "Aerospace & Space": 3,
  "Consumer Discretionary": 3, "Retail": 3, "Restaurants": 3, "Travel & Leisure": 3, "Autos & EVs": 4,
  "Materials": 3, "Gold & Precious Metals": 3, "Copper": 3, "Steel": 3,
  // Speculative
  "Space": 4, "Rare Earth & Critical Minerals": 4, "Nickel & Battery Metals": 4, "Lithium": 4,
  "Quantum Computing": 4,
};

// Per-symbol overrides for tickers that don't match their sector default.
const RISK_TIERS: Record<string, number> = {
  // Mega-caps stay tier 3 even inside other sectors
  AAPL:3, MSFT:3, GOOGL:3, AMZN:3, META:3, NVDA:3, TSLA:3, AVGO:3, ORCL:3, NFLX:3,
  // SPAC-era speculative names
  RKLB:4, ASTS:4, LUNR:4, SPCE:4, PL:4, BKSY:4, MAXR:4,
  RIVN:4, LCID:4, NIO:4, LI:4, XPEV:4,
  BEAM:4, CRSP:4, NTLA:4, ARWR:4, BMRN:4,
  PLTR:4, AI:4, PATH:4,
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

    // Build symbol list for this profile.
    // Many symbols appear in multiple universes (e.g. NVDA is in Mega-cap Tech,
    // Semiconductors, and Semis: AI & GPU). Dedupe by symbol, preferring the
    // NARROWEST subsector so per-sector caps in the UI feel meaningful. Broad
    // baskets like "Mega-cap Tech" come first in SECTOR_UNIVERSES; narrower
    // subsectors ("Semis: AI & GPU") come later, so last-wins gives us the
    // narrower label.
    const symByKey: Record<string, { symbol: string; sector: string; riskTier: number }> = {};
    for (const [sector, syms] of Object.entries(SECTOR_UNIVERSES)) {
      for (const sym of syms) {
        const riskTier = RISK_TIERS[sym] ?? SECTOR_RISK_TIER[sector] ?? 3;
        if (!allowedTiers.includes(riskTier)) continue;
        symByKey[sym] = { symbol: sym, sector, riskTier };
      }
    }
    const allSymbols = Object.values(symByKey);
    const allTickers = allSymbols.map(s => s.symbol);

    // Fetch ALL price data using pagination to bypass 1000 row limit
    const PAGE_SIZE = 1000;
    let allRows: { ticker: string; close: number; date: string }[] = [];
    let page = 0;
    while (true) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("stock_prices")
        .select("ticker,close,date")
        .in("ticker", allTickers)
        .order("date", { ascending: true })
        .range(from, to);
      if (error || !data?.length) break;
      allRows = allRows.concat(data as any);
      if (data.length < PAGE_SIZE) break;
      page++;
    }

    // Group by ticker as {date, close} points
    const seriesByTicker: Record<string, { date: string; close: number }[]> = {};
    for (const row of allRows) {
      (seriesByTicker[row.ticker] ??= []).push({ date: row.date, close: Number(row.close) });
    }

    console.log(`Fetched ${allRows.length} rows for ${Object.keys(seriesByTicker).length} symbols`);

    // Fetch biases in parallel
    const [sectorBias, thematicBias] = await Promise.all([
      fetchSectorBias(FMP_API_KEY),
      fetchThematicBias(supabase),
    ]);

    // Need ≥60 points for the backtest() engine to run reliably.
    const MIN_POINTS = 60;
    const dropped = allSymbols.filter(s =>
      !seriesByTicker[s.symbol] || seriesByTicker[s.symbol].length < MIN_POINTS
    );
    console.log(`Dropped symbols:`, dropped.map(s => s.symbol).join(', '));

    // Send the last ~260 trading days so the browser's backtest() can use
    // its full 6-month lookback window (matches the Calibration Backtest modal).
    const symbolData = allSymbols
      .filter(s => (seriesByTicker[s.symbol]?.length ?? 0) >= MIN_POINTS)
      .map(s => ({
        symbol: s.symbol,
        sector: s.sector,
        riskTier: s.riskTier,
        series: seriesByTicker[s.symbol].slice(-260),
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
