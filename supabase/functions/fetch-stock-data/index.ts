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

    // Fetch chart data (Yahoo) + fundamentals (FMP + Yahoo quoteSummary) in parallel
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanTicker)}?range=${period}&interval=1d&includePrePost=false`;

    const fmpKey = Deno.env.get("FMP_API_KEY");
    const fmpProfileUrl = fmpKey
      ? `https://financialmodelingprep.com/api/v3/profile/${encodeURIComponent(cleanTicker)}?apikey=${fmpKey}`
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

    // Parse Yahoo quoteSummary for fundamentals fallback
    let yahooFundamentals: Record<string, any> = {};
    try {
      if (yahooSummaryRes.ok) {
        const summaryJson = await yahooSummaryRes.json();
        const result = summaryJson.quoteSummary?.result?.[0];
        if (result) {
          const keyStats = result.defaultKeyStatistics || {};
          const summaryDetail = result.summaryDetail || {};
          const assetProfile = result.assetProfile || {};
          const financialData = result.financialData || {};

          yahooFundamentals = {
            pe_ratio: summaryDetail.trailingPE?.raw ?? null,
            forward_pe: summaryDetail.forwardPE?.raw ?? keyStats.forwardPE?.raw ?? null,
            eps: financialData.revenuePerShare?.raw ? null : (keyStats.trailingEps?.raw ?? null),
            market_cap: summaryDetail.marketCap?.raw ?? null,
            dividend_yield: summaryDetail.dividendYield?.raw ?? null,
            fifty_two_week_high: summaryDetail.fiftyTwoWeekHigh?.raw ?? null,
            fifty_two_week_low: summaryDetail.fiftyTwoWeekLow?.raw ?? null,
            sector: assetProfile.sector || null,
            industry: assetProfile.industry || null,
            company_name: null, // will get from profile or meta
          };
          console.log("Yahoo fundamentals - PE:", yahooFundamentals.pe_ratio, "EPS:", yahooFundamentals.eps);
        }
      } else {
        console.warn("Yahoo quoteSummary returned:", yahooSummaryRes.status);
      }
    } catch (e) {
      console.warn("Yahoo quoteSummary parse failed:", e);
    }

    // Parse FMP profile and ratios
    let fmpFundamentals: Record<string, any> = {};
    if (fmpProfileRes) {
      try {
        if (fmpProfileRes.ok) {
          const fmpData = await fmpProfileRes.json();
          const profile = Array.isArray(fmpData) ? fmpData[0] : fmpData;

          let ratios: Record<string, any> = {};
          if (fmpRatiosRes?.ok) {
            try {
              const ratiosData = await fmpRatiosRes.json();
              ratios = Array.isArray(ratiosData) ? ratiosData[0] || {} : ratiosData || {};
            } catch (e) { console.warn("Ratios parse failed:", e); }
          }

          if (profile) {
            const price = profile.price || 0;
            const pe = ratios.peRatioTTM ?? ratios.priceToEarningsRatioTTM ?? ratios.priceEarningsRatioTTM ?? null;
            const eps = pe && price ? price / pe : null;

            fmpFundamentals = {
              company_name: profile.companyName || null,
              sector: profile.sector || null,
              industry: profile.industry || null,
              pe_ratio: pe,
              forward_pe: ratios.forwardPERatioTTM ?? null,
              market_cap: profile.marketCap ? Math.round(profile.marketCap) : null,
              eps: eps,
              dividend_yield: ratios.dividendYieldTTM ?? (profile.lastDividend ? profile.lastDividend / (price || 1) : null),
              fifty_two_week_high: profile.range ? parseFloat(profile.range.split("-")[1]) : null,
              fifty_two_week_low: profile.range ? parseFloat(profile.range.split("-")[0]) : null,
              currency: profile.currency || null,
            };
            console.log("FMP fundamentals - PE:", fmpFundamentals.pe_ratio, "EPS:", fmpFundamentals.eps);
          }
        }
      } catch (e) {
        console.warn("FMP parse failed:", e);
      }
    }

    // Merge: prefer FMP where available, fall back to Yahoo
    const fundamentals = {
      ticker: cleanTicker,
      company_name: fmpFundamentals.company_name || yahooFundamentals.company_name || meta?.longName || cleanTicker,
      sector: fmpFundamentals.sector || yahooFundamentals.sector || null,
      industry: fmpFundamentals.industry || yahooFundamentals.industry || null,
      pe_ratio: fmpFundamentals.pe_ratio ?? yahooFundamentals.pe_ratio ?? null,
      forward_pe: fmpFundamentals.forward_pe ?? yahooFundamentals.forward_pe ?? null,
      market_cap: fmpFundamentals.market_cap ?? yahooFundamentals.market_cap ?? null,
      eps: fmpFundamentals.eps ?? yahooFundamentals.eps ?? null,
      dividend_yield: fmpFundamentals.dividend_yield ?? yahooFundamentals.dividend_yield ?? null,
      fifty_two_week_high: fmpFundamentals.fifty_two_week_high ?? yahooFundamentals.fifty_two_week_high ?? null,
      fifty_two_week_low: fmpFundamentals.fifty_two_week_low ?? yahooFundamentals.fifty_two_week_low ?? null,
      currency: fmpFundamentals.currency || meta?.currency || "USD",
      updated_at: new Date().toISOString(),
    };

    console.log("Final fundamentals - PE:", fundamentals.pe_ratio, "EPS:", fundamentals.eps, "MarketCap:", fundamentals.market_cap);

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
        fundamentals: {
          pe_ratio: fundamentals.pe_ratio,
          forward_pe: fundamentals.forward_pe,
          market_cap: fundamentals.market_cap,
          eps: fundamentals.eps,
          sector: fundamentals.sector,
          industry: fundamentals.industry,
          dividend_yield: fundamentals.dividend_yield,
          fifty_two_week_high: fundamentals.fifty_two_week_high,
          fifty_two_week_low: fundamentals.fifty_two_week_low,
        },
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