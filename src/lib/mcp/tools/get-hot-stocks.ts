import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_hot_stocks",
  title: "Get hot stocks screener",
  description:
    "Return QuantForecast's Hot Stocks screener candidates for a given risk profile (conservative, moderate, aggressive). Historical/educational — not a buy or sell recommendation.",
  inputSchema: {
    riskProfile: z
      .enum(["conservative", "moderate", "aggressive"])
      .describe("Risk profile to screen for."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ riskProfile }) => {
    const url = `${process.env.SUPABASE_URL}/functions/v1/hot-stocks`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.SUPABASE_PUBLISHABLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_PUBLISHABLE_KEY!}`,
      },
      body: JSON.stringify({ riskProfile }),
    });
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `hot-stocks error ${res.status}: ${await res.text()}` }],
        isError: true,
      };
    }
    const json = await res.json();
    return {
      content: [{ type: "text", text: JSON.stringify(json) }],
      structuredContent: json,
    };
  },
});
