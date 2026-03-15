import { supabase } from "@/integrations/supabase/client";
import { StockDataPoint } from "./types";

export async function fetchAndStoreStockData(
  ticker: string,
  period: string = "1y"
): Promise<{ name: string; currency: string }> {
  const { data, error } = await supabase.functions.invoke("fetch-stock-data", {
    body: { ticker, period },
  });

  if (error) throw new Error(`Failed to fetch stock data: ${error.message}`);
  if (data?.error) throw new Error(data.error);

  return { name: data.name, currency: data.currency };
}

export async function getStockDataFromDB(
  ticker: string,
  period: string = "1y"
): Promise<StockDataPoint[]> {
  // Calculate date range based on period
  const now = new Date();
  const periodDays: Record<string, number> = {
    "1mo": 30,
    "3mo": 90,
    "6mo": 180,
    "1y": 365,
    "2y": 730,
    "5y": 1825,
  };
  const days = periodDays[period] || 365;
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("stock_prices")
    .select("date, open, high, low, close, volume")
    .eq("ticker", ticker.toUpperCase())
    .gte("date", startDate.toISOString().split("T")[0])
    .order("date", { ascending: true });

  if (error) throw new Error(`DB query failed: ${error.message}`);

  return (data || []).map((row) => ({
    date: row.date,
    timestamp: new Date(row.date).getTime() / 1000,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
  }));
}
