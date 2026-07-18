import { createClient } from "@supabase/supabase-js";
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_stock_fundamentals",
  title: "Get stock fundamentals",
  description:
    "Return cached fundamentals (sector, P/E, EPS, market cap, website) for a ticker symbol. Educational reference only, not investment advice.",
  inputSchema: {
    ticker: z.string().trim().min(1).max(12).describe("Ticker symbol, e.g. AAPL."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ ticker }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const symbol = ticker.toUpperCase();
    const { data, error } = await supabase
      .from("stock_fundamentals")
      .select("*")
      .eq("ticker", symbol)
      .maybeSingle();
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    if (!data) {
      return { content: [{ type: "text", text: `No fundamentals cached for ${symbol}.` }] };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: data,
    };
  },
});
