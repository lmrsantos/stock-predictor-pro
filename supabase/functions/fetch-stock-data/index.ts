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

    // Fetch price history + fundamentals in parallel
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanTicker)}?range=${period}&interval=1d&includePrePost=false`;
    const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(cleanTicker)}`;

    const headers = { "User-Agent": "Mozilla/5.0" };

    const [chartRes, quoteRes] = await Promise.all([
      fetch(chartUrl, { headers }),
      fetch(quoteUrl, { headers }),
    ]);

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

    // Parse fundamentals (best-effort, don't fail if unavailable)
    let fundamentals: Record<string, any> = {};
    if (summaryRes.ok) {
      try {
        const summaryJson = await summaryRes.json();
        const summaryResult = summaryJson.quoteSummary?.result?.[0];
        const sd = summaryResult?.summaryDetail || {};
        const ks = summaryResult?.defaultKeyStatistics || {};
        const ap = summaryResult?.assetProfile || {};
        const fd = summaryResult?.financialData || {};

        fundamentals = {
          ticker: cleanTicker,
          company_name: meta?.longName || meta?.shortName || cleanTicker,
          sector: ap?.sector || null,
          industry: ap?.industry || null,
          pe_ratio: sd?.trailingPE?.raw ?? null,
          forward_pe: sd?.forwardPE?.raw ?? ks?.forwardPE?.raw ?? null,
          market_cap: sd?.marketCap?.raw ?? null,
          eps: fd?.revenuePerShare?.raw ?? ks?.trailingEps?.raw ?? null,
          dividend_yield: sd?.dividendYield?.raw ?? null,
          fifty_two_week_high: sd?.fiftyTwoWeekHigh?.raw ?? null,
          fifty_two_week_low: sd?.fiftyTwoWeekLow?.raw ?? null,
          currency: meta?.currency || "USD",
          updated_at: new Date().toISOString(),
        };
      } catch (e) {
        console.warn("Failed to parse summary data:", e);
      }
    }

    // Build rows for upsert, deduplicate by date
    const rowMap = new Map<string, {
      ticker: string;
      date: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>();

    for (let i = 0; i < timestamps.length; i++) {
      const close = quotes.close?.[i];
      const open = quotes.open?.[i];
      const high = quotes.high?.[i];
      const low = quotes.low?.[i];
      const volume = quotes.volume?.[i];

      if (close == null || open == null) continue;

      const date = new Date(timestamps[i] * 1000).toISOString().split("T")[0];

      rowMap.set(date, {
        ticker: cleanTicker,
        date,
        open,
        high: high ?? close,
        low: low ?? close,
        close,
        volume: volume ?? 0,
      });
    }

    const rows = Array.from(rowMap.values());

    // Upsert into database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Upsert prices + fundamentals in parallel
    const upsertPromises: Promise<any>[] = [
      supabase
        .from("stock_prices")
        .upsert(rows, { onConflict: "ticker,date", ignoreDuplicates: false }),
    ];

    if (fundamentals.ticker) {
      upsertPromises.push(
        supabase
          .from("stock_fundamentals")
          .upsert([fundamentals], { onConflict: "ticker", ignoreDuplicates: false })
      );
    }

    const results = await Promise.all(upsertPromises);

    const priceError = results[0]?.error;
    if (priceError) {
      throw new Error(`DB price upsert failed: ${priceError.message}`);
    }

    const fundError = results[1]?.error;
    if (fundError) {
      console.warn("Fundamentals upsert warning:", fundError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        ticker: cleanTicker,
        name: meta?.longName || meta?.shortName || cleanTicker,
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
