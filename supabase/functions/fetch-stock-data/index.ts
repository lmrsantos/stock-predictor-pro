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

    // Step 1: Fetch chart data (prices)
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

    // Step 2: Get fundamentals - visit Yahoo page first to get cookies, then use quoteSummary
    let fundamentals: Record<string, any> = {};
    try {
      // Visit consent page first to get session cookies
      const consentRes = await fetch("https://finance.yahoo.com/", {
        headers: {
          "User-Agent": ua,
          "Accept": "text/html",
        },
        redirect: "manual",
      });

      // Collect all cookies
      const allCookies: string[] = [];
      // Get cookies from response headers
      for (const [key, val] of consentRes.headers.entries()) {
        if (key.toLowerCase() === "set-cookie") {
          const cookiePart = val.split(";")[0];
          allCookies.push(cookiePart);
        }
      }
      const cookieStr = allCookies.join("; ");
      console.log("Got cookies:", allCookies.length, "from status:", consentRes.status);

      // Now try the crumb endpoint with cookies
      const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
        headers: {
          "User-Agent": ua,
          "Cookie": cookieStr,
        },
      });

      console.log("Crumb status:", crumbRes.status);

      if (crumbRes.ok) {
        const crumb = (await crumbRes.text()).trim();
        console.log("Got crumb:", crumb.substring(0, 10));

        // Now fetch quoteSummary
        const summaryUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(cleanTicker)}?modules=summaryDetail,defaultKeyStatistics,assetProfile,financialData&crumb=${encodeURIComponent(crumb)}`;

        const summaryRes = await fetch(summaryUrl, {
          headers: {
            "User-Agent": ua,
            "Cookie": cookieStr,
          },
        });

        console.log("Summary status:", summaryRes.status);

        if (summaryRes.ok) {
          const summaryJson = await summaryRes.json();
          const r = summaryJson.quoteSummary?.result?.[0];
          if (r) {
            const sd = r.summaryDetail || {};
            const ks = r.defaultKeyStatistics || {};
            const ap = r.assetProfile || {};
            const fd = r.financialData || {};

            fundamentals = {
              ticker: cleanTicker,
              company_name: meta?.longName || meta?.shortName || cleanTicker,
              sector: ap?.sector || null,
              industry: ap?.industry || null,
              pe_ratio: sd?.trailingPE?.raw ?? null,
              forward_pe: sd?.forwardPE?.raw ?? ks?.forwardPE?.raw ?? null,
              market_cap: sd?.marketCap?.raw ?? null,
              eps: fd?.earningsGrowth?.raw ?? ks?.trailingEps?.raw ?? null,
              dividend_yield: sd?.dividendYield?.raw ?? null,
              fifty_two_week_high: sd?.fiftyTwoWeekHigh?.raw ?? null,
              fifty_two_week_low: sd?.fiftyTwoWeekLow?.raw ?? null,
              currency: sd?.currency || meta?.currency || "USD",
              updated_at: new Date().toISOString(),
            };
            console.log("Fundamentals parsed successfully, PE:", fundamentals.pe_ratio);
          }
        } else {
          console.warn("Summary returned:", summaryRes.status, await summaryRes.text().then(t => t.substring(0, 200)));
        }
      } else {
        console.warn("Crumb returned:", crumbRes.status);
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
