// src/lib/sector-backtest.ts
// ─────────────────────────────────────────────────────────────────────────────
// Run the calibration-by-hindsight backtest across every ticker in a sector.
// Fetches universe + prices from the `sector-backtest` edge function, then
// runs the existing `backtest()` model client-side for each ticker.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { backtest, BacktestDataPoint, ForecastResult } from "@/lib/backtest";

export interface SectorBacktestRow {
  ticker: string;
  currentPrice: number;
  winnerWindow: number;
  winnerLabel: string;
  annualizedReturn: number;     // decimal (e.g. 0.18 = 18%)
  predictedTodayErrorPct: number;
  rSquared: number;
  forecastPct: number;          // % change over forecast horizon
  forecastDirection: "up" | "down";
  confidenceScore: number;      // 0-100
  ensembleAgreement: number;    // 0-1
  regimeWarning: string | null;
  error?: string;               // populated if backtest threw
}

export interface SectorBacktestResponse {
  sector: string;
  source: "curated" | "yahoo";
  universe: string[];
  failed: string[];
  fetched: number;
  prices: Record<string, { dates: string[]; closes: number[] }>;
}

export interface SectorBacktestProgress {
  done: number;
  total: number;
  currentTicker: string;
}

export const CURATED_SECTORS = [
  "Semiconductors",
  "Software",
  "Mega-cap Tech",
  "Banks",
  "Biotech & Pharma",
  "Energy",
  "Consumer Staples",
  "Consumer Discretionary",
  "Industrials & Defense",
  "Utilities",
  "Real Estate",
  "Quantum Computing",
  "Aerospace & Space",
] as const;

export const YAHOO_SECTORS = [
  "Semiconductors",
  "Software",
  "Banks",
  "Biotech & Pharma",
] as const;

export async function fetchSectorUniverse(
  sector: string,
  source: "curated" | "yahoo" = "curated",
  maxTickers = 40,
): Promise<SectorBacktestResponse> {
  const { data, error } = await supabase.functions.invoke("sector-backtest", {
    body: { sector, source, maxTickers },
  });
  if (error) throw new Error(error.message || "Failed to fetch sector universe");
  if (data?.error) throw new Error(data.error);
  return data as SectorBacktestResponse;
}

function toBacktestPoints(series: { dates: string[]; closes: number[] }): BacktestDataPoint[] {
  const out: BacktestDataPoint[] = [];
  for (let i = 0; i < series.dates.length; i++) {
    const close = series.closes[i];
    if (close == null) continue;
    out.push({
      date: series.dates[i],
      timestamp: new Date(series.dates[i]).getTime(),
      actual: close,
    });
  }
  return out;
}

function rowFromResult(ticker: string, result: ForecastResult): SectorBacktestRow {
  return {
    ticker,
    currentPrice: result.currentPrice,
    winnerWindow: result.winningModel.windowSize,
    winnerLabel: result.winningModel.label,
    annualizedReturn: result.winningModel.annualizedReturn,
    predictedTodayErrorPct: result.winningModel.errorPct,
    rSquared: result.winningModel.rSquared,
    forecastPct: result.forecastPct,
    forecastDirection: result.forecastDirection,
    confidenceScore: result.confidenceScore,
    ensembleAgreement: result.ensembleAgreement,
    regimeWarning: result.regime.warning,
  };
}

export async function runSectorBacktest(
  sector: string,
  source: "curated" | "yahoo" = "curated",
  options: {
    maxTickers?: number;
    forecastDays?: number;
    onProgress?: (p: SectorBacktestProgress) => void;
  } = {},
): Promise<{
  rows: SectorBacktestRow[];
  failed: string[];
  universe: string[];
  source: "curated" | "yahoo";
  sector: string;
}> {
  const { maxTickers = 40, forecastDays = 30, onProgress } = options;
  const data = await fetchSectorUniverse(sector, source, maxTickers);

  const tickers = Object.keys(data.prices);
  const rows: SectorBacktestRow[] = [];
  const failed = [...data.failed];

  for (let i = 0; i < tickers.length; i++) {
    const t = tickers[i];
    onProgress?.({ done: i, total: tickers.length, currentTicker: t });
    try {
      const points = toBacktestPoints(data.prices[t]);
      if (points.length < 60) { failed.push(t); continue; }
      const result = backtest(points, 6, forecastDays);
      rows.push(rowFromResult(t, result));
    } catch (e) {
      console.warn(`backtest failed for ${t}`, e);
      failed.push(t);
    }
    // yield to UI between heavy iterations
    if (i % 4 === 3) await new Promise(r => setTimeout(r, 0));
  }
  onProgress?.({ done: tickers.length, total: tickers.length, currentTicker: "" });

  // Default sort: confidence desc, then forecastPct desc
  rows.sort((a, b) => b.confidenceScore - a.confidenceScore || b.forecastPct - a.forecastPct);

  return {
    rows,
    failed,
    universe: data.universe,
    source: data.source,
    sector: data.sector,
  };
}
