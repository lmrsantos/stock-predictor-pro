import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ua =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface IntradayPoint { t: number; c: number; }
interface IntradaySeries {
  ticker: string;
  prevClose: number | null;
  points: IntradayPoint[];
}

async function fetchOne(ticker: string): Promise<IntradaySeries | null> {
  const clean = ticker.trim().toUpperCase();
  // 1d range with 5-minute buckets — this is the same feed Yahoo uses for
  // the little intraday sparkline in the header of a quote page.
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(clean)}?range=1d&interval=5m&includePrePost=false`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": ua } });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] =
      result.indicators?.quote?.[0]?.close ?? [];
    const prevClose: number | null =
      result.meta?.chartPreviousClose ?? result.meta?.previousClose ?? null;
    const points: IntradayPoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      if (c == null || !isFinite(c)) continue;
      points.push({ t: timestamps[i], c });
    }
    return { ticker: clean, prevClose, points };
  } catch (e) {
    console.warn("intraday fetch failed for", ticker, e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const { tickers } = await req.json();
    if (!Array.isArray(tickers) || !tickers.length) {
      return new Response(JSON.stringify({ error: "tickers[] required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const unique = Array.from(
      new Set(tickers.map((t: string) => String(t).trim().toUpperCase())),
    ).slice(0, 50);
    const results = await Promise.all(unique.map(fetchOne));
    const series: Record<string, IntradaySeries> = {};
    for (const r of results) if (r) series[r.ticker] = r;
    return new Response(JSON.stringify({ series }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
