import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Get Yahoo Finance crumb + cookies for authenticated endpoints
async function getYahooCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  try {
    // Step 1: Get cookies from Yahoo
    const cookieRes = await fetch("https://fc.yahoo.com/", {
      headers: { "User-Agent": ua },
      redirect: "manual",
    });
    const setCookies = cookieRes.headers.getSetCookie?.() || [];
    // Extract just the cookie key=value pairs
    const cookies = setCookies.map(c => c.split(";")[0]).join("; ");
    // Also consume body
    await cookieRes.text().catch(() => {});

    if (!cookies) {
      console.warn("No cookies from Yahoo");
      return null;
    }

    // Step 2: Get crumb using the cookies
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: {
        "User-Agent": ua,
        "Cookie": cookies,
      },
    });
    
    if (!crumbRes.ok) {
      console.warn("Crumb request failed:", crumbRes.status);
      return null;
    }

    const crumb = await crumbRes.text();
    if (!crumb || crumb.includes("<")) {
      console.warn("Invalid crumb:", crumb.substring(0, 50));
      return null;
    }

    return { crumb, cookie: cookies };
  } catch (e) {
    console.warn("Yahoo crumb auth failed:", e);
    return null;
  }
}

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

    // Get Yahoo auth crumb first
    const auth = await getYahooCrumb();
    const authHeaders: Record<string, string> = { "User-Agent": ua };
    if (auth) {
      authHeaders["Cookie"] = auth.cookie;
    }

    // Fetch chart data + quote (with crumb auth) + FMP profile in parallel
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanTicker)}?range=${period}&interval=1d&includePrePost=false`;
    const quoteUrl = auth
      ? `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(cleanTicker)}&crumb=${encodeURIComponent(auth.crumb)}`
      : null;

    const fmpKey = Deno.env.get("FMP_API_KEY");
    const fmpProfileUrl = fmpKey
      ? `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(cleanTicker)}&apikey=${fmpKey}`
      : null;

    const fetchPromises: Promise<Response>[] = [
      fetch(chartUrl, { headers: authHeaders }),
    ];
    if (quoteUrl) fetchPromises.push(fetch(quoteUrl, { headers: authHeaders }));
    if (fmpProfileUrl) fetchPromises.push(fetch(fmpProfileUrl));

    const responses = await Promise.all(fetchPromises);
    const chartRes = responses[0];
    let responseIdx = 1;
    const quoteRes = quoteUrl ? responses[responseIdx++] : null;
    const fmpProfileRes = fmpProfileUrl ? responses[responseIdx++] : null;

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

    // Parse Yahoo v7 quote for fundamentals
    let yahooQuote: Record<string, any> = {};
    if (quoteRes) {
      try {
        if (quoteRes.ok) {
          const quoteJson = await quoteRes.json();
          yahooQuote = quoteJson.quoteResponse?.result?.[0] || {};
          console.log("Yahoo quote - trailingPE:", yahooQuote.trailingPE,
            "forwardPE:", yahooQuote.forwardPE,
            "eps:", yahooQuote.epsTrailingTwelveMonths,
            "marketCap:", yahooQuote.marketCap);
        } else {
          console.warn("Yahoo quote returned:", quoteRes.status);
        }
      } catch (e) {
        console.warn("Yahoo quote parse failed:", e);
      }
    }

    // Parse FMP profile for sector/industry
    let fmpProfile: Record<string, any> = {};
    if (fmpProfileRes) {
      try {
        if (fmpProfileRes.ok) {
          const fmpData = await fmpProfileRes.json();
          fmpProfile = Array.isArray(fmpData) ? fmpData[0] || {} : fmpData || {};
        }
      } catch (e) {
        console.warn("FMP profile parse failed:", e);
      }
    }

    // Merge fundamentals
    const fundamentals = {
      ticker: cleanTicker,
      company_name: fmpProfile.companyName || yahooQuote.longName || yahooQuote.shortName || meta?.longName || cleanTicker,
      sector: fmpProfile.sector || null,
      industry: fmpProfile.industry || null,
      pe_ratio: yahooQuote.trailingPE ?? null,
      forward_pe: yahooQuote.forwardPE ?? null,
      market_cap: yahooQuote.marketCap ? Math.round(yahooQuote.marketCap) : (fmpProfile.marketCap ? Math.round(fmpProfile.marketCap) : null),
      eps: yahooQuote.epsTrailingTwelveMonths ?? null,
      dividend_yield: yahooQuote.trailingAnnualDividendYield ?? (fmpProfile.lastDividend && fmpProfile.price ? fmpProfile.lastDividend / fmpProfile.price : null),
      fifty_two_week_high: yahooQuote.fiftyTwoWeekHigh ?? (fmpProfile.range ? parseFloat(fmpProfile.range.split("-")[1]) : null),
      fifty_two_week_low: yahooQuote.fiftyTwoWeekLow ?? (fmpProfile.range ? parseFloat(fmpProfile.range.split("-")[0]) : null),
      currency: fmpProfile.currency || meta?.currency || "USD",
      updated_at: new Date().toISOString(),
    };

    console.log("Final - PE:", fundamentals.pe_ratio, "EPS:", fundamentals.eps, "MarketCap:", fundamentals.market_cap);

    // Build price rows
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