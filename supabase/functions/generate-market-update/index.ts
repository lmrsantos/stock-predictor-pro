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
    const { ticker, adminKey } = await req.json();

    // Simple admin check — only allow posting with the correct key
    const ADMIN_KEY = Deno.env.get("MARKET_BLOG_ADMIN_KEY");
    if (!ADMIN_KEY || adminKey !== ADMIN_KEY) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    const systemPrompt = `You are a concise, professional market analyst writing short updates for a live blog feed on a stock analysis platform called QuantForecast. 

Rules:
- Write 1-3 sentences MAX (40-80 words)
- Be insightful and actionable — mention specific data points
- Use a professional but approachable tone
- Focus on trends, momentum, industry movements, or notable patterns
- Never give direct buy/sell advice — frame as observations
- Include relevant emojis sparingly (1-2 max)
- Reference the ticker if provided
- Vary your angle: sometimes technical, sometimes fundamental, sometimes industry/sector`;

    const userPrompt = ticker && stockContext
      ? `Write a brief market update about ${ticker}. ${stockContext}`
      : "Write a brief general market trend observation for today. Consider major indices, sector rotations, or notable market themes.";

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

    // Store in DB
    const { data: update, error: insertError } = await supabase
      .from("market_updates")
      .insert({
        content: content.trim(),
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
