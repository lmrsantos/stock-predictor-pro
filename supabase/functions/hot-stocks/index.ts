import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

  return { slope, intercept, rSquared, annualReturn, lastPrice };
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

    // Check cache — reuse results from last 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: cached } = await supabase
      .from("market_updates")
      .select("content")
      .eq("signal_type", "hot_stocks")
      .gte("created_at", twoHoursAgo)
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

    // Step 1: Use FMP Stock Screener to get a broad universe
    // Pull stocks with market cap > $500M, price > $5, US exchange, sorted by volume
    const screenerUrl = `https://financialmodelingprep.com/stable/company-screener?marketCapMoreThan=500000000&priceMoreThan=5&exchange=NYSE,NASDAQ&isActivelyTrading=true&limit=80&apikey=${FMP_API_KEY}`;
    
    console.log("Fetching stock screener...");
    const screenerRes = await fetch(screenerUrl);
    let screenerStocks: any[] = [];

    if (screenerRes.ok) {
      const data = await screenerRes.json();
      screenerStocks = Array.isArray(data) ? data : [];
      console.log(`Screener returned ${screenerStocks.length} stocks`);
    } else {
      const errText = await screenerRes.text();
      console.error(`Screener failed (${screenerRes.status}): ${errText.substring(0, 200)}`);
    }

    // Also try to pull market movers for extra candidates
    let movers: any[] = [];
    try {
      const [activesRes, gainersRes] = await Promise.all([
        fetch(`https://financialmodelingprep.com/stable/most-actives?apikey=${FMP_API_KEY}`),
        fetch(`https://financialmodelingprep.com/stable/most-gainer?apikey=${FMP_API_KEY}`),
      ]);
      if (activesRes.ok) {
        const d = await activesRes.json();
        if (Array.isArray(d)) movers.push(...d);
      } else { await activesRes.text(); }
      if (gainersRes.ok) {
        const d = await gainersRes.json();
        if (Array.isArray(d)) movers.push(...d);
      } else { await gainersRes.text(); }
    } catch (e) {
      console.error("Movers fetch error:", e);
    }

    // Merge all candidates, deduplicate
    const seen = new Set<string>();
    const candidates: Array<{ symbol: string; name: string; price: number; change: number; sector: string; marketCap: number }> = [];

    for (const stock of [...movers, ...screenerStocks]) {
      const sym = stock.symbol || stock.ticker;
      if (!sym || seen.has(sym) || sym.includes(".") || sym.includes("-")) continue;
      seen.add(sym);
      candidates.push({
        symbol: sym,
        name: stock.companyName || stock.name || sym,
        price: stock.price || stock.lastPrice || 0,
        change: stock.changesPercentage || stock.change || 0,
        sector: stock.sector || "",
        marketCap: stock.marketCap || stock.mktCap || 0,
      });
    }

    console.log(`Total unique candidates: ${candidates.length}`);

    if (candidates.length === 0) {
      // Ultimate fallback
      return new Response(JSON.stringify({ 
        stocks: [], 
        cached: false, 
        message: "Market data temporarily unavailable. Try again during trading hours." 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: For each candidate, get price history and run regression
    const scored: ScoredStock[] = [];
    let processed = 0;

    for (const candidate of candidates) {
      if (processed >= 40) break; // Limit API calls
      processed++;

      try {
        // Try DB first
        const { data: dbPrices } = await supabase
          .from("stock_prices")
          .select("close")
          .eq("ticker", candidate.symbol)
          .order("date", { ascending: true })
          .limit(200);

        let closes: number[] = [];

        if (dbPrices && dbPrices.length >= 50) {
          closes = dbPrices.map(p => p.close);
        } else {
          // Fetch from FMP historical
          const histRes = await fetch(
            `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${candidate.symbol}&apikey=${FMP_API_KEY}`
          );
          if (histRes.ok) {
            const histData = await histRes.json();
            if (Array.isArray(histData) && histData.length >= 50) {
              closes = histData.slice(0, 252).reverse().map((d: any) => d.close);
            }
          } else {
            await histRes.text(); // consume body
          }
        }

        if (closes.length < 50) continue;

        const reg = computeRegression(closes);
        if (!reg) continue;

        // Scoring: weighted combination optimized for strong sustained trends
        // - R² (trend consistency): 35% — higher = more reliable trend
        // - Annual return strength: 35% — higher = stronger momentum
        // - Positive slope bonus: 20% — must be upward
        // - R² * return synergy: 10% — rewards stocks with BOTH high R² AND high return
        
        const rScore = Math.max(0, reg.rSquared) * 35;
        const returnCapped = Math.min(2, Math.max(0, reg.annualReturn)); // cap at 200%
        const returnScore = returnCapped * 17.5; // max 35
        const slopeBonus = reg.slope > 0 ? 20 : 0;
        const synergy = Math.max(0, reg.rSquared) * returnCapped * 5; // max ~10
        const totalScore = rScore + returnScore + slopeBonus + synergy;

        // Only include stocks with clear upward momentum and meaningful trend
        if (reg.slope > 0 && reg.rSquared > 0.3 && reg.annualReturn > 0.1) {
          scored.push({
            symbol: candidate.symbol,
            name: candidate.name,
            price: candidate.price || reg.lastPrice,
            dayChange: candidate.change,
            score: Math.round(totalScore * 10) / 10,
            rSquared: Math.round(reg.rSquared * 1000) / 1000,
            annualReturn: Math.round(reg.annualReturn * 1000) / 10,
            momentum: reg.annualReturn > 0.5 ? "Strong" : reg.annualReturn > 0.2 ? "Moderate" : "Mild",
            sector: candidate.sector,
            marketCap: formatMktCap(candidate.marketCap),
          });
        }
      } catch (e) {
        console.error(`Error processing ${candidate.symbol}:`, e);
        continue;
      }
    }

    console.log(`Scored ${scored.length} stocks with positive trends out of ${processed} processed`);

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
