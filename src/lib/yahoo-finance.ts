import { StockDataPoint } from "./types";

const CORS_PROXY = "https://corsproxy.io/?";

export async function fetchStockData(
  ticker: string,
  period: string = "1y"
): Promise<{ data: StockDataPoint[]; name: string; currency: string }> {
  const periodMap: Record<string, string> = {
    "1mo": "1mo",
    "3mo": "3mo",
    "6mo": "6mo",
    "1y": "1y",
    "2y": "2y",
    "5y": "5y",
  };

  const range = periodMap[period] || "1y";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d&includePrePost=false`;

  const response = await fetch(`${CORS_PROXY}${encodeURIComponent(url)}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch data for ${ticker}`);
  }

  const json = await response.json();
  const result = json.chart?.result?.[0];

  if (!result) {
    throw new Error(`No data found for ticker "${ticker}"`);
  }

  const timestamps: number[] = result.timestamp || [];
  const quotes = result.indicators?.quote?.[0];
  const meta = result.meta;

  if (!quotes || !timestamps.length) {
    throw new Error(`Insufficient data for ${ticker}`);
  }

  const data: StockDataPoint[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const close = quotes.close?.[i];
    const open = quotes.open?.[i];
    const high = quotes.high?.[i];
    const low = quotes.low?.[i];
    const volume = quotes.volume?.[i];

    if (close == null || open == null) continue;

    const date = new Date(timestamps[i] * 1000);
    data.push({
      date: date.toISOString().split("T")[0],
      timestamp: timestamps[i],
      open,
      high: high ?? close,
      low: low ?? close,
      close,
      volume: volume ?? 0,
    });
  }

  return {
    data,
    name: meta?.longName || meta?.shortName || ticker.toUpperCase(),
    currency: meta?.currency || "USD",
  };
}
