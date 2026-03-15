import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    // Fetch chart data (Yahoo) + fundamentals (FMP profile + ratios) in parallel
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanTicker)}?range=${period}&interval=1d&includePrePost=false`;

    const fmpKey = Deno.env.get("FMP_API_KEY");
    const fmpProfileUrl = fmpKey
      ? `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(cleanTicker)}&apikey=${fmpKey}`
      : null;
    const fmpRatiosUrl = fmpKey
      ? `https://financialmodelingprep.com/stable/ratios-ttm?symbol=${encodeURIComponent(cleanTicker)}&apikey=${fmpKey}`
      : null;

    const fetchPromises: Promise<Response>[] = [
      fetch(chartUrl, { headers: { "User-Agent": ua } }),
    ];
    if (fmpProfileUrl) fetchPromises.push(fetch(fmpProfileUrl));
    if (fmpRatiosUrl) fetchPromises.push(fetch(fmpRatiosUrl));

    const responses = await Promise.all(fetchPromises);
    const chartRes = responses[0];
    const fmpProfileRes = responses[1];
    const fmpRatiosRes = responses[2];

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

    // Parse FMP data
    let fundamentals: Record<string, any> = {};
    if (fmpProfileRes) {
      try {
        if (fmpProfileRes.ok) {
          const fmpData = await fmpProfileRes.json();
          const profile = Array.isArray(fmpData) ? fmpData[0] : fmpData;

          // Parse ratios-ttm
          let ratios: Record<string, any> = {};
          if (fmpRatiosRes?.ok) {
            try {
              const ratiosData = await fmpRatiosRes.json();
              ratios = Array.isArray(ratiosData) ? ratiosData[0] || {} : ratiosData || {};
              // Log all available keys for debugging
              const allKeys = Object.keys(ratios);
              console.log("Ratios-ttm has", allKeys.length, "keys. PE-related:", 
                allKeys.filter(k => /pe|earn|price/i.test(k)).join(", ") || "none");
            } catch (e) { console.warn("Ratios parse failed:", e); }
          } else {
            console.warn("Ratios-ttm status:", fmpRatiosRes?.status);
          }

          if (profile) {
            const price = profile.price || meta?.regularMarketPrice || 0;

            // Log profile keys that might contain PE
            const profilePeKeys = Object.keys(profile).filter(k => /pe|earn|eps|ratio/i.test(k));
            console.log("Profile PE-related keys:", profilePeKeys.join(", ") || "none");
            console.log("Profile price:", price, "profile.pe:", profile.pe, "profile.eps:", profile.eps);

            // Try PE from ratios, then profile
            const pe = ratios.peRatioTTM ?? ratios.priceToEarningsRatioTTM ?? ratios.priceEarningsRatioTTM
              ?? profile.pe ?? profile.peRatio ?? null;

            // EPS
            const eps = profile.eps ?? (pe && price ? price / pe : null);

            // Forward PE
            const forwardPE = ratios.forwardPERatioTTM ?? null;

            // Dividend yield
            const dividendYield = ratios.dividendYieldTTM
              ?? (profile.lastDividend ? profile.lastDividend / (price || 1) : null);

            fundamentals = {
              ticker: cleanTicker,
              company_name: profile.companyName || meta?.longName || cleanTicker,
              sector: profile.sector || null,
              industry: profile.industry || null,
              pe_ratio: pe,
              forward_pe: forwardPE,
              market_cap: profile.marketCap ? Math.round(profile.marketCap) : null,
              eps: eps,
              dividend_yield: dividendYield,
              fifty_two_week_high: profile.range ? parseFloat(profile.range.split("-")[1]) : null,
              fifty_two_week_low: profile.range ? parseFloat(profile.range.split("-")[0]) : null,
              currency: profile.currency || meta?.currency || "USD",
              updated_at: new Date().toISOString(),
            };
            console.log("Final - PE:", fundamentals.pe_ratio, "EPS:", fundamentals.eps, "MarketCap:", fundamentals.market_cap);
          }
        } else {
          const errText = await fmpProfileRes.text();
          console.warn("FMP profile returned:", fmpProfileRes.status, errText.substring(0, 200));
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