import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { chargeAiCredits, refundAiCredits } from "../_shared/ai-credits.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are the QuantForecast Market Insights Specialist — a sharp, casual, and knowledgeable market buddy. You talk like a smart friend who happens to know a lot about markets.

PERSONALITY:
- Keep responses SHORT: 2-3 sentences max unless asked for detail
- Use natural fillers: "sure thing", "let me think about that", "good question"
- Be conversational, not robotic. No bullet points unless specifically asked.
- Never say "I'm an AI" or "as an AI language model"
- Never mention APIs, data sources, platforms, or technical failures
- If you don't have info, pivot naturally: "Hmm, I'd want to dig deeper on that one. Try loading it in the chart and let's see what the numbers say!"

CONSTRAINTS:
- This is NOT financial advice. You provide market insights and education.
- Always include a brief disclaimer when discussing specific trades or recommendations: "just my read on it though, not financial advice"
- Focus on trends, patterns, fundamentals, and market context
- You can reference regression analysis, R², trend strength, P/E ratios, sectors, etc.
- When given context about a ticker, use it naturally in your response

CONTEXT FORMAT:
You may receive context about the user's current view:
- Current ticker and price
- Regression stats (R², slope, annual return)
- Fundamentals (P/E, EPS, sector, market cap)
Use this data conversationally when relevant.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const charge = await chargeAiCredits(req, "chat_insights", corsHeaders);
    if (!charge.ok) return charge.response;

    const { messages, context } = await req.json();


    // Build context-aware system message
    let systemContent = SYSTEM_PROMPT;
    if (context) {
      systemContent += `\n\nCURRENT USER CONTEXT:\n`;
      if (context.ticker) systemContent += `- Viewing: ${context.ticker}`;
      if (context.price) systemContent += ` at $${context.price.toFixed(2)}`;
      systemContent += "\n";
      if (context.rSquared != null)
        systemContent += `- R² (trend reliability): ${context.rSquared.toFixed(4)}\n`;
      if (context.annualReturn != null)
        systemContent += `- Implied annual return: ${(context.annualReturn * 100).toFixed(1)}%\n`;
      if (context.slope != null)
        systemContent += `- Trend slope: $${context.slope.toFixed(4)}/day\n`;
      if (context.fundamentals) {
        const f = context.fundamentals;
        if (f.sector) systemContent += `- Sector: ${f.sector}\n`;
        if (f.pe_ratio != null) systemContent += `- P/E: ${f.pe_ratio.toFixed(2)}\n`;
        if (f.eps != null) systemContent += `- EPS: $${f.eps.toFixed(2)}\n`;
        if (f.market_cap != null) systemContent += `- Market Cap: $${(f.market_cap / 1e9).toFixed(1)}B\n`;
      }
      if (context.website) systemContent += `- Company website: ${context.website}\n`;
    }

    const apiMessages = [
      { role: "system", content: systemContent },
      ...messages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("Missing API key");
    }

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: apiMessages,
          max_tokens: 500,
          temperature: 0.8,
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", errText);
      // Never expose technical details to user
      return new Response(
        JSON.stringify({
          reply:
            "Hmm, let me gather my thoughts on that one. Try asking again in a sec!",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const reply =
      data.choices?.[0]?.message?.content ||
      "Let me think about that... try rephrasing your question!";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({
        reply:
          "Give me a sec, something's a bit off on my end. Try again shortly!",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200, // Always 200 to client — no technical errors exposed
      }
    );
  }
});
