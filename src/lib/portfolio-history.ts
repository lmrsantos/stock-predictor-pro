import { computeStructuralLevels } from "./support-resistance";
import { analyzeTrendTermStructure } from "./trend-term-structure";

export interface HistoryHolding {
  ticker: string;
  shares: number;
  avg_cost: number;
  purchase_date: string | null;
}

export interface PortfolioHistoryPoint {
  date: string;
  value: number;
  gainLoss: number;
  gainLossPct: number;
  average?: number;
  momentum?: number;
}

/** Reconstruct today's basket only on dates with a real close for every holding. */
export function buildPortfolioHistory(
  holdings: HistoryHolding[],
  histories: Record<string, Array<{ date: string; close: number }>>,
): PortfolioHistoryPoint[] {
  if (!holdings.length || holdings.some((h) => !Number.isFinite(h.shares) || h.shares <= 0 || !Number.isFinite(h.avg_cost) || h.avg_cost <= 0)) return [];
  const cost = holdings.reduce((sum, h) => sum + h.shares * h.avg_cost, 0);
  const start = holdings.map((h) => h.purchase_date ?? "").sort().at(-1) ?? "";
  const maps = holdings.map((h) => new Map(
    (histories[h.ticker] ?? []).filter((p) => Number.isFinite(p.close) && p.close > 0).map((p) => [p.date, p.close]),
  ));
  const dates = [...(maps[0]?.keys() ?? [])].filter((date) => date >= start && maps.every((m) => m.has(date))).sort();
  const values = dates.map((date) => holdings.reduce((sum, h, i) => sum + h.shares * (maps[i].get(date) ?? 0), 0));
  return dates.map((date, i) => {
    const value = values[i];
    const gainLoss = value - cost;
    return {
      date, value, gainLoss, gainLossPct: gainLoss / cost * 100,
      average: i >= 19 ? values.slice(i - 19, i + 1).reduce((sum, v) => sum + v, 0) / 20 - cost : undefined,
      momentum: i >= 20 ? value - values[i - 20] : undefined,
    };
  });
}

export function analyzePortfolioHistory(points: PortfolioHistoryPoint[]) {
  const closes = points.map((p) => p.value);
  const levels = computeStructuralLevels({ ticker: "PORTFOLIO", closes, dates: points.map((p) => p.date) });
  const trend = analyzeTrendTermStructure(closes);
  const fit = trend.fits["1m"];
  const cost = points.length ? points[0].value - points[0].gainLoss : 0;
  return {
    levels, fit, cost,
    points: points.map((p, i) => ({
      ...p,
      fitted: fit && i >= fit.startIdx ? fit.startValue + fit.slope * (i - fit.startIdx) - cost : undefined,
    })),
  };
}