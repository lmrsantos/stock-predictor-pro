// components/SymbolDetailModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Per-symbol detail view: forecast (with its 1σ band), rolling-window
// validation detail, cross-sector linkages this symbol's sector follows,
// magnitude signal, and accuracy horizon.
//
// Rules enforced here:
//   • A point forecast never renders without its 1σ band.
//   • No trade decision language ("BUY"/"SELL") anywhere.
//   • When directionHitRate <= 0.55 no directional claim is displayed.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { X, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { backtest, type ForecastResult, type BacktestDataPoint } from "@/lib/backtest";
import { fetchAndStoreStockData, getStockDataFromDB } from "@/lib/stock-data";
import { readCachedLinkages } from "@/lib/run-linkages";

interface SymbolDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  companyName?: string;
  sector?: string;
}

const fmtPrice = (v: number) =>
  `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const signed = (v: number, digits = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(digits)}`;

/** A point forecast is only ever shown together with its 1σ band. */
function forecastWithBand(pct: number, band: number) {
  return `${signed(pct)}% over 30d (1σ range ${(pct - band).toFixed(0)}% to ${signed(pct + band, 0)}%)`;
}

export function SymbolDetailModal({
  isOpen, onClose, symbol, companyName, sector,
}: SymbolDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [result, setResult]   = useState<ForecastResult | null>(null);
  const [points, setPoints]   = useState<BacktestDataPoint[]>([]);
  const [showValidation, setShowValidation] = useState(false);

  useEffect(() => {
    if (!isOpen || !symbol) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);
    setShowValidation(false);

    (async () => {
      try {
        await fetchAndStoreStockData(symbol, "2y");
        let rows = await getStockDataFromDB(symbol, "2y");
        if (!rows || rows.length < 60) {
          await fetchAndStoreStockData(symbol, "1y");
          rows = await getStockDataFromDB(symbol, "1y");
        }
        if (!rows || rows.length < 60) {
          throw new Error(`Only ${rows?.length ?? 0} price points available. Need at least 60.`);
        }
        const pts: BacktestDataPoint[] = rows.map((d: { date: string; timestamp: number; close: number }) => ({
          date: d.date, timestamp: d.timestamp, actual: d.close,
        }));
        const res = backtest(pts, 6, 30);
        if (cancelled) return;
        setPoints(pts);
        setResult(res);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, symbol]);

  const dayChangePct = useMemo(() => {
    if (points.length < 2) return null;
    const a = points[points.length - 2].actual;
    const b = points[points.length - 1].actual;
    return a > 0 ? ((b - a) / a) * 100 : null;
  }, [points]);

  const chartData = useMemo(() => {
    if (!result) return [];
    const hist = result.actualPath.map(p => ({
      date: new Date(p.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      actual: p.actual as number | undefined,
      mean: undefined as number | undefined,
      band: undefined as [number, number] | undefined,
    }));
    const fwd = result.forecastPoints.map(p => ({
      date: new Date(p.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      actual: undefined,
      mean: p.mean,
      band: [p.lower1, p.upper1] as [number, number],
    }));
    return [...hist, ...fwd];
  }, [result]);

  /** Validated linkages where this symbol's sector is the follower. */
  const followedBy = useMemo(() => {
    if (!sector) return [];
    const cache = readCachedLinkages();
    if (!cache?.results?.length) return [];
    return cache.results.filter(r => r.validated && r.follower === sector);
  }, [sector]);

  const v            = result?.validation;
  const band         = result?.magnitudeSignal.expectedMovePct ?? 0;
  const dirHits      = v ? Math.round(v.directionHitRate * v.windowCount) : 0;
  const dirReliable  = (v?.directionHitRate ?? 0) > 0.55;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl p-0 bg-background border-border overflow-hidden">
        <div className="max-h-[85vh] overflow-y-auto">

          {/* 1 — HEADER */}
          <div className="flex items-start justify-between gap-4 p-5 border-b border-border bg-card/40 sticky top-0 z-10 backdrop-blur">
            <div className="min-w-0">
              <div className="flex items-baseline gap-3 flex-wrap">
                <h2 className="text-xl font-mono font-bold text-foreground">{symbol}</h2>
                {companyName && (
                  <span className="text-xs text-muted-foreground truncate">{companyName}</span>
                )}
                {sector && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                    {sector}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-lg font-mono font-semibold text-foreground">
                  {result ? fmtPrice(result.currentPrice) : "—"}
                </span>
                {dayChangePct != null && (
                  <span className={`text-xs font-mono ${dayChangePct >= 0 ? "price-positive" : "price-negative"}`}>
                    {signed(dayChangePct, 2)}% 1d
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-xs font-mono text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading prices and running validation…
            </div>
          )}

          {error && !loading && (
            <div className="m-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs font-mono text-destructive">
              {error}
            </div>
          )}

          {result && v && !loading && (
            <div className="p-5 flex flex-col gap-5">

              {/* 2 — FORECAST */}
              <section className="rounded-xl border border-border bg-card/40 p-4">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
                  Forecast
                </p>

                {result.regime.warning && (
                  <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] font-mono text-amber-500">
                    {result.regime.warning}
                  </div>
                )}

                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" minTickGap={24} />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
                        domain={["auto", "auto"]} tickFormatter={(v2: number) => `$${v2.toFixed(0)}`} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8, fontSize: 11,
                        }} />
                      <ReferenceLine y={result.currentPrice} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                      <Area type="monotone" dataKey="band" stroke="none" fill="hsl(var(--primary))" fillOpacity={0.14} name="1σ band" />
                      <Line type="monotone" dataKey="actual" stroke="hsl(var(--foreground))" dot={false} strokeWidth={1.5} name="Actual" />
                      <Line type="monotone" dataKey="mean" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} strokeDasharray="5 4" name="Forecast" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-3 space-y-1 text-[11px] font-mono">
                  {dirReliable ? (
                    <p className={result.forecastPct >= 0 ? "price-positive" : "price-negative"}>
                      {forecastWithBand(result.forecastPct, band)}
                    </p>
                  ) : (
                    <p className="text-amber-500">
                      Direction not reliable ({dirHits} of {v.windowCount} windows). Expected move ±{band.toFixed(1)}%.
                    </p>
                  )}
                  <p className="text-muted-foreground">Model fit {result.confidenceScore}/100</p>
                  <p className="text-muted-foreground">
                    {v.decisive
                      ? `Direction correct in ${dirHits} of ${v.windowCount} rolling windows`
                      : "Ensemble mean — no single model validated"}
                  </p>
                </div>
              </section>

              {/* 3 — VALIDATION DETAIL */}
              <section className="rounded-xl border border-border bg-card/40">
                <button
                  onClick={() => setShowValidation(s => !s)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left">
                  {showValidation ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    Validation detail
                  </span>
                </button>
                {showValidation && (
                  <div className="px-4 pb-4 space-y-3">
                    <p className="text-[11px] font-mono text-muted-foreground leading-relaxed">{v.message}</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] font-mono">
                        <thead>
                          <tr className="text-muted-foreground text-left">
                            <th className="py-1.5 pr-3 font-normal">Model</th>
                            <th className="py-1.5 pr-3 font-normal">Median path error</th>
                            <th className="py-1.5 pr-3 font-normal">Win rate</th>
                            <th className="py-1.5 font-normal">Direction hit rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {v.table.map(row => (
                            <tr key={row.label} className="border-t border-border/60">
                              <td className="py-1.5 pr-3 text-foreground">{row.label}</td>
                              <td className="py-1.5 pr-3">{row.medianPathMape.toFixed(1)}%</td>
                              <td className="py-1.5 pr-3">{Math.round(row.winRate * 100)}%</td>
                              <td className="py-1.5">{Math.round(row.directionHitRate * 100)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>

              {/* 4 — WHAT THIS STOCK'S SECTOR IS FOLLOWING */}
              <section className="rounded-xl border border-border bg-card/40 p-4">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  What this stock's sector is following
                </p>
                {followedBy.length === 0 ? (
                  <p className="text-[11px] font-mono text-muted-foreground">
                    No validated cross-sector linkages for this sector yet.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {followedBy.map(l => (
                      <li key={`${l.leader}-${l.bestLag}`} className="text-[11px] font-mono text-foreground">
                        <span className="text-primary">{String(l.leader)}</span>
                        {" leads by "}{l.bestLag} day{l.bestLag === 1 ? "" : "s"}
                        {" · "}
                        <span className={l.sign > 0 ? "price-positive" : "price-negative"}>
                          {l.sign > 0 ? "same direction" : "opposite direction"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* 5 — MAGNITUDE SIGNAL */}
              <section className="rounded-xl border border-border bg-card/40 p-4">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  Magnitude signal
                </p>
                <p className="text-[11px] font-mono text-foreground leading-relaxed">
                  {result.magnitudeSignal.message}
                </p>
                <p className="text-[11px] font-mono text-muted-foreground mt-1">
                  Compression ratio {result.magnitudeSignal.compressionRatio.toFixed(2)}×
                </p>
              </section>

              {/* 6 — ACCURACY HORIZON */}
              <section>
                <p className="text-[11px] font-mono text-muted-foreground leading-relaxed">
                  {result.accuracyHorizon.message}
                </p>
              </section>

              {/* 7 — DISCLAIMER */}
              <p className="text-[10px] font-mono text-muted-foreground leading-relaxed border-t border-border pt-3">
                Model output is statistical, not advice. Direction at these horizons is weakly
                predictable at best. Position sizing matters more than any single signal here.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
