// supabase/functions/geopolitical-sentiment/index.ts
// Uses Claude instead of Gemini — same ANTHROPIC_API_KEY already configured
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Shared global cache: one AI call per 90 minutes for the whole platform,
    // no matter how many visitors load the gauge.
    const cacheWindow = new Date(Date.now() - 90 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("geopolitical_sentiment")
      .select("id")
      .gte("created_at", cacheWindow)
      .limit(1);


    if (recent?.length) {
      const { data: latest } = await supabase
        .from("geopolitical_sentiment")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      return new Response(JSON.stringify({ success: true, cached: true, sentiment: latest }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const FMP_API_KEY = Deno.env.get("FMP_API_KEY");

    // Fetch latest news headlines from FMP
    let newsHeadlines = "";
    if (FMP_API_KEY) {
      try {
        const newsRes = await fetch(
          `https://financialmodelingprep.com/stable/news/general-latest?page=0&limit=15&apikey=${FMP_API_KEY}`
        );
        if (newsRes.ok) {
          const news = await newsRes.json();
          newsHeadlines = (news as {title?: string; text?: string}[])
            .map(n => "- " + (n.title || n.text || ""))
            .filter(h => h.length > 5)
            .join("\n");
        }
      } catch (e) {
        console.error("News fetch failed:", e);
      }
    }

    const userPrompt = newsHeadlines
      ? `Based on these current news headlines, assess the global geopolitical tension level:\n\n${newsHeadlines}\n\nRespond with ONLY a JSON object, no markdown.`
      : `Assess the current global geopolitical tension level. Respond with ONLY a JSON object, no markdown.`;

    // Call Claude
    const systemPrompt = `You are a geopolitical risk analyst. Respond with ONLY valid JSON in this exact format:
{
  "tension_score": <number 0-100>,
  "severity": "<low|moderate|elevated|high|severe>",
  "summary": "<1-2 sentence plain text overview>",
  "key_events": [
    {"region": "<region>", "event": "<brief description>", "impact": "<low|medium|high>"}
  ]
}

Scoring: 0-20=low, 21-40=moderate, 41-60=elevated, 61-80=high, 81-100=severe.
Include 3-5 key events. Focus on conflicts, sanctions, nuclear threats, trade wars.
Output ONLY the JSON object. No markdown, no explanation.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        max_tokens: 800,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) throw new Error(`AI gateway error ${res.status}: ${await res.text()}`);

    const aiData = await res.json();
    let content = aiData.choices?.[0]?.message?.content || "";
    content = content.trim().replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();

    const parsed = JSON.parse(content);

    const { data: sentiment, error } = await supabase
      .from("geopolitical_sentiment")
      .insert({
        tension_score: Math.min(100, Math.max(0, parsed.tension_score)),
        severity: parsed.severity || "moderate",
        key_events: parsed.key_events || [],
        summary: parsed.summary || "",
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, sentiment }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Geopolitical sentiment error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
