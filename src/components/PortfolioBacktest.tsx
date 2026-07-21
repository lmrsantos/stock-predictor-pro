import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { X, History, Loader2 } from "lucide-react";
import { getStockDataFromDB, fetchAndStoreStockData } from "@/lib/stock-data";
import { computeLinearRegression } from "@/lib/regression";
import type { StockDataPoint } from "@/lib/types";

interface Holding {
  id: string;
  ticker: string;
  company_name: string | null;
  shares: number;
}

interface BacktestRow {
  ticker: string;
  companyName: string;
  shares: number;
  asOfPrice: number;
  projected30d: number;
  actualPrice: number;
  asOfValue: number;
  projectedValue: number;
  actualValue: number;
  errorPct: number; // (projected - actual) / actual * 100
}

// Find the last data point on or before the as-of date.
function sliceUpTo(data: StockDataPoint[], asOfDate: string): StockDataPoint[] {
  const cutoff = new Date(asOfDate).getTime();
  return data.filter((d) => new Date(d.date).getTime() <= cutoff);
}

export function PortfolioBacktest({
  holdings,
  onClose,
  asOfDate = "2026-06-21",
}: {
  holdings: Holding[];
  onClose: () => void;
  asOfDate?: string;
}) {
  const [date, setDate] = useState(asOfDate);

  // Ensure each ticker has 1y of data cached, then read from DB.
  const queries = useQueries({
    queries: holdings.map((h) => ({
      queryKey: ["backtest-data", h.ticker],
      queryFn: async () => {
        await fetchAndStoreStockData(h.ticker, "1y").catch(() => null);
        return getStockDataFromDB(h.ticker, "1y");
      },
      staleTime: 30 * 60 * 1000,
    })),
  });

  const loading = queries.some((q) => q.isLoading);

  const rows = useMemo<BacktestRow[]>(() => {
    return holdings
      .map((h, i) => {
        const data = queries[i].data;
        if (!data || data.length < 30) return null;
        const historical = sliceUpTo(data, date);
        if (historical.length < 30) return null;
        const asOfPrice = historical[historical.length - 1].close;
        const actualPrice = data[data.length - 1].close;

        let projected30d = asOfPrice;
        try {
          const reg = computeLinearRegression(historical, 30);
          // 30 calendar days ≈ 21 trading days
          const preds = reg.predictions;
          const idx = Math.min(20, preds.length - 1);
          projected30d = preds[idx]?.predicted ?? asOfPrice;
        } catch {
          return null;
        }

        return {
          ticker: h.ticker,
          companyName: h.company_name || h.ticker,
          shares: h.shares,
          asOfPrice,
          projected30d,
          actualPrice,
          asOfValue: h.shares * asOfPrice,
          projectedValue: h.shares * projected30d,
          actualValue: h.shares * actualPrice,
          errorPct: actualPrice > 0 ? ((projected30d - actualPrice) / actualPrice) * 100 : 0,
        } as BacktestRow;
      })
      .filter(Boolean) as BacktestRow[];
  }, [holdings, queries, date]);

  const totals = useMemo(() => {
    if (!rows.length) return null;
    const asOfValue = rows.reduce((s, r) => s + r.asOfValue, 0);
    const projectedValue = rows.reduce((s, r) => s + r.projectedValue, 0);
    const actualValue = rows.reduce((s, r) => s + r.actualValue, 0);
    return {
      asOfValue,
      projectedValue,
      actualValue,
      projectedPct: asOfValue > 0 ? ((projectedValue - asOfValue) / asOfValue) * 100 : 0,
      actualPct: asOfValue > 0 ? ((actualValue - asOfValue) / asOfValue) * 100 : 0,
      errorPct: actualValue > 0 ? ((projectedValue - actualValue) / actualValue) * 100 : 0,
    };
  }, [rows]);

  const dateLabel = new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-mono font-bold">30d Projection Backtest</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-5 text-sm">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">As-of date</label>
              <input
                type="date"
                value={date}
                max={new Date().toISOString().split("T")[0]}
                onChange={(e) => setDate(e.target.value)}
                className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono input-focus"
              />
            </div>
            <p className="text-xs text-muted-foreground max-w-md">
              Runs the same Enhanced-V2 regression on price history up to <span className="font-mono">{dateLabel}</span> and compares the 30-day forecast to today's actual price.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
              <span className="text-xs text-muted-foreground">Loading historical prices…</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-xs text-muted-foreground">
              Not enough history before {dateLabel} to run the backtest.
            </div>
          ) : (
            <>
              {totals && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="stat-card">
                    <div className="text-[10px] uppercase text-muted-foreground">Value on {dateLabel}</div>
                    <div className="text-lg font-mono mt-1">${totals.asOfValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                  </div>
                  <div className="stat-card">
                    <div className="text-[10px] uppercase text-muted-foreground">Model 30d Projection</div>
                    <div className="text-lg font-mono mt-1">${totals.projectedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                    <div className={`text-[10px] ${totals.projectedPct >= 0 ? "price-positive" : "price-negative"}`}>
                      {totals.projectedPct >= 0 ? "+" : ""}{totals.projectedPct.toFixed(2)}%
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="text-[10px] uppercase text-muted-foreground">Actual Today</div>
                    <div className="text-lg font-mono mt-1">${totals.actualValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                    <div className={`text-[10px] ${totals.actualPct >= 0 ? "price-positive" : "price-negative"}`}>
                      {totals.actualPct >= 0 ? "+" : ""}{totals.actualPct.toFixed(2)}%
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="text-[10px] uppercase text-muted-foreground">Projection Error</div>
                    <div className={`text-lg font-mono mt-1 ${Math.abs(totals.errorPct) < 3 ? "price-positive" : "price-negative"}`}>
                      {totals.errorPct >= 0 ? "+" : ""}{totals.errorPct.toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-muted-foreground">Projected vs. Actual</div>
                  </div>
                </div>
              )}

              <div className="chart-surface overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left px-3 py-2 font-bold uppercase tracking-widest text-[10px]">Ticker</th>
                      <th className="text-right px-3 py-2 font-bold uppercase tracking-widest text-[10px]">Shares</th>
                      <th className="text-right px-3 py-2 font-bold uppercase tracking-widest text-[10px]">Price on {new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</th>
                      <th className="text-right px-3 py-2 font-bold uppercase tracking-widest text-[10px]">Projected 30d</th>
                      <th className="text-right px-3 py-2 font-bold uppercase tracking-widest text-[10px]">Actual Today</th>
                      <th className="text-right px-3 py-2 font-bold uppercase tracking-widest text-[10px]">Projected Value</th>
                      <th className="text-right px-3 py-2 font-bold uppercase tracking-widest text-[10px]">Actual Value</th>
                      <th className="text-right px-3 py-2 font-bold uppercase tracking-widest text-[10px]">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.ticker} className="border-b border-border/50">
                        <td className="px-3 py-2">
                          <div className="font-bold text-primary">{r.ticker}</div>
                          <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">{r.companyName}</div>
                        </td>
                        <td className="px-3 py-2 text-right">{r.shares}</td>
                        <td className="px-3 py-2 text-right">${r.asOfPrice.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">${r.projected30d.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">${r.actualPrice.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">${r.projectedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className="px-3 py-2 text-right">${r.actualValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className={`px-3 py-2 text-right ${Math.abs(r.errorPct) < 3 ? "price-positive" : "price-negative"}`}>
                          {r.errorPct >= 0 ? "+" : ""}{r.errorPct.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[10px] text-muted-foreground">
                Same Enhanced-V2 regression as the "30d Proj" column, applied to historical data available on the as-of date only. Error shows how much the model's forecast differed from what actually happened.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
