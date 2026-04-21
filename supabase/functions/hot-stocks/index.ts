import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SECTOR_UNIVERSES: Record<string, string[]> = {
  Technology: [
    "AAPL", "MSFT", "GOOGL", "META", "NVDA", "AMD", "AVGO", "CRM", "ADBE",
    "ORCL", "INTC", "CSCO", "IBM", "NOW", "QCOM", "TXN", "AMAT", "MU", "PANW", "SNPS",
  ],
  "Aerospace & Defense": [
    "LMT", "RTX", "BA", "NOC", "GD", "LHX", "HII", "TDG", "HWM",
    "AXON", "LDOS", "KTOS", "RKLB", "LUNR", "PLTR", "SPR", "ERJ", "TXT", "CW",
  ],
  Biotech: [
    "LLY", "ABBV", "JNJ", "MRK", "PFE", "AMGN", "GILD", "REGN", "VRTX",
    "BMY", "MRNA", "BIIB", "ILMN", "ISRG", "DXCM", "ALGN", "HOLX", "EXAS", "SGEN", "ALNY",
  ],
  Consumer: [
    "PG", "KO", "PEP", "WMT", "COST", "MCD", "NKE", "SBUX", "TGT",
    "CL", "GIS", "K", "HSY", "KMB", "CHD", "SJM", "CAG", "MKC", "CLX", "KHC",
  ],
  "Utilities & Energy": [
    "NEE", "DUK", "SO", "D", "AEP", "SRE", "EXC", "XEL", "WEC",
    "ES", "ED", "AWK", "ATO", "CMS", "DTE", "ETR", "FE", "PEG", "PPL", "CEG",
  ],
  Financials: [
    "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "BLK", "SCHW",
    "AXP", "SPGI", "ICE", "CME", "MCO", "CB", "AON", "MMC", "TFC", "PNC", "USB",
  ],
};

function quickScore(closes: number[]): { annualReturn: number; rSquared: number } | null {
  const n = closes.length;
  if (n < 30) return null;

  const xs = Array.from({ length: n }, (_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = closes.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * closes[i], 0);
  const sumX2 = xs.reduce((s, x) => s + x * x, 0);
  const denominator = n * sumX2 - sumX * sumX;
  if (!denominator) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const ssTot = closes.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const ssRes = closes.reduce((s, y, i) => s + (y - (slope * i + intercept)) ** 2, 0);
  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  const lastPrice = closes[n - 1];
  const annualReturn = lastPrice > 0 ? (slope * 252) / lastPrice : 0;

  return { annualReturn, rSquared };
}

const avg = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function sd(values: number[]) {
  if (values.length === 0) return 0;
  const mean = avg(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function pctChange(from: number, to: number) {
  return from ? (to - from) / from : 0;
}

function annualizedVolatility(closes: number[]) {
  if (closes.length < 3) return 0;
  const returns = closes.slice(1).map((price, index) => pctChange(closes[index], price));
  return sd(returns) * Math.sqrt(252);
}

function classifyRegime(closes: number[]): "NORMAL" | "SHIFTED" | "EXTREME" {
  if (closes.length < 80) return "NORMAL";

  const recent = annualizedVolatility(closes.slice(-40));
  const baseline = annualizedVolatility(closes.slice(-120, -40));
  const ratio = baseline > 0 ? recent / baseline : 1;

  if (ratio > 2.1) return "EXTREME";
  if (ratio > 1.45) return "SHIFTED";
  return "NORMAL";
}

function directionalHitRate(closes: number[], window = 20, horizon = 5, samples = 24) {
  if (closes.length < window + horizon + 5) return 50;

  const start = Math.max(window, closes.length - samples - horizon);
  let hits = 0;
  let total = 0;

  for (let end = start; end < closes.length - horizon; end++) {
    const history = closes.slice(end - window, end);
    const score = quickScore(history);
    if (!score) continue;

    const predictedUp = score.annualReturn >= 0;
    const actualUp = closes[end + horizon] >= closes[end];
    if (predictedUp === actualUp) hits += 1;
    total += 1;
  }

  return total ? (hits / total) * 100 : 50;
}

function scoreStock(closes: number[], qs: { annualReturn: number; rSquared: number }) {
  if (closes.length < 80) return null;

  const currentPrice = closes[closes.length - 1];
  const recent20 = pctChange(closes[closes.length - 21], currentPrice);
  const recent60 = pctChange(closes[closes.length - 61], currentPrice);
  const volatility = annualizedVolatility(closes.slice(-80));
  const regime = classifyRegime(closes);
  const hitRate = directionalHitRate(closes);
  const walkForwardAccuracy = clamp(hitRate * 0.82 + qs.rSquared * 18, 0, 99);

  const forecastPct = clamp(
    (qs.annualReturn * 55 + recent20 * 35 + recent60 * 15 - volatility * 10) * 100,
    -30,
    30,
  );

  const confidence = clamp(
    22 +
      qs.rSquared * 42 +
      Math.max(0, qs.annualReturn * 100) +
      Math.max(0, recent20) * 120 +
      (hitRate - 50) * 0.7 -
      Math.max(0, volatility - 0.35) * 45 -
      (regime === "EXTREME" ? 24 : regime === "SHIFTED" ? 10 : 0),
    0,
    100,
  );

  const momentum = recent20 >= 0.08 && recent60 >= 0.12 && qs.rSquared >= 0.4
    ? "Strong"
    : recent20 >= 0.03 && recent60 >= 0.06
      ? "Moderate"
      : "Weak";

  let signal: "BUY" | "SELL" | "WAIT" | "STAY OUT" = "WAIT";
  if (regime === "EXTREME" || hitRate < 48) {
    signal = "STAY OUT";
  } else if (forecastPct >= 4 && confidence >= 55 && hitRate >= 54 && recent20 > 0) {
    signal = "BUY";
  } else if (forecastPct <= -4 && confidence >= 55 && hitRate >= 54 && recent20 < 0) {
    signal = "SELL";
  }

  return {
    signal,
    confidence: Math.round(confidence * 10) / 10,
    forecastPct: Math.round(forecastPct * 10) / 10,
    walkForwardAccuracy: Math.round(walkForwardAccuracy * 10) / 10,
    hitRate: Math.round(hitRate * 10) / 10,
    regime,
    converged: qs.rSquared >= 0.35 && hitRate >= 52,
    momentum,
  };
}

function fmtCap(value: number): string {
  if (value >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
  return `${Math.round(value)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FMP_API_KEY = Deno.env.get("FMP_API_KEY");
    if (!FMP_API_KEY) throw new Error("FMP_API_KEY not configured in backend secrets");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let sectorFilter: string | null = null;
    let topN = 5;

    try {
      const body = await req.json();
      sectorFilter = body.sector || null;
      if (body.limit) topN = Math.min(body.limit, 20);
    } catch {
      // no body supplied
    }

    const cacheKey = sectorFilter ? `hot_stocks_v3_${sectorFilter}` : "hot_stocks_v3_all";
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: cached } = await supabase
      .from("market_updates")
      .select("content")
      .eq("signal_type", cacheKey)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);

    if (cached?.length) {
      try {
        const parsed = JSON.parse(cached[0].content);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return new Response(JSON.stringify({ stocks: parsed, cached: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch {
        // ignore stale cache payloads
      }
    }

    const sectorsToScan: Record<string, string[]> = sectorFilter
      ? { [sectorFilter]: SECTOR_UNIVERSES[sectorFilter] ?? [] }
      : SECTOR_UNIVERSES;

    const allSymbols: { symbol: string; sector: string }[] = [];
    for (const [sector, symbols] of Object.entries(sectorsToScan)) {
      for (const symbol of symbols) {
        allSymbols.push({ symbol, sector });
      }
    }

    console.log(`Step 1: Quick momentum scan of ${allSymbols.length} stocks`);

    const candidates: {
      symbol: string;
      sector: string;
      closes: number[];
      qs: { annualReturn: number; rSquared: number };
    }[] = [];

    for (let i = 0; i < allSymbols.length; i += 8) {
      const batch = allSymbols.slice(i, i + 8);
      const results = await Promise.allSettled(
        batch.map(async ({ symbol, sector }) => {
          let closes: number[] = [];

          const { data: db } = await supabase
            .from("stock_prices")
            .select("close")
            .eq("ticker", symbol)
            .order("date", { ascending: true })
            .limit(260);

          if (db && db.length >= 50) {
            closes = db.map((point: { close: number }) => Number(point.close));
          } else {
            const response = await fetch(
              `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&apikey=${FMP_API_KEY}`,
            );

            if (response.ok) {
              const data = await response.json();
              if (Array.isArray(data) && data.length >= 80) {
                closes = data.slice(0, 252).reverse().map((point: { close: number }) => Number(point.close));
              }
            } else {
              await response.text();
            }
          }

          if (closes.length < 80) return null;

          const qs = quickScore(closes);
          if (!qs || qs.annualReturn <= 0 || qs.rSquared < 0.2) return null;

          return { symbol, sector, closes, qs };
        }),
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          candidates.push(result.value);
        }
      }
    }

    candidates.sort(
      (a, b) =>
        b.qs.annualReturn * b.qs.rSquared - a.qs.annualReturn * a.qs.rSquared,
    );

    const shortlist = candidates.slice(0, Math.min(Math.max(topN * 2, 6), 8));
    console.log(`Step 2: Lightweight scoring ${shortlist.length} shortlisted stocks`);

    const buySignals: {
      symbol: string;
      name: string;
      price: number;
      dayChange: number;
      sector: string;
      marketCap: string;
      score: number;
      signal: string;
      confidence: number;
      forecastPct: number;
      walkForwardAccuracy: number;
      hitRate: number;
      regime: string;
      converged: boolean;
      rSquared: number;
      annualReturn: number;
      momentum: string;
    }[] = [];

    for (const { symbol, sector, closes, qs } of shortlist) {
      try {
        const scored = scoreStock(closes, qs);
        if (!scored || scored.signal !== "BUY") continue;

        let name = symbol;
        let price = closes[closes.length - 1];
        let dayChange = 0;
        let marketCap = 0;

        try {
          const profileResponse = await fetch(
            `https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${FMP_API_KEY}`,
          );
          if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            if (Array.isArray(profileData) && profileData.length > 0) {
              name = profileData[0].companyName || symbol;
              price = Number(profileData[0].price) || price;
              dayChange = Number(profileData[0].changes) || 0;
              marketCap = Number(profileData[0].mktCap) || 0;
            }
          } else {
            await profileResponse.text();
          }
        } catch {
          // use defaults
        }

        buySignals.push({
          symbol,
          name,
          price,
          dayChange,
          sector,
          marketCap: fmtCap(marketCap),
          score: Math.round((scored.confidence * 0.7 + qs.rSquared * 30) * 10) / 10,
          signal: scored.signal,
          confidence: scored.confidence,
          forecastPct: scored.forecastPct,
          walkForwardAccuracy: scored.walkForwardAccuracy,
          hitRate: scored.hitRate,
          regime: scored.regime,
          converged: scored.converged,
          rSquared: Math.round(qs.rSquared * 1000) / 1000,
          annualReturn: Math.round(qs.annualReturn * 1000) / 10,
          momentum: scored.momentum,
        });
      } catch (error) {
        console.error(`Scoring error for ${symbol}:`, error);
      }
    }

    buySignals.sort((a, b) => b.score - a.score);
    const top = buySignals.slice(0, topN);

    console.log(`Done: ${buySignals.length} BUY signals, returning top ${top.length}`);

    if (top.length > 0) {
      await supabase.from("market_updates").insert({
        content: JSON.stringify(top),
        ticker: null,
        signal_type: cacheKey,
      });
    }

    return new Response(
      JSON.stringify({
        stocks: top,
        cached: false,
        totalBuySignals: buySignals.length,
        sectorsScanned: Object.keys(sectorsToScan),
        message: top.length === 0 ? "No strong buy candidates found in the current scan." : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Hot stocks error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : null,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});