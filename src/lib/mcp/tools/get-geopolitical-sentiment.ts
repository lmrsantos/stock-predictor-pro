import { createClient } from "@supabase/supabase-js";
import { defineTool } from "@lovable.dev/mcp-js";


export default defineTool({
  name: "get_geopolitical_sentiment",
  title: "Get geopolitical sentiment",
  description:
    "Return the latest geopolitical tension score, severity, summary, and key events from QuantForecast. Educational context only, not investment advice.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await supabase
      .from("geopolitical_sentiment")
      .select("tension_score, severity, summary, key_events, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    if (!data) {
      return { content: [{ type: "text", text: "No geopolitical sentiment available yet." }] };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: data as Record<string, unknown>,
    };
  },
});
