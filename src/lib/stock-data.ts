import { supabase } from "@/integrations/supabase/client";
import { StockDataPoint } from "./types";

export interface StockFundamentals {
  pe_ratio: number | null;
  forward_pe: number | null;
  market_cap: number | null;
  eps: number | null;
  sector: string | null;
  industry: string | null;
  dividend_yield: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
}

export interface AnalystRating {
  rating: string;
  score: number | null;
  recommendation: string | null;
  dcf_score: number | null;
  dcf_recommendation: string | null;
  roe_score: number | null;
  roe_recommendation: string | null;
  roa_score: number | null;
  roa_recommendation: string | null;
  pe_score: number | null;
  pe_recommendation: string | null;
  pb_score: number | null;
  pb_recommendation: string | null;
}

export interface StockFetchResult {
  name: string;
  currency: string;
  prices: StockDataPoint[];
  fundamentals: StockFundamentals | null;
  analystRating: AnalystRating | null;
  website: string | null;
  irWebsite: string | null;
}

export class SymbolNotFoundError extends Error {
  code = "SYMBOL_NOT_FOUND";
}

export async function fetchAndStoreStockData(
  ticker: string,
  period: string = "1y"
): Promise<StockFetchResult> {
  const { data, error } = await supabase.functions.invoke("fetch-stock-data", {
    body: { ticker, period },
  });

  if (error) {
    // supabase-js throws a generic message on non-2xx — read the real body.
    let payload: { error?: string; code?: string } | null = null;
    const res = (error as { context?: Response }).context;
    if (res && typeof res.json === "function") {
      payload = await res.json().catch(() => null);
    }
    if (payload?.code === "SYMBOL_NOT_FOUND" || res?.status === 404) {
      throw new SymbolNotFoundError(
        payload?.error || `"${ticker.toUpperCase()}" isn't a valid symbol. Check the ticker and try again.`
      );
    }
    throw new Error(payload?.error || `Failed to fetch stock data: ${error.message}`);
  }
  if (data?.error) {
    if (data.code === "SYMBOL_NOT_FOUND") throw new SymbolNotFoundError(data.error);
    throw new Error(data.error);
  }


  return {
    name: data.name,
    currency: data.currency,
    prices: (data.prices || []).map((row: StockDataPoint) => ({
      date: row.date,
      timestamp: row.timestamp ?? new Date(row.date).getTime() / 1000,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    })),
    fundamentals: data.fundamentals || null,
    analystRating: data.analystRating || null,
    website: data.website || null,
    irWebsite: data.irWebsite || null,
  };
}

export async function getStockDataFromDB(
  ticker: string,
  period: string = "1y"
): Promise<StockDataPoint[]> {
  const now = new Date();
  const periodDays: Record<string, number> = {
    "1mo": 30, "3mo": 90, "6mo": 180,
    "1y": 365, "2y": 730, "5y": 1825,
  };
  const days = periodDays[period] || 365;
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // Order descending + cap range so PostgREST's default 1000-row limit
  // can't silently truncate the most-recent rows (matters for 5y ≈ 1256 rows).
  const { data, error } = await supabase
    .from("stock_prices")
    .select("date, open, high, low, close, volume")
    .eq("ticker", ticker.toUpperCase())
    .gte("date", startDate.toISOString().split("T")[0])
    .order("date", { ascending: false })
    .range(0, 2999);

  if (error) throw new Error(`DB query failed: ${error.message}`);

  // Reverse to ascending order for downstream consumers (charts, regression).
  data?.reverse();

  return (data || []).map((row) => ({
    date: row.date,
    timestamp: new Date(row.date).getTime(),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
  }));
}

export async function getFundamentalsFromDB(
  ticker: string
): Promise<StockFundamentals | null> {
  const { data, error } = await supabase
    .from("stock_fundamentals")
    .select("pe_ratio, forward_pe, market_cap, eps, sector, industry, dividend_yield, fifty_two_week_high, fifty_two_week_low")
    .eq("ticker", ticker.toUpperCase())
    .maybeSingle();

  if (error || !data) return null;

  return {
    pe_ratio: data.pe_ratio ? Number(data.pe_ratio) : null,
    forward_pe: data.forward_pe ? Number(data.forward_pe) : null,
    market_cap: data.market_cap ? Number(data.market_cap) : null,
    eps: data.eps ? Number(data.eps) : null,
    sector: data.sector,
    industry: data.industry,
    dividend_yield: data.dividend_yield ? Number(data.dividend_yield) : null,
    fifty_two_week_high: data.fifty_two_week_high ? Number(data.fifty_two_week_high) : null,
    fifty_two_week_low: data.fifty_two_week_low ? Number(data.fifty_two_week_low) : null,
  };
}
