// supabase/functions/backfill-prices/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Keeps stock_prices table fresh for all universe symbols.
// Called by pg_cron every 6 hours.
// Fetches only symbols that are missing or stale (> 2 days old).
// Processes in small batches to avoid FMP rate limits.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Full universe — must match run-hot-stocks-scan
const UNIVERSE = [
  // Technology
  "NVDA","AAPL","MSFT","AMD","AVGO","META","GOOGL","QCOM","AMAT","INTC","TSLA","AMZN","TSM",
  // Quantum Computing
  "IONQ","ARQQ","RGTI","QBTS","QUBT",
  // Aerospace & Defense
  "LMT","RTX","RKLB","PLTR","NOC","AXON","LUNR","KTOS",
  // Biotech
  "LLY","ABBV","VRTX","REGN","AMGN","MRK","ISRG","MRNA",
  // Consumer
  "WMT","COST","PG","KO","MCD",
  // Utilities & Energy
  "NEE","CEG","VST","XEL","ETR","XOM","CVX",
  // Financials
  "JPM","V","GS","BLK","SPGI",
  // Fixed Income
  "TLT","IEF","BIL","AGG","LQD","SGOV","SHV","VCSH","VGSH","IUSB",
  // Real Assets
  "GLD","IAU","VNQ","AMT","O","IGSB","IGIB","IGLB",
  // Income & Dividends
  "SCHD","VYM","JEPI","HDV","PFFD","DVY","QDIV","DGRW",
  // Sector ETFs
  "XLE","XLK","XLF","XLV","XLI","IYW","IYE","IYH",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const FMP_API_KEY = Deno.env.get("FMP_API_KEY");
    if (!FMP_API_KEY) throw new Error("FMP_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find which symbols are missing or stale (last price > 2 days old)
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      .toISOString().split("T")[0];

    const { data: freshRows } = await supabase
      .from("stock_prices")
      .select("ticker")
      .in("ticker", UNIVERSE)
      .gte("date", twoDaysAgo)
      .limit(500);

    const freshSet = new Set((freshRows || []).map((r: { ticker: string }) => r.ticker));
    const stale = UNIVERSE.filter(sym => !freshSet.has(sym));

    console.log(`Backfill: ${stale.length}/${UNIVERSE.length} symbols need refresh`);
    console.log(`Stale: ${stale.join(", ")}`);

    if (stale.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: "All symbols are fresh — no backfill needed",
        refreshed: 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch in batches of 5 to avoid rate limits
    let refreshed = 0;
    let failed = 0;

    for (let i = 0; i < stale.length; i += 5) {
      const batch = stale.slice(i, i + 5);

      await Promise.allSettled(batch.map(async (symbol) => {
        try {
          // Fetch last 1 year of daily prices from FMP
          const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&apikey=${FMP_API_KEY}`;
          const res = await fetch(url, { signal: AbortSignal.timeout(5000) });

          if (!res.ok) {
            console.warn(`${symbol}: FMP returned ${res.status}`);
            await res.text();
            failed++;
            return;
          }

          const data = await res.json();
          if (!Array.isArray(data) || data.length < 10) {
            console.warn(`${symbol}: insufficient data (${data?.length ?? 0} rows)`);
            failed++;
            return;
          }

          // Take last 260 trading days (1 year)
          const rows = data.slice(0, 260).map((p: {
            date: string; close: number; open: number;
            high: number; low: number; volume: number;
          }) => ({
            ticker: symbol,
            date: p.date,
            close: p.close,
            open: p.open || p.close,
            high: p.high || p.close,
            low: p.low || p.close,
            volume: p.volume || 0,
          }));

          const { error } = await supabase
            .from("stock_prices")
            .upsert(rows, { onConflict: "ticker,date", ignoreDuplicates: false });

          if (error) {
            console.error(`${symbol}: DB upsert failed — ${error.message}`);
            failed++;
          } else {
            console.log(`✓ ${symbol}: ${rows.length} rows upserted`);
            refreshed++;
          }
        } catch (e) {
          console.error(`${symbol}: fetch failed — ${(e as Error).message}`);
          failed++;
        }
      }));

      // Small delay between batches to respect FMP rate limits
      if (i + 5 < stale.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log(`Backfill complete: ${refreshed} refreshed, ${failed} failed`);

    return new Response(JSON.stringify({
      success: true,
      total: UNIVERSE.length,
      alreadyFresh: UNIVERSE.length - stale.length,
      refreshed,
      failed,
      staleTickers: stale,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Backfill error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
