import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Holding {
  ticker: string;
  shares: number;
}

interface IntradaySeries {
  ticker: string;
  prevClose: number | null;
  points: { t: number; c: number }[];
}

interface Props {
  holdings: Holding[];
  currentValue: number;
  width?: number;
  height?: number;
  compact?: boolean;
}

/**
 * Small intraday sparkline for the portfolio total row.
 * Fetches 5-minute close prices for every holding via the fetch-intraday
 * edge function, aligns them on a shared timeline, and renders the
 * summed portfolio value curve so far today. Shows absolute + percent
 * change vs. yesterday's close.
 */
export function PortfolioIntradaySparkline({
  holdings,
  currentValue,
  width = 120,
  height = 36,
}: Props) {
  const [series, setSeries] = useState<Record<string, IntradaySeries> | null>(null);
  const [loading, setLoading] = useState(false);

  const tickers = useMemo(
    () => Array.from(new Set(holdings.map((h) => h.ticker.toUpperCase()))),
    [holdings],
  );
  const tickersKey = tickers.join(",");

  useEffect(() => {
    if (!tickers.length) return;
    let cancelled = false;
    setLoading(true);
    supabase.functions
      .invoke("fetch-intraday", { body: { tickers } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.series) setSeries(null);
        else setSeries(data.series as Record<string, IntradaySeries>);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey]);

  const { points, baseline, latest } = useMemo(() => {
    if (!series) return { points: [] as number[], baseline: 0, latest: 0 };
    const shareMap = new Map<string, number>();
    for (const h of holdings) shareMap.set(h.ticker.toUpperCase(), h.shares);

    const lastPrice: Record<string, number> = {};
    let base = 0;
    for (const t of tickers) {
      const s = series[t];
      const prev = s?.prevClose ?? s?.points[0]?.c ?? 0;
      lastPrice[t] = prev;
      base += (shareMap.get(t) ?? 0) * prev;
    }

    // Union of timestamps across tickers, sorted ascending.
    const tsSet = new Set<number>();
    for (const t of tickers) {
      const s = series[t];
      if (!s) continue;
      for (const p of s.points) tsSet.add(p.t);
    }
    const timeline = Array.from(tsSet).sort((a, b) => a - b);

    // Per-ticker cursor into its own points array for forward walk.
    const cursor: Record<string, number> = {};
    for (const t of tickers) cursor[t] = 0;

    const totals: number[] = [];
    for (const ts of timeline) {
      for (const t of tickers) {
        const s = series[t];
        if (!s) continue;
        while (
          cursor[t] < s.points.length &&
          s.points[cursor[t]].t <= ts
        ) {
          lastPrice[t] = s.points[cursor[t]].c;
          cursor[t]++;
        }
      }
      let sum = 0;
      for (const t of tickers) sum += (shareMap.get(t) ?? 0) * lastPrice[t];
      totals.push(sum);
    }
    const last = totals.length ? totals[totals.length - 1] : currentValue;
    return { points: totals, baseline: base, latest: last };
  }, [series, holdings, tickers, currentValue]);

  const change = latest - baseline;
  const changePct = baseline > 0 ? (change / baseline) * 100 : 0;
  const positive = change >= 0;

  // Build SVG path.
  const path = useMemo(() => {
    if (points.length < 2) return "";
    const min = Math.min(...points, baseline);
    const max = Math.max(...points, baseline);
    const range = max - min || 1;
    const stepX = width / (points.length - 1);
    return points
      .map((v, i) => {
        const x = i * stepX;
        const y = height - ((v - min) / range) * height;
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [points, baseline, width, height]);

  const baselineY = useMemo(() => {
    if (!points.length) return null;
    const min = Math.min(...points, baseline);
    const max = Math.max(...points, baseline);
    const range = max - min || 1;
    return height - ((baseline - min) / range) * height;
  }, [points, baseline, height]);

  if (loading && !series) {
    return (
      <div className="flex items-center gap-3">
        <div className="h-9 w-[120px] rounded bg-muted/30 animate-pulse" />
      </div>
    );
  }
  if (!points.length) return null;

  const stroke = positive ? "hsl(var(--price-positive, 142 71% 45%))" : "hsl(var(--price-negative, 0 84% 60%))";

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-end leading-tight font-mono">
        <span className="text-sm">
          ${baseline.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
        <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
          Day open
        </span>
      </div>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
        aria-label="Intraday portfolio value"
      >
        {baselineY !== null && (
          <line
            x1={0}
            x2={width}
            y1={baselineY}
            y2={baselineY}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="2 3"
            strokeWidth={0.75}
            opacity={0.5}
          />
        )}
        <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} />
      </svg>
    </div>
  );
}

/**
 * Hook variant exposing intraday baseline + change values for callers
 * that want to render them elsewhere (e.g. under the Total cell).
 */
export function usePortfolioIntraday(holdings: Holding[]) {
  const [series, setSeries] = useState<Record<string, IntradaySeries> | null>(null);
  const tickers = useMemo(
    () => Array.from(new Set(holdings.map((h) => h.ticker.toUpperCase()))),
    [holdings],
  );
  const tickersKey = tickers.join(",");

  useEffect(() => {
    if (!tickers.length) return;
    let cancelled = false;
    supabase.functions
      .invoke("fetch-intraday", { body: { tickers } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.series) setSeries(null);
        else setSeries(data.series as Record<string, IntradaySeries>);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey]);

  return useMemo(() => {
    if (!series) {
      return {
        baseline: 0,
        latest: 0,
        change: 0,
        changePct: 0,
        ready: false,
        perHolding: {} as Record<string, { baseline: number; latest: number; change: number; changePct: number }>,
      };
    }
    const shareMap = new Map<string, number>();
    for (const h of holdings) shareMap.set(h.ticker.toUpperCase(), h.shares);
    let base = 0;
    let last = 0;
    const perHolding: Record<string, { baseline: number; latest: number; change: number; changePct: number }> = {};
    for (const t of tickers) {
      const s = series[t];
      const prev = s?.prevClose ?? s?.points[0]?.c ?? 0;
      const lastC = s?.points.length ? s.points[s.points.length - 1].c : prev;
      const shares = shareMap.get(t) ?? 0;
      const hBase = shares * prev;
      const hLast = shares * lastC;
      const hChange = hLast - hBase;
      const hChangePct = hBase > 0 ? (hChange / hBase) * 100 : 0;
      perHolding[t] = { baseline: hBase, latest: hLast, change: hChange, changePct: hChangePct };
      base += hBase;
      last += hLast;
    }
    const change = last - base;
    const changePct = base > 0 ? (change / base) * 100 : 0;
    return { baseline: base, latest: last, change, changePct, ready: true, perHolding };
  }, [series, holdings, tickers]);
}

