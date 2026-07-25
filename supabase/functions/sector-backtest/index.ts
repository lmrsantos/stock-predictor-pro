// supabase/functions/sector-backtest/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Sector Backtest data fetcher.
// Returns universe + ~6mo daily closes per ticker.
// Browser runs the full backtest model (same pattern as hot-stocks).
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Curated sector universes (large-cap, liquid US-listed).
// Mirror of src/lib/sector-universes.ts — keep in sync.
const CURATED_UNIVERSES: Record<string, string[]> = {
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

  // Materials (NEW)
  "Materials":                       ["LIN","APD","SHW","ECL","FCX","NEM","NUE","DOW","DD","PPG","VMC","MLM","CTVA","IFF","ALB","MOS","CF","STLD","X","AA"],
  "Rare Earth & Critical Minerals":  ["MP","USAR","TMC","UUUU","IPX","TROX","REEMF","LYSDY"],
  "Nickel & Battery Metals":         ["VALE","BHP","RIO","GLNCY","NILSY","SBSW","TMC","MP"],
  "Lithium":                         ["ALB","SQM","LTHM","PLL","LAC","SGML","LITM","IONR"],
  "Gold & Precious Metals":          ["NEM","GOLD","AEM","KGC","WPM","FNV","PAAS","AG","HL","RGLD","AU"],
  "Copper":                          ["FCX","SCCO","TECK","HBM","ERO","TRQ","IVN","LUN"],
  "Steel":                           ["NUE","STLD","X","CLF","RS","MT","TX","CMC"],

  // Emerging
  "Quantum Computing":   ["IONQ","RGTI","QBTS","QUBT","ARQQ"],
};

// Yahoo screener sector IDs (Yahoo's `sector` field on equity screener).
const YAHOO_SECTOR_FIELD: Record<string, string> = {
  "Semiconductors":         "Technology",
  "Software":               "Technology",
  "Banks":                  "Financial Services",
  "Biotech & Pharma":       "Healthcare",
  "Energy":                 "Energy",
  "Consumer Staples":       "Consumer Defensive",
  "Consumer Discretionary": "Consumer Cyclical",
  "Industrials & Defense":  "Industrials",
  "Utilities":              "Utilities",
  "Real Estate":            "Real Estate",
};

// Industry filter for Yahoo screener (narrower than sector).
const YAHOO_INDUSTRY_FIELD: Record<string, string[]> = {
  "Semiconductors": ["semiconductors", "semiconductor-equipment-materials"],
  "Software":       ["software-application", "software-infrastructure"],
  "Banks":          ["banks-diversified", "banks-regional"],
  "Biotech & Pharma": ["biotechnology", "drug-manufacturers-general"],
};

async function getYahooCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  try {
    const ck = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    await ck.text();
    const cookies = ck.headers.get("set-cookie") || "";
    if (!cookies) return null;

    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": "Mozilla/5.0", Cookie: cookies },
    });
    if (!crumbRes.ok) { await crumbRes.text(); return null; }
    const crumb = await crumbRes.text();
    if (!crumb || crumb.includes("<")) return null;
    return { crumb, cookie: cookies };
  } catch (e) {
    console.warn("Yahoo crumb auth failed:", e);
    return null;
  }
}

async function fetchYahooUniverse(sector: string, maxTickers: number): Promise<string[]> {
  const auth = await getYahooCrumb();
  if (!auth) return [];

  const sectorField = YAHOO_SECTOR_FIELD[sector];
  const industries  = YAHOO_INDUSTRY_FIELD[sector];
  if (!sectorField) return [];

  const operators: any[] = [
    { operator: "eq", operands: ["region", "us"] },
    { operator: "gte", operands: ["intradaymarketcap", 500_000_000] },
    { operator: "or", operands: [
      { operator: "eq", operands: ["exchange", "NMS"] },
      { operator: "eq", operands: ["exchange", "NYQ"] },
    ]},
    { operator: "eq", operands: ["sector", sectorField] },
  ];
  if (industries?.length) {
    operators.push({
      operator: "or",
      operands: industries.map(i => ({ operator: "eq", operands: ["industry", i] })),
    });
  }

  const body = {
    size: maxTickers,
    offset: 0,
    sortField: "intradaymarketcap",
    sortType: "DESC",
    quoteType: "EQUITY",
    query: { operator: "and", operands: operators },
    userId: "",
    userIdType: "guid",
  };

  try {
    const r = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(auth.crumb)}`,
      {
        method: "POST",
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Content-Type": "application/json",
          Cookie: auth.cookie,
        },
        body: JSON.stringify(body),
      },
    );
    if (!r.ok) { await r.text(); return []; }
    const json = await r.json();
    const quotes = json?.finance?.result?.[0]?.quotes ?? [];
    return quotes.map((q: any) => q.symbol).filter(Boolean).slice(0, maxTickers);
  } catch (e) {
    console.warn("Yahoo screener failed:", e);
    return [];
  }
}

type PriceSeries = { dates: string[]; closes: number[] };

async function fetchPrices(symbol: string): Promise<PriceSeries | null> {
  // Yahoo chart endpoint — 1y daily, no auth needed, fast for ~50 calls.
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) { await res.text(); return null; }
    const json = await res.json();
    const r = json?.chart?.result?.[0];
    const ts: number[] = r?.timestamp || [];
    const closes: (number | null)[] = r?.indicators?.quote?.[0]?.close || [];
    if (!ts.length || !closes.length) return null;

    const dates: string[] = [];
    const out: number[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c == null) continue;
      dates.push(new Date(ts[i] * 1000).toISOString().split("T")[0]);
      out.push(c);
    }
    if (out.length < 60) return null;
    return { dates, closes: out };
  } catch (e) {
    console.warn(`${symbol}: price fetch failed`, e);
    return null;
  }
}

async function fetchAllPrices(
  tickers: string[],
  batchSize = 8,
): Promise<{ prices: Record<string, PriceSeries>; failed: string[] }> {
  const prices: Record<string, PriceSeries> = {};
  const failed: string[] = [];

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(async t => ({ t, data: await fetchPrices(t) })));
    for (const { t, data } of results) {
      if (data) prices[t] = data;
      else failed.push(t);
    }
    // tiny delay between batches
    if (i + batchSize < tickers.length) await new Promise(r => setTimeout(r, 150));
  }

  return { prices, failed };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { sector, source = "curated", maxTickers = 40 } = await req.json();
    if (!sector || typeof sector !== "string") {
      return new Response(JSON.stringify({ error: "sector is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cap = Math.min(Math.max(5, Number(maxTickers) || 40), 50);

    // 1. Resolve universe
    let universe: string[] = [];
    if (source === "yahoo") {
      universe = await fetchYahooUniverse(sector, cap);
      if (!universe.length && CURATED_UNIVERSES[sector]) {
        console.log(`Yahoo screener empty for ${sector} — falling back to curated`);
        universe = CURATED_UNIVERSES[sector].slice(0, cap);
      }
    } else {
      universe = (CURATED_UNIVERSES[sector] ?? []).slice(0, cap);
    }

    if (!universe.length) {
      return new Response(JSON.stringify({
        error: `No universe available for sector "${sector}"`,
        sectorsAvailable: Object.keys(CURATED_UNIVERSES),
      }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Fetch prices for all tickers
    const { prices, failed } = await fetchAllPrices(universe);

    return new Response(JSON.stringify({
      sector,
      source,
      universe,
      prices,
      failed,
      fetched: Object.keys(prices).length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("sector-backtest error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
