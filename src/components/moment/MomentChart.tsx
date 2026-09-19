// components/moment/MomentChart.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Annotated price chart. 52-week range as a shaded band with a marker for
// where price sits, support/resistance as horizontal BANDS (active values
// only, never projected cycle values), the fitted trend solid when measurable
// and dashed grey when not, and a 30-day expected-move cone.
// A forecast never renders without its band.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useRef, useState } from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceArea, ReferenceLine, Customized,
} from "recharts";
import type { MomentData } from "@/hooks/useMomentSymbol";
import { Button } from "@/components/ui/button";

const RANGES = [
  { key: "1M", bars: 21 },
  { key: "6M", bars: 126 },
  { key: "1Y", bars: 252 },
  { key: "5Y", bars: 1300 },
] as const;

interface MomentChartPoint {
  label: string;
  price?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  trend?: number;
  mean?: number;
  cone?: [number, number];
}

interface CompactTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: MomentChartPoint }>;
  label?: string;
  points: MomentChartPoint[];
}

function CompactTooltip({ active, payload, label, points }: CompactTooltipProps) {
  const point = payload?.find(
    (entry) => entry.payload?.price != null || entry.payload?.close != null || entry.payload?.mean != null,
  )?.payload ?? points.find((entry) => entry.label === label);
  if (!active || !point || !label) return null;

  const actual = point.price ?? point.close;
  const expected = point.mean ?? (point.cone ? (point.cone[0] + point.cone[1]) / 2 : undefined);
  const date = new Date(`${label}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-xs shadow-sm">
      <p className="whitespace-nowrap font-semibold text-popover-foreground">
        {date}{actual != null ? ` — $${actual.toFixed(2)}` : ""}
      </p>
      {expected != null && (
        <p className="whitespace-nowrap font-medium text-popover-foreground">
          Expected: ${expected.toFixed(2)}
        </p>
      )}
    </div>
  );
}

interface CandleLayerProps {
  xAxisMap?: Record<string, { scale?: ((value: string) => number) & { bandwidth?: () => number } }>;
  yAxisMap?: Record<string, { scale?: (value: number) => number }>;
}

function CandleLayer({ xAxisMap, yAxisMap, data }: CandleLayerProps & { data: MomentChartPoint[] }) {
  const xAxis = Object.values(xAxisMap ?? {})[0];
  const yAxis = Object.values(yAxisMap ?? {})[0];
  const xScale = xAxis?.scale;
  const yScale = yAxis?.scale;
  if (!xScale || !yScale) return null;

  const bandwidth = typeof xScale.bandwidth === "function" ? xScale.bandwidth() : 8;
  const bodyWidth = Math.max(1, Math.min(8, bandwidth * 0.62));
  return (
    <g aria-label="Historical candlesticks">
      {data.map((point) => {
        if (point.open == null || point.high == null || point.low == null || point.close == null) return null;
        const x = xScale(point.label) + bandwidth / 2;
        const highY = yScale(point.high);
        const lowY = yScale(point.low);
        const openY = yScale(point.open);
        const closeY = yScale(point.close);
        const rising = point.close >= point.open;
        const color = rising ? "hsl(var(--accent-success))" : "hsl(var(--accent-danger))";
        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));
        return (
          <g key={point.label}>
            <line x1={x} x2={x} y1={highY} y2={lowY} stroke={color} strokeWidth={1} />
            <rect x={x - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={rising ? "hsl(var(--card))" : color} stroke={color} strokeWidth={1} />
          </g>
        );
      })}
    </g>
  );
}

export function MomentChart({ data }: { data: MomentData }) {
  const [rangeKey, setRangeKey] = useState<string>("1Y");
  const [chartStyle, setChartStyle] = useState<"line" | "candles">("line");
  const [span, setSpan] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const touch = useRef<{ x: number; dist: number; span: number; offset: number } | null>(null);

  const baseBars = RANGES.find((r) => r.key === rangeKey)!.bars;
  const effSpan = Math.max(30, Math.min(span ?? baseBars, data.points.length));

  const fit = data.trend.fits["1y"] ?? data.trend.fits["6m"];
  const trendMeasurable = Boolean(fit?.significant);

  const chartData = useMemo(() => {
    const total = data.points.length;
    const end = Math.max(effSpan, Math.min(total, total - offset));
    const start = Math.max(0, end - effSpan);
    const slice = data.points.slice(start, end);

    // Fitted trend across its own window, interpolated for drawing only.
    const trendAt = (idx: number): number | undefined => {
      if (!fit) return undefined;
      const from = fit.startIdx;
      const to = total - 1;
      if (idx < from || to <= from) return undefined;
      const t = (idx - from) / (to - from);
      return fit.startValue + (fit.endValue - fit.startValue) * t;
    };

    const rowsByDate = new Map(data.rows.map((row) => [row.date, row]));
    const hist: MomentChartPoint[] = slice.map((p, i) => {
      const row = rowsByDate.get(p.date);
      return {
        label: p.date,
        price: p.actual as number | undefined,
        open: row?.open,
        high: row?.high,
        low: row?.low,
        close: row?.close,
        trend: trendAt(start + i),
        // Give the projection line the same continuity anchor as the terminal.
        mean: i === slice.length - 1 ? p.actual : undefined,
        cone: i === slice.length - 1
          ? [p.actual, p.actual] as [number, number]
          : undefined,
      };
    });

    const fwd: MomentChartPoint[] = data.projection.predictions.map((p) => ({
      label: p.date,
      price: undefined,
      trend: undefined,
      mean: p.predicted,
      cone: [p.lower1Sigma, p.upper1Sigma] as [number, number],
    }));

    return [...hist, ...fwd];
  }, [data, effSpan, offset, fit]);

  const hasBand = data.projection.predictions.length > 0 && data.projection.predictions.every(
    (p) => Number.isFinite(p.lower1Sigma) && Number.isFinite(p.upper1Sigma),
  );

  const { support, resistance, atr } = data.levels;
  const pad = Math.max(atr * 0.4, data.currentPrice * 0.002);

  const lows = chartData.flatMap((d) => [d.price, d.cone?.[0]]).filter((v): v is number => typeof v === "number");
  const highs = chartData.flatMap((d) => [d.price, d.cone?.[1]]).filter((v): v is number => typeof v === "number");
  const yMin = Math.min(data.week52Low, support - pad, ...lows) * 0.98;
  const yMax = Math.max(data.week52High, resistance + pad, ...highs) * 1.02;

  const pos52 =
    data.week52High > data.week52Low
      ? ((data.currentPrice - data.week52Low) / (data.week52High - data.week52Low)) * 100
      : 50;

  const dist = (t: TouchList) =>
    t.length > 1 ? Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) : 0;

  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Price</h2>
        <div className="flex items-center gap-1">
          <span className="mr-1 flex items-center rounded-md border border-border p-0.5" aria-label="Chart style">
            <Button type="button" size="sm" variant={chartStyle === "line" ? "default" : "ghost"} className="h-9 px-2 text-xs" onClick={() => setChartStyle("line")}>Line</Button>
            <Button type="button" size="sm" variant={chartStyle === "candles" ? "default" : "ghost"} className="h-9 px-2 text-xs" onClick={() => setChartStyle("candles")}>Candles</Button>
          </span>
          {RANGES.map((r) => (
            <Button
              key={r.key}
              onClick={() => { setRangeKey(r.key); setSpan(null); setOffset(0); }}
              type="button"
              size="sm"
              variant={rangeKey === r.key ? "default" : "secondary"}
              className="min-h-[44px] min-w-[44px] px-2 text-xs"
            >
              {r.key}
            </Button>
          ))}
        </div>
      </div>

      <div
        className="h-[280px] w-full touch-none"
        onTouchStart={(e) => {
          touch.current = {
            x: e.touches[0].clientX,
            dist: dist(e.touches as unknown as TouchList),
            span: effSpan,
            offset,
          };
        }}
        onTouchMove={(e) => {
          const t = touch.current;
          if (!t) return;
          if (e.touches.length > 1 && t.dist > 0) {
            const scale = dist(e.touches as unknown as TouchList) / t.dist;
            setSpan(Math.round(Math.max(30, Math.min(data.points.length, t.span / scale))));
          } else {
            const dx = e.touches[0].clientX - t.x;
            const barsPerPx = t.span / 320;
            setOffset(Math.max(0, Math.min(data.points.length - 30, Math.round(t.offset + dx * barsPerPx))));
          }
        }}
        onTouchEnd={() => { touch.current = null; }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 54, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="label"
              tickFormatter={(date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              tick={{ fontSize: 12 }}
              minTickGap={28}
              stroke="hsl(var(--muted-foreground))"
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 12 }}
              width={46}
              stroke="hsl(var(--muted-foreground))"
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            />
            <Tooltip
              content={<CompactTooltip points={chartData} />}
              position={{ y: 4 }}
              cursor={{ stroke: "hsl(var(--foreground))", strokeOpacity: 0.55, strokeWidth: 1 }}
              allowEscapeViewBox={{ x: false, y: false }}
            />

            {/* 52-week range */}
            <ReferenceArea y1={data.week52Low} y2={data.week52High} fill="hsl(var(--muted))" fillOpacity={0.35} />
            {/* Support / resistance bands */}
            <ReferenceArea y1={support - pad} y2={support + pad} fill="hsl(var(--primary))" fillOpacity={0.18} />
            <ReferenceArea y1={resistance - pad} y2={resistance + pad} fill="hsl(var(--destructive))" fillOpacity={0.15} />
            <ReferenceLine
              y={data.currentPrice}
              stroke="hsl(var(--foreground))"
              strokeDasharray="4 3"
              label={{ value: `${pos52.toFixed(0)}% of 52w range`, position: "insideTopRight", fontSize: 12, fill: "hsl(var(--foreground))" }}
            />

            {hasBand && (
              <Area dataKey="cone" stroke="none" fill="hsl(var(--chart-forecast))" fillOpacity={0.24} isAnimationActive={false} />
            )}
            {hasBand && (
              <Line dataKey="mean" stroke="hsl(var(--chart-forecast))" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            )}
            {chartStyle === "line" ? (
              <Line dataKey="price" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} isAnimationActive={false} />
            ) : (
              <Customized component={(props: CandleLayerProps) => <CandleLayer {...props} data={chartData} />} />
            )}
            <Line
              dataKey="trend"
              stroke={trendMeasurable ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
              strokeWidth={1.5}
              strokeDasharray={trendMeasurable ? undefined : "6 4"}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
        <li>{chartStyle === "candles" ? "Green candles closed above their open · red candles closed below" : "Line = actual closing price"}</li>
        <li>Shaded grey = 52-week range · price sits at {pos52.toFixed(0)}% of it</li>
        <li>Blue band = support zone · red band = resistance zone</li>
        <li>{trendMeasurable ? "Solid line = fitted trend" : "Dashed grey line = no measurable trend"}</li>
        <li>Shaded cone = where price usually travels over the next 30 days</li>
        <li>Pinch to zoom, drag to pan. As of {data.asOfDate}</li>
      </ul>
    </section>
  );
}
