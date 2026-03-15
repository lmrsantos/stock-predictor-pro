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

    // Fetch from Yahoo Finance (server-side, no CORS issues)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanTicker)}?range=${period}&interval=1d&includePrePost=false`;

    const yfResponse = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!yfResponse.ok) {
      const text = await yfResponse.text();
      throw new Error(`Yahoo Finance returned ${yfResponse.status}: ${text}`);
    }

    const json = await yfResponse.json();
    const result = json.chart?.result?.[0];

    if (!result) {
      throw new Error(`No data found for ticker "${cleanTicker}"`);
    }

    const timestamps: number[] = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0];
    const meta = result.meta;

    if (!quotes || !timestamps.length) {
      throw new Error(`Insufficient data for ${cleanTicker}`);
    }

    // Build rows for upsert, deduplicate by date (keep last occurrence)
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

    // Upsert into database using service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Batch upsert (on conflict update)
    const { error: upsertError } = await supabase
      .from("stock_prices")
      .upsert(rows, { onConflict: "ticker,date", ignoreDuplicates: false });

    if (upsertError) {
      throw new Error(`DB upsert failed: ${upsertError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        ticker: cleanTicker,
        name: meta?.longName || meta?.shortName || cleanTicker,
        currency: meta?.currency || "USD",
        rowsInserted: rows.length,
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
