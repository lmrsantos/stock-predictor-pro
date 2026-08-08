import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchMarketNews(fmpKey: string, ticker?: string): Promise<string> {
  try {
    // Fetch general market news
    const generalUrl = `https://financialmodelingprep.com/stable/news/stock-latest?page=0&limit=5&apikey=${fmpKey}`;
    const generalRes = await fetch(generalUrl);
    let generalNews: any[] = [];
    if (generalRes.ok) {
      const raw = await generalRes.json();
      generalNews = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
    }

    let tickerNews: any[] = [];
    if (ticker && !ticker.startsWith("^")) {
      const tickerUrl = `https://financialmodelingprep.com/stable/news/stock?symbols=${ticker}&limit=5&apikey=${fmpKey}`;
      const tickerRes = await fetch(tickerUrl);
      if (tickerRes.ok) {
        const raw = await tickerRes.json();
        tickerNews = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
      }
    }

    const allNews = [...tickerNews, ...generalNews].slice(0, 8);
    if (!allNews.length) return "";

    const headlines = allNews
      .map((n: any) => {
        const title = typeof n === 'string' ? n : (n?.title || n?.text || "");
        const symbol = typeof n === 'object' ? n?.symbol : "";
        return title ? `- ${title}${symbol ? ` (${symbol})` : ""}` : "";
      })
      .filter((h: string) => h.length > 3)
      .join("\n");

    return headlines ? `\n\nRECENT NEWS HEADLINES:\n${headlines}` : "";
  } catch (e) {
    console.error("Failed to fetch news:", e);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticker: requestedTicker, adminKey, auto } = await req.json();
    // Auto mode always produces ONE globally shared general update — per-ticker
    // AI commentary would multiply cost with every visitor and every symbol.
    const ticker = auto ? null : requestedTicker;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auto mode: shared global cache — at most one AI call per 45 minutes for
    // the whole platform, regardless of how many visitors load the page.
    if (auto) {
      const windowStart = new Date(Date.now() - 45 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("market_updates")
        .select("id")
        .is("ticker", null)
        .gte("created_at", windowStart)
        .limit(1);

      if (recent && recent.length > 0) {
        return new Response(JSON.stringify({ skipped: true, reason: "Shared update is still fresh" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const ADMIN_KEY = Deno.env.get("MARKET_BLOG_ADMIN_KEY");
      if (!ADMIN_KEY || adminKey !== ADMIN_KEY) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }


    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const FMP_API_KEY = Deno.env.get("FMP_API_KEY");

    // Fetch real news headlines
    let newsContext = "";
    if (FMP_API_KEY) {
      newsContext = await fetchMarketNews(FMP_API_KEY, ticker || undefined);
    }

    // Fetch recent stock data for context
    let stockContext = "";
    if (ticker) {
      const { data: prices } = await supabase
        .from("stock_prices")
        .select("date, close, volume")
        .eq("ticker", ticker)
        .order("date", { ascending: false })
        .limit(10);

      const { data: fundamentals } = await supabase
        .from("stock_fundamentals")
        .select("*")
        .eq("ticker", ticker)
        .maybeSingle();

      if (prices?.length) {
        const latest = prices[0];
        const prev = prices[1];
        const change = prev ? ((latest.close - prev.close) / prev.close * 100).toFixed(2) : "N/A";
        stockContext = `Current data for ${ticker}: Price $${latest.close}, daily change ${change}%, `;
        if (fundamentals) {
          stockContext += `P/E ${fundamentals.pe_ratio ?? "N/A"}, EPS $${fundamentals.eps ?? "N/A"}, Sector: ${fundamentals.sector ?? "N/A"}, Industry: ${fundamentals.industry ?? "N/A"}. `;
        }
        stockContext += `Last 5 closes: ${prices.slice(0, 5).map(p => `$${p.close}`).join(", ")}.`;
      }
    }

    // Determine if US market is open
    const now = new Date();
    const nyTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const day = nyTime.getDay();
    const hour = nyTime.getHours();
    const minute = nyTime.getMinutes();
    const timeInMinutes = hour * 60 + minute;
    const isWeekday = day >= 1 && day <= 5;
    const isMarketHours = isWeekday && timeInMinutes >= 570 && timeInMinutes < 960;
    const isPreMarket = isWeekday && timeInMinutes >= 240 && timeInMinutes < 570;
    const isAfterHours = isWeekday && timeInMinutes >= 960 && timeInMinutes < 1200;

    let marketStatus = "";
    if (isMarketHours) {
      marketStatus = "The US stock market is currently OPEN (regular trading hours).";
    } else if (isPreMarket) {
      marketStatus = "The US market is in PRE-MARKET hours. Regular trading has not started yet.";
    } else if (isAfterHours) {
      marketStatus = "The US market is in AFTER-HOURS trading. Regular session has closed.";
    } else {
      marketStatus = "The US stock market is currently CLOSED (weekend or outside trading hours). Any price data shown is from the last trading session.";
    }

    const systemPrompt = `You are a concise, professional market analyst writing short updates for a live blog feed on a stock analysis platform called QuantForecast. 

CRITICAL CONTEXT: ${marketStatus}

Rules:
- Write 1-3 sentences MAX (40-80 words)
- Be insightful and actionable — mention specific data points
- Use a professional but approachable tone
- Focus on trends, momentum, industry movements, or notable patterns
- Never give direct buy/sell advice — frame as observations
- Include relevant emojis sparingly (1-2 max)
- NEVER use markdown formatting (no **, *, #, -, etc). Output ONLY plain text.
- Reference the ticker if provided
- Vary your angle: sometimes technical, sometimes fundamental, sometimes industry/sector
- IMPORTANT: If the market is CLOSED, frame your commentary around the LAST trading session's data, upcoming catalysts, or weekly recap. Do NOT say the market is moving right now. Use past tense or forward-looking language instead.
- If it's pre-market or after-hours, acknowledge the session context appropriately.
- When news headlines are provided, USE THEM to ground your commentary in real events (geopolitical tensions, Fed decisions, earnings, oil prices, etc). Reference specific events naturally.
- Prioritize the most impactful/relevant news for the ticker or market context.`;

    const userPrompt = ticker && stockContext
      ? `Write a brief market update about ${ticker}. ${stockContext}${newsContext}`
      : `Write a brief general market trend observation for today. Consider major indices, sector rotations, or notable market themes.${newsContext}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again shortly" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content from AI");

    // Strip any markdown formatting the AI might have used
    const cleanContent = content.trim()
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/^#+\s*/gm, '')
      .replace(/^[-*]\s+/gm, '')
      .replace(/[{}[\]"]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const { data: update, error: insertError } = await supabase
      .from("market_updates")
      .insert({
        content: cleanContent,
        ticker: ticker || null,
        signal_type: ticker ? "stock" : "general",
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true, update }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error generating market update:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
