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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Rate limit: only generate once per 30 minutes
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("geopolitical_sentiment")
      .select("id")
      .gte("created_at", thirtyMinsAgo)
      .limit(1);

    if (recent && recent.length > 0) {
      // Return the latest cached entry
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const FMP_API_KEY = Deno.env.get("FMP_API_KEY");

    // Fetch global news for geopolitical context
    let newsHeadlines = "";
    if (FMP_API_KEY) {
      try {
        const newsUrl = `https://financialmodelingprep.com/stable/news/general-latest?page=0&limit=15&apikey=${FMP_API_KEY}`;
        const newsRes = await fetch(newsUrl);
        if (newsRes.ok) {
          const news = await newsRes.json();
          newsHeadlines = news
            .map((n: any) => `- ${n.title || n.text || ""}`)
            .filter((h: string) => h.length > 5)
            .join("\n");
        }
      } catch (e) {
        console.error("Failed to fetch news for sentiment:", e);
      }
    }

    const systemPrompt = `You are a geopolitical risk analyst. Analyze current global events and produce a geopolitical tension assessment.

You MUST respond with ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "tension_score": <number 0-100>,
  "severity": "<low|moderate|elevated|high|severe>",
  "summary": "<1-2 sentence plain text overview of current global tension>",
  "key_events": [
    {"region": "<region name>", "event": "<brief description>", "impact": "<low|medium|high>"},
    {"region": "<region name>", "event": "<brief description>", "impact": "<low|medium|high>"}
  ]
}

Scoring guide:
- 0-20: Low - Normal diplomatic activity, minimal conflicts
- 21-40: Moderate - Some regional tensions, trade disputes
- 41-60: Elevated - Active regional conflicts, sanctions, military buildups
- 61-80: High - Multiple active conflicts, major power tensions, significant economic disruption
- 81-100: Severe - Major military escalations, direct superpower confrontation risks

Include 3-5 key events. Focus on conflicts, military activity, sanctions, nuclear threats, trade wars, and major geopolitical shifts.
Output ONLY the JSON object.`;

    const userPrompt = newsHeadlines
      ? `Based on these current news headlines, assess the global geopolitical tension level:\n\n${newsHeadlines}`
      : `Assess the current global geopolitical tension level based on your knowledge of recent world events.`;

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
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    let content = aiData.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content from AI");

    // Clean up potential markdown code blocks
    content = content.trim().replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();

    const parsed = JSON.parse(content);

    const { data: sentiment, error: insertError } = await supabase
      .from("geopolitical_sentiment")
      .insert({
        tension_score: Math.min(100, Math.max(0, parsed.tension_score)),
        severity: parsed.severity || "moderate",
        key_events: parsed.key_events || [],
        summary: parsed.summary || "No summary available",
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true, sentiment }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error generating geopolitical sentiment:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
