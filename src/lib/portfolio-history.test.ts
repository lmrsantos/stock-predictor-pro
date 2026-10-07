import { describe, expect, it } from "vitest";
import { buildPortfolioHistory, analyzePortfolioHistory } from "./portfolio-history";

describe("portfolio history", () => {
  const holdings = [{ ticker: "A", shares: 2, avg_cost: 10, purchase_date: null }, { ticker: "B", shares: 1, avg_cost: 20, purchase_date: null }];
  it("weights actual closes by shares and excludes dates missing any holding", () => {
    const points = buildPortfolioHistory(holdings, { A: [{ date: "2026-10-01", close: 12 }, { date: "2026-10-02", close: 13 }], B: [{ date: "2026-10-01", close: 22 }] });
    expect(points).toEqual([{ date: "2026-10-01", value: 46, gainLoss: 6, gainLossPct: 15, average: undefined, momentum: undefined }]);
  });
  it("does not reconstruct before the last known purchase", () => {
    expect(buildPortfolioHistory([{ ...holdings[0], purchase_date: "2026-10-02" }], { A: [{ date: "2026-10-01", close: 12 }] })).toEqual([]);
  });
  it("handles losses without feeding negative gain/loss values into price analysis", () => {
    const prices = Array.from({ length: 45 }, (_, i) => ({ date: new Date(Date.UTC(2026, 7, i + 1)).toISOString().slice(0, 10), close: 8 - i * 0.02 }));
    const points = buildPortfolioHistory([holdings[0]], { A: prices });
    expect(points.at(-1)?.momentum).toBeCloseTo(-0.8);
    expect(points.at(-1)?.gainLoss).toBeLessThan(0);
    const result = analyzePortfolioHistory(points);
    expect(result.levels?.support).toBeGreaterThan(0);
    expect(result.points.at(-1)?.fitted).toBeLessThan(0);
  });
  it("withholds partial baskets and invalid quantities", () => {
    expect(buildPortfolioHistory(holdings, { A: [{ date: "2026-10-01", close: 12 }] })).toEqual([]);
    expect(buildPortfolioHistory([{ ...holdings[0], shares: NaN }], {})).toEqual([]);
  });
});