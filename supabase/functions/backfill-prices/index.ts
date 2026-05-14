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

    // Helpers ----------------------------------------------------------------
    type Row = { ticker: string; date: string; close: number; open: number; high: number; low: number; volume: number };

    async function fetchFMP(symbol: string): Promise<Row[] | { retry: boolean } | null> {
      const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&apikey=${FMP_API_KEY}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.status === 429) { await res.text(); return { retry: true }; }
      if (res.status === 402) { await res.text(); return null; } // plan-blocked → Yahoo fallback
      if (!res.ok) { await res.text(); console.warn(`${symbol}: FMP ${res.status}`); return null; }
      const data = await res.json();
      if (!Array.isArray(data) || data.length < 10) return null;
      return data.slice(0, 260).map((p: any) => ({
        ticker: symbol,
        date: p.date,
        close: p.close,
        open: p.open ?? p.close,
        high: p.high ?? p.close,
        low: p.low ?? p.close,
        volume: p.volume ?? 0,
      }));
    }

    async function fetchYahoo(symbol: string): Promise<Row[] | null> {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
        const res = await fetch(url, {
          signal: AbortSignal.timeout(8000),
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!res.ok) { await res.text(); console.warn(`${symbol}: Yahoo ${res.status}`); return null; }
        const json = await res.json();
        const r = json?.chart?.result?.[0];
        const ts: number[] = r?.timestamp || [];
        const q = r?.indicators?.quote?.[0] || {};
        if (!ts.length || !q.close) return null;
        const rows: Row[] = [];
        for (let i = 0; i < ts.length; i++) {
          const close = q.close[i];
          if (close == null) continue;
          rows.push({
            ticker: symbol,
            date: new Date(ts[i] * 1000).toISOString().split("T")[0],
            close,
            open: q.open?.[i] ?? close,
            high: q.high?.[i] ?? close,
            low: q.low?.[i] ?? close,
            volume: q.volume?.[i] ?? 0,
          });
        }
        return rows.length >= 10 ? rows : null;
      } catch (e) {
        console.warn(`${symbol}: Yahoo fetch failed — ${(e as Error).message}`);
        return null;
      }
    }

    async function upsert(symbol: string, rows: Row[]): Promise<boolean> {
      const { error } = await supabase
        .from("stock_prices")
        .upsert(rows, { onConflict: "ticker,date", ignoreDuplicates: false });
      if (error) { console.error(`${symbol}: DB upsert failed — ${error.message}`); return false; }
      return true;
    }

    // Run backfill in background so we don't hit gateway timeout ------------
    const work = (async () => {
      let refreshed = 0;
      let failed = 0;
      const BATCH = 3;
      const BATCH_DELAY_MS = 1500;

      for (let i = 0; i < stale.length; i += BATCH) {
        const batch = stale.slice(i, i + BATCH);

        await Promise.allSettled(batch.map(async (symbol) => {
          try {
            let rows: Row[] | null = null;

            let result = await fetchFMP(symbol);
            if (result && "retry" in result) {
              await new Promise(r => setTimeout(r, 2000));
              result = await fetchFMP(symbol);
            }
            if (Array.isArray(result)) rows = result;

            if (!rows) rows = await fetchYahoo(symbol);

            if (!rows) { failed++; console.warn(`${symbol}: no data from FMP or Yahoo`); return; }

            const ok = await upsert(symbol, rows);
            if (ok) { refreshed++; console.log(`✓ ${symbol}: ${rows.length} rows`); }
            else failed++;
          } catch (e) {
            console.error(`${symbol}: ${(e as Error).message}`);
            failed++;
          }
        }));

        if (i + BATCH < stale.length) {
          await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
      }

      console.log(`Backfill complete: ${refreshed} refreshed, ${failed} failed`);
    })();

    // @ts-ignore — EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
    else work.catch((e) => console.error("background work error:", e));

    return new Response(JSON.stringify({
      success: true,
      message: "Backfill started in background",
      total: UNIVERSE.length,
      alreadyFresh: UNIVERSE.length - stale.length,
      queued: stale.length,
      staleTickers: stale,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 202 });

  } catch (error) {
    console.error("Backfill error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
