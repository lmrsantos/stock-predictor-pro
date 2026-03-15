import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticker, period = "1y" } = await req.json();

    if (!ticker || typeof ticker !== "string") {
      return new Response(
        JSON.stringify({ error: "ticker is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanTicker = ticker.trim().toUpperCase();
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

    // Fetch chart data (Yahoo) + fundamentals (FMP) in parallel
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanTicker)}?range=${period}&interval=1d&includePrePost=false`;

    const fmpKey = Deno.env.get("FMP_API_KEY");
    const fmpUrl = fmpKey
      ? `https://financialmodelingprep.com/api/v3/profile/${encodeURIComponent(cleanTicker)}?apikey=${fmpKey}`
      : null;

    const fetchPromises: Promise<Response>[] = [
      fetch(chartUrl, { headers: { "User-Agent": ua } }),
    ];
    if (fmpUrl) {
      fetchPromises.push(fetch(fmpUrl));
    }

    const responses = await Promise.all(fetchPromises);
    const chartRes = responses[0];

    if (!chartRes.ok) {
      const text = await chartRes.text();
      throw new Error(`Yahoo Finance chart returned ${chartRes.status}: ${text}`);
    }

    const chartJson = await chartRes.json();
    const chartResult = chartJson.chart?.result?.[0];

    if (!chartResult) {
      throw new Error(`No data found for ticker "${cleanTicker}"`);
    }

    const timestamps: number[] = chartResult.timestamp || [];
    const quotes = chartResult.indicators?.quote?.[0];
    const meta = chartResult.meta;

    if (!quotes || !timestamps.length) {
      throw new Error(`Insufficient data for ${cleanTicker}`);
    }

    // Parse FMP fundamentals
    let fundamentals: Record<string, any> = {};
    if (responses[1]) {
      try {
        if (responses[1].ok) {
          const fmpData = await responses[1].json();
          const profile = Array.isArray(fmpData) ? fmpData[0] : fmpData;
          if (profile) {
            fundamentals = {
              ticker: cleanTicker,
              company_name: profile.companyName || meta?.longName || cleanTicker,
              sector: profile.sector || null,
              industry: profile.industry || null,
              pe_ratio: profile.pe ?? null,
              forward_pe: profile.forwardPE ?? null,
              market_cap: profile.mktCap ?? null,
              eps: profile.eps ?? null,
              dividend_yield: profile.lastDiv ? profile.lastDiv / (profile.price || 1) : null,
              fifty_two_week_high: profile.range ? parseFloat(profile.range.split("-")[1]) : null,
              fifty_two_week_low: profile.range ? parseFloat(profile.range.split("-")[0]) : null,
              currency: profile.currency || meta?.currency || "USD",
              updated_at: new Date().toISOString(),
            };
            console.log("FMP fundamentals parsed - PE:", fundamentals.pe_ratio, "EPS:", fundamentals.eps);
          }
        } else {
          const errText = await responses[1].text();
          console.warn("FMP returned:", responses[1].status, errText.substring(0, 200));
        }
      } catch (e) {
        console.warn("FMP parse failed:", e);
      }
    }

    // Build price rows, deduplicate by date
    const rowMap = new Map<string, {
      ticker: string; date: string; open: number; high: number;
      low: number; close: number; volume: number;
    }>();

    for (let i = 0; i < timestamps.length; i++) {
      const close = quotes.close?.[i];
      const open = quotes.open?.[i];
      if (close == null || open == null) continue;

      const date = new Date(timestamps[i] * 1000).toISOString().split("T")[0];
      rowMap.set(date, {
        ticker: cleanTicker,
        date,
        open,
        high: quotes.high?.[i] ?? close,
        low: quotes.low?.[i] ?? close,
        close,
        volume: quotes.volume?.[i] ?? 0,
      });
    }

    const rows = Array.from(rowMap.values());

    // Upsert into database
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const upsertPromises: Promise<any>[] = [
      supabase.from("stock_prices").upsert(rows, { onConflict: "ticker,date", ignoreDuplicates: false }),
    ];

    if (fundamentals.ticker) {
      upsertPromises.push(
        supabase.from("stock_fundamentals").upsert([fundamentals], { onConflict: "ticker", ignoreDuplicates: false })
      );
    }

    const results = await Promise.all(upsertPromises);
    if (results[0]?.error) throw new Error(`DB price upsert failed: ${results[0].error.message}`);
    if (results[1]?.error) console.warn("Fundamentals upsert warning:", results[1].error.message);

    return new Response(
      JSON.stringify({
        success: true,
        ticker: cleanTicker,
        name: fundamentals.company_name || meta?.longName || meta?.shortName || cleanTicker,
        currency: meta?.currency || "USD",
        rowsInserted: rows.length,
        fundamentals: fundamentals.ticker ? {
          pe_ratio: fundamentals.pe_ratio,
          forward_pe: fundamentals.forward_pe,
          market_cap: fundamentals.market_cap,
          eps: fundamentals.eps,
          sector: fundamentals.sector,
          industry: fundamentals.industry,
          dividend_yield: fundamentals.dividend_yield,
          fifty_two_week_high: fundamentals.fifty_two_week_high,
          fifty_two_week_low: fundamentals.fifty_two_week_low,
        } : null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in fetch-stock-data:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
