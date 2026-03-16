import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface StockCandidate {
  symbol: string;
  name: string;
  price: number;
  changesPercentage: number;
}

interface ScoredStock {
  symbol: string;
  name: string;
  price: number;
  dayChange: number;
  score: number;
  rSquared: number;
  annualReturn: number;
  momentum: string;
}

function computeRegression(closes: number[]) {
  const n = closes.length;
  if (n < 10) return null;

  const xs = closes.map((_, i) => i);
  const ys = closes;

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // R²
  const meanY = sumY / n;
  const ssTotal = ys.reduce((acc, y) => acc + (y - meanY) ** 2, 0);
  const ssResidual = ys.reduce((acc, y, i) => acc + (y - (slope * xs[i] + intercept)) ** 2, 0);
  const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  // Implied annual return
  const lastPrice = closes[closes.length - 1];
  const annualReturn = lastPrice > 0 ? (slope * 252) / lastPrice : 0;

  return { slope, intercept, rSquared, annualReturn, lastPrice };
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

    // Check cache — reuse results from last 4 hours
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const { data: cached } = await supabase
      .from("market_updates")
      .select("content")
      .eq("signal_type", "hot_stocks")
      .gte("created_at", fourHoursAgo)
      .order("created_at", { ascending: false })
      .limit(1);

    if (cached && cached.length > 0) {
      try {
        const parsed = JSON.parse(cached[0].content);
        return new Response(JSON.stringify({ stocks: parsed, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch { /* fall through to fresh computation */ }
    }

    // Fetch trending stocks from FMP
    let actives: StockCandidate[] = [];
    let gainers: StockCandidate[] = [];

    // Try multiple endpoint formats
    const endpoints = [
      { url: `https://financialmodelingprep.com/stable/most-actives?apikey=${FMP_API_KEY}`, type: "actives" },
      { url: `https://financialmodelingprep.com/stable/most-gainer?apikey=${FMP_API_KEY}`, type: "gainers" },
      { url: `https://financialmodelingprep.com/api/v3/stock_market/actives?apikey=${FMP_API_KEY}`, type: "actives" },
      { url: `https://financialmodelingprep.com/api/v3/stock_market/gainers?apikey=${FMP_API_KEY}`, type: "gainers" },
    ];

    for (const ep of endpoints) {
      if (ep.type === "actives" && actives.length > 0) continue;
      if (ep.type === "gainers" && gainers.length > 0) continue;
      try {
        const res = await fetch(ep.url);
        const text = await res.text();
        console.log(`FMP ${ep.type} (${res.status}): ${text.substring(0, 200)}`);
        if (res.ok) {
          const data = JSON.parse(text);
          if (Array.isArray(data) && data.length > 0) {
            if (ep.type === "actives") actives = data;
            else gainers = data;
          }
        }
      } catch (e) {
        console.error(`FMP endpoint failed: ${ep.url}`, e);
      }
    }

    console.log(`Found ${actives.length} actives, ${gainers.length} gainers`);

    // If FMP market movers are unavailable (market closed/plan limitation),
    // fall back to a curated list of popular large-cap stocks
    const fallbackTickers = [
      { symbol: "AAPL", name: "Apple Inc.", price: 0, changesPercentage: 0 },
      { symbol: "MSFT", name: "Microsoft Corp.", price: 0, changesPercentage: 0 },
      { symbol: "GOOGL", name: "Alphabet Inc.", price: 0, changesPercentage: 0 },
      { symbol: "AMZN", name: "Amazon.com Inc.", price: 0, changesPercentage: 0 },
      { symbol: "NVDA", name: "NVIDIA Corp.", price: 0, changesPercentage: 0 },
      { symbol: "META", name: "Meta Platforms Inc.", price: 0, changesPercentage: 0 },
      { symbol: "TSLA", name: "Tesla Inc.", price: 0, changesPercentage: 0 },
      { symbol: "JPM", name: "JPMorgan Chase", price: 0, changesPercentage: 0 },
      { symbol: "V", name: "Visa Inc.", price: 0, changesPercentage: 0 },
      { symbol: "UNH", name: "UnitedHealth Group", price: 0, changesPercentage: 0 },
      { symbol: "XOM", name: "Exxon Mobil", price: 0, changesPercentage: 0 },
      { symbol: "LLY", name: "Eli Lilly", price: 0, changesPercentage: 0 },
      { symbol: "WMT", name: "Walmart Inc.", price: 0, changesPercentage: 0 },
      { symbol: "MA", name: "Mastercard Inc.", price: 0, changesPercentage: 0 },
      { symbol: "COST", name: "Costco Wholesale", price: 0, changesPercentage: 0 },
    ];

    // Deduplicate and take top candidates
    const allCandidates = [...gainers, ...actives];
    const useFallback = allCandidates.length === 0;
    if (useFallback) {
      console.log("Using fallback stock list (market movers unavailable)");
    }
    const pool = useFallback ? fallbackTickers : allCandidates;

    const seen = new Set<string>();
    const candidates: StockCandidate[] = [];
    for (const stock of pool) {
      if (!stock.symbol || seen.has(stock.symbol) || stock.symbol.includes(".")) continue;
      seen.add(stock.symbol);
      candidates.push(stock);
      if (candidates.length >= 15) break;
    }

    if (candidates.length === 0) {
      throw new Error("No trending stocks found from FMP");
    }

    // For each candidate, try to get price history from DB or fetch it
    const scored: ScoredStock[] = [];

    for (const candidate of candidates) {
      try {
        // Check if we have recent price data
        const { data: prices } = await supabase
          .from("stock_prices")
          .select("close")
          .eq("ticker", candidate.symbol)
          .order("date", { ascending: true })
          .limit(200);

        let closes: number[] = [];

        if (prices && prices.length >= 30) {
          closes = prices.map(p => p.close);
        } else {
          // Fetch from FMP historical
          const histRes = await fetch(
            `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${candidate.symbol}&apikey=${FMP_API_KEY}`
          );
          if (histRes.ok) {
            const histData = await histRes.json();
            if (Array.isArray(histData) && histData.length >= 30) {
              // FMP returns newest first
              closes = histData.slice(0, 200).reverse().map((d: any) => d.close);
            }
          }
        }

        if (closes.length < 30) continue;

        const reg = computeRegression(closes);
        if (!reg) continue;

        // Score: weighted combination
        // - R² quality (0-1): weight 30%
        // - Positive momentum: weight 40%
        // - Annual return strength: weight 30%
        const rScore = Math.max(0, reg.rSquared) * 30;
        const momentumScore = reg.slope > 0 ? Math.min(40, reg.annualReturn * 100) : 0;
        const returnScore = Math.min(30, Math.max(0, reg.annualReturn * 50));
        const totalScore = rScore + momentumScore + returnScore;

        // Only include stocks with positive momentum and decent R²
        if (reg.slope > 0 && reg.rSquared > 0.15) {
          scored.push({
            symbol: candidate.symbol,
            name: candidate.name || candidate.symbol,
            price: candidate.price,
            dayChange: candidate.changesPercentage,
            score: Math.round(totalScore * 10) / 10,
            rSquared: Math.round(reg.rSquared * 1000) / 1000,
            annualReturn: Math.round(reg.annualReturn * 1000) / 10,
            momentum: reg.annualReturn > 0.5 ? "Strong" : reg.annualReturn > 0.2 ? "Moderate" : "Mild",
          });
        }
      } catch (e) {
        console.error(`Error processing ${candidate.symbol}:`, e);
        continue;
      }
    }

    // Sort by score and take top 5
    scored.sort((a, b) => b.score - a.score);
    const top5 = scored.slice(0, 5);

    // Cache the result
    if (top5.length > 0) {
      await supabase.from("market_updates").insert({
        content: JSON.stringify(top5),
        ticker: null,
        signal_type: "hot_stocks",
      });
    }

    return new Response(JSON.stringify({ stocks: top5, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error finding hot stocks:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
