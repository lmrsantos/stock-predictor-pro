import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getGeopoliticalSentiment from "./tools/get-geopolitical-sentiment";
import getHotStocks from "./tools/get-hot-stocks";
import getStockFundamentals from "./tools/get-stock-fundamentals";
import listMyPortfolios from "./tools/list-my-portfolios";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "quantforecast-mcp",
  title: "QuantForecast",
  version: "0.1.0",
  instructions:
    "Educational quantitative market analysis tools from QuantForecast. Provides geopolitical sentiment, cached stock fundamentals, the Hot Stocks screener, and (when signed in) the user's own tracked portfolio holdings. All outputs are for informational/educational purposes only and are NOT investment advice. QuantForecast is not a registered investment adviser.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getGeopoliticalSentiment, getStockFundamentals, getHotStocks, listMyPortfolios],
});
