import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Curated stock universes per sector ──────────────────────────────
const SECTOR_UNIVERSES: Record<string, string[]> = {
  Technology: [
    "AAPL", "MSFT", "GOOGL", "META", "NVDA", "AMD", "AVGO", "CRM", "ADBE",
    "ORCL", "INTC", "CSCO", "IBM", "NOW", "QCOM", "TXN", "AMAT", "MU",
    "PANW", "SNPS",
  ],
  "Aerospace & Defense": [
    "LMT", "RTX", "BA", "NOC", "GD", "LHX", "HII", "TDG", "HWM",
    "AXON", "LDOS", "KTOS", "RKLB", "LUNR", "PLTR", "SPR", "ERJ",
    "TXT", "CW", "MOG.A",
  ],
  Biotech: [
    "LLY", "ABBV", "JNJ", "MRK", "PFE", "AMGN", "GILD", "REGN", "VRTX",
    "BMY", "MRNA", "BIIB", "ILMN", "ISRG", "DXCM", "ALGN", "HOLX",
    "EXAS", "SGEN", "ALNY",
  ],
  Consumer: [
    "PG", "KO", "PEP", "WMT", "COST", "MCD", "NKE", "SBUX", "TGT",
    "CL", "GIS", "K", "HSY", "KMB", "CHD", "SJM", "CAG", "MKC",
    "CLX", "KHC",
  ],
  "Utilities & Energy": [
    "NEE", "DUK", "SO", "D", "AEP", "SRE", "EXC", "XEL", "WEC",
    "ES", "ED", "AWK", "ATO", "CMS", "DTE", "ETR", "FE", "PEG",
    "PPL", "CEG",
  ],
  Financials: [
    "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "BLK", "SCHW",
    "AXP", "SPGI", "ICE", "CME", "MCO", "CB", "AON", "MMC", "TFC",
    "PNC", "USB",
  ],
};

interface ScoredStock {
  symbol: string;
  name: string;
  price: number;
  dayChange: number;
  score: number;
  rSquared: number;
  annualReturn: number;
  momentum: string;
  sector: string;
  marketCap: string;
}

function computeRegression(closes: number[]) {
  const n = closes.length;
  if (n < 20) return null;

  const xs = closes.map((_, i) => i);
  const ys = closes;

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  const ssTotal = ys.reduce((acc, y) => acc + (y - meanY) ** 2, 0);
  const ssResidual = ys.reduce((acc, y, i) => acc + (y - (slope * xs[i] + intercept)) ** 2, 0);
  const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  const lastPrice = closes[closes.length - 1];
  const annualReturn = lastPrice > 0 ? (slope * 252) / lastPrice : 0;

  // Simple return over period
  const firstPrice = closes[0];
  const periodReturn = firstPrice > 0 ? (lastPrice - firstPrice) / firstPrice : 0;

  return { slope, intercept, rSquared, annualReturn, lastPrice, periodReturn };
}

function formatMktCap(v: number): string {
  if (v >= 1e12) return `${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return `${v}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FMP_API_KEY = Deno.env.get("FMP_API_KEY");
    if (!FMP_API_KEY) throw new Error("FMP_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse optional filters
    let sectorFilter: string | null = null;
    let topN = 5;
    try {
      const body = await req.json();
      sectorFilter = body.sector || null;
      if (body.limit) topN = Math.min(body.limit, 20);
    } catch { /* no body */ }

    const cacheKey = sectorFilter
      ? `hot_stocks_v4_${sectorFilter}`
      : "hot_stocks_v4_all";

    // Check cache (30 min)
    const cacheWindow = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: cached } = await supabase
      .from("market_updates")
      .select("content, created_at")
      .eq("signal_type", cacheKey)
      .gte("created_at", cacheWindow)
      .order("created_at", { ascending: false })
      .limit(1);

    if (cached && cached.length > 0) {
      try {
        const parsed = JSON.parse(cached[0].content);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return new Response(JSON.stringify({ stocks: parsed, cached: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch { /* fall through */ }
    }

    // ── Build candidate list from sector universes ──────────────────
    const sectorsToScan = sectorFilter
      ? { [sectorFilter]: SECTOR_UNIVERSES[sectorFilter] || [] }
      : SECTOR_UNIVERSES;

    const allSymbols: Array<{ symbol: string; sector: string }> = [];
    for (const [sector, symbols] of Object.entries(sectorsToScan)) {
      for (const sym of symbols) {
        allSymbols.push({ symbol: sym, sector });
      }
    }

    console.log(`Scanning ${allSymbols.length} stocks across ${Object.keys(sectorsToScan).length} sectors`);

    // ── Fetch price history & run regression for each ───────────────
    const scored: ScoredStock[] = [];
    const batchSize = 5; // Process in parallel batches of 5

    for (let i = 0; i < allSymbols.length; i += batchSize) {
      const batch = allSymbols.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(async ({ symbol, sector }) => {
          // Try DB first
          const { data: dbPrices } = await supabase
            .from("stock_prices")
            .select("close")
            .eq("ticker", symbol)
            .order("date", { ascending: true })
            .limit(200);

          let closes: number[] = [];

          if (dbPrices && dbPrices.length >= 50) {
            closes = dbPrices.map((p) => p.close);
          } else {
            // Fetch from FMP historical
            const histRes = await fetch(
              `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&apikey=${FMP_API_KEY}`
            );
            if (histRes.ok) {
              const histData = await histRes.json();
              if (Array.isArray(histData) && histData.length >= 50) {
                // Take ~6 months (126 trading days)
                closes = histData.slice(0, 126).reverse().map((d: any) => d.close);
              }
            } else {
              await histRes.text();
            }
          }

          if (closes.length < 30) return null;

          const reg = computeRegression(closes);
          if (!reg || reg.slope <= 0) return null;

          // Scoring: optimized for strong, reliable uptrends
          const rScore = Math.max(0, reg.rSquared) * 30;
          const returnCapped = Math.min(2, Math.max(0, reg.annualReturn));
          const returnScore = returnCapped * 15; // max 30
          const periodReturnScore = Math.min(1, Math.max(0, reg.periodReturn)) * 20;
          const slopeBonus = reg.slope > 0 ? 10 : 0;
          const synergy = Math.max(0, reg.rSquared) * returnCapped * 5;
          const totalScore = rScore + returnScore + periodReturnScore + slopeBonus + synergy;

          // Get quote info for name/price/change
          let name = symbol;
          let price = reg.lastPrice;
          let dayChange = 0;
          let marketCap = 0;

          try {
            const quoteRes = await fetch(
              `https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${FMP_API_KEY}`
            );
            if (quoteRes.ok) {
              const quoteData = await quoteRes.json();
              if (Array.isArray(quoteData) && quoteData.length > 0) {
                const q = quoteData[0];
                name = q.companyName || symbol;
                price = q.price || reg.lastPrice;
                dayChange = q.changes || 0;
                marketCap = q.mktCap || 0;
              }
            } else {
              await quoteRes.text();
            }
          } catch { /* skip quote data */ }

          if (reg.rSquared > 0.25 && reg.annualReturn > 0.05) {
            return {
              symbol,
              name,
              price,
              dayChange,
              score: Math.round(totalScore * 10) / 10,
              rSquared: Math.round(reg.rSquared * 1000) / 1000,
              annualReturn: Math.round(reg.annualReturn * 1000) / 10,
              momentum:
                reg.annualReturn > 0.5
                  ? "Strong"
                  : reg.annualReturn > 0.2
                  ? "Moderate"
                  : "Mild",
              sector,
              marketCap: formatMktCap(marketCap),
            } as ScoredStock;
          }
          return null;
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          scored.push(result.value);
        }
      }
    }

    console.log(`Scored ${scored.length} qualifying stocks`);

    // ── Pick top performers per sector, then overall top N ──────────
    // First get top 10 per sector
    const bySector: Record<string, ScoredStock[]> = {};
    for (const s of scored) {
      if (!bySector[s.sector]) bySector[s.sector] = [];
      bySector[s.sector].push(s);
    }

    const sectorTopPicks: ScoredStock[] = [];
    for (const [sector, stocks] of Object.entries(bySector)) {
      stocks.sort((a, b) => b.score - a.score);
      const top10 = stocks.slice(0, 10);
      console.log(`${sector}: ${top10.length} qualifying (top: ${top10[0]?.symbol} @ ${top10[0]?.score})`);
      sectorTopPicks.push(...top10);
    }

    // Then pick overall top N from the sector winners
    sectorTopPicks.sort((a, b) => b.score - a.score);
    const topResults = sectorTopPicks.slice(0, topN);

    // Cache
    if (topResults.length > 0) {
      await supabase.from("market_updates").insert({
        content: JSON.stringify(topResults),
        ticker: null,
        signal_type: cacheKey,
      });
    }

    return new Response(
      JSON.stringify({ stocks: topResults, cached: false, sectorsScanned: Object.keys(sectorsToScan) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error finding hot stocks:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
