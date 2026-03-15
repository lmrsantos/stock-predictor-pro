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
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    // Step 1: Fetch chart data (prices) — this endpoint works without auth
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanTicker)}?range=${period}&interval=1d&includePrePost=false`;
    const chartRes = await fetch(chartUrl, { headers: { "User-Agent": ua } });

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

    // Step 2: Get fundamentals by visiting Yahoo Finance page first for cookies, then API
    let fundamentals: Record<string, any> = {};
    try {
      // First visit the page to get cookies
      const pageRes = await fetch(`https://finance.yahoo.com/quote/${encodeURIComponent(cleanTicker)}/`, {
        headers: {
          "User-Agent": ua,
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
      });

      const pageCookies = pageRes.headers.get("set-cookie") || "";
      console.log("Page status:", pageRes.status, "has cookies:", !!pageCookies);

      if (pageRes.ok) {
        const html = await pageRes.text();

        // Try to extract data from the page HTML
        // Yahoo embeds JSON-LD and data attributes
        const patterns = [
          // Modern Yahoo: look for fin-streamer data
          /"trailingPE"[:\s]*(?:{[^}]*"raw"[:\s]*)?(\d+\.?\d*)/,
          /"forwardPE"[:\s]*(?:{[^}]*"raw"[:\s]*)?(\d+\.?\d*)/,
          /"marketCap"[:\s]*(?:{[^}]*"raw"[:\s]*)?(\d+\.?\d*)/,
          /"epsTrailingTwelveMonths"[:\s]*(?:{[^}]*"raw"[:\s]*)?(-?\d+\.?\d*)/,
        ];

        const peMatch = html.match(/"trailingPE"[^}]*?"raw"\s*:\s*(\d+\.?\d*)/s) 
          || html.match(/Trailing P\/E.*?>([\d.]+)/s);
        const fpeMatch = html.match(/"forwardPE"[^}]*?"raw"\s*:\s*(\d+\.?\d*)/s)
          || html.match(/Forward P\/E.*?>([\d.]+)/s);
        const mcapMatch = html.match(/"marketCap"[^}]*?"raw"\s*:\s*(\d+\.?\d*)/s);
        const epsMatch = html.match(/"epsTrailingTwelveMonths"[^}]*?"raw"\s*:\s*(-?\d+\.?\d*)/s)
          || html.match(/EPS \(TTM\).*?>([\d.-]+)/s);
        const sectorMatch = html.match(/"sector"\s*:\s*"([^"]+)"/);
        const industryMatch = html.match(/"industry"\s*:\s*"([^"]+)"/);
        const w52hMatch = html.match(/"fiftyTwoWeekHigh"[^}]*?"raw"\s*:\s*(\d+\.?\d*)/s);
        const w52lMatch = html.match(/"fiftyTwoWeekLow"[^}]*?"raw"\s*:\s*(\d+\.?\d*)/s);
        const divYieldMatch = html.match(/"dividendYield"[^}]*?"raw"\s*:\s*(\d+\.?\d*)/s);

        const pe = peMatch ? parseFloat(peMatch[1]) : null;
        const fpe = fpeMatch ? parseFloat(fpeMatch[1]) : null;
        const eps = epsMatch ? parseFloat(epsMatch[1]) : null;

        console.log("Parsed fundamentals - PE:", pe, "FPE:", fpe, "EPS:", eps);

        if (pe !== null || fpe !== null || eps !== null) {
          fundamentals = {
            ticker: cleanTicker,
            company_name: meta?.longName || meta?.shortName || cleanTicker,
            sector: sectorMatch ? sectorMatch[1] : null,
            industry: industryMatch ? industryMatch[1] : null,
            pe_ratio: pe,
            forward_pe: fpe,
            market_cap: mcapMatch ? parseInt(mcapMatch[1]) : null,
            eps: eps,
            dividend_yield: divYieldMatch ? parseFloat(divYieldMatch[1]) : null,
            fifty_two_week_high: w52hMatch ? parseFloat(w52hMatch[1]) : null,
            fifty_two_week_low: w52lMatch ? parseFloat(w52lMatch[1]) : null,
            currency: meta?.currency || "USD",
            updated_at: new Date().toISOString(),
          };
        }
      }
    } catch (e) {
      console.warn("Fundamentals fetch failed:", e);
    }

    // Step 3: Build price rows, deduplicate by date
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

    // Step 4: Upsert into database
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
