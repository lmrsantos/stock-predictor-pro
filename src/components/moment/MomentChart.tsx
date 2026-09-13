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
  CartesianGrid, ReferenceArea, ReferenceLine,
} from "recharts";
import type { MomentData } from "@/hooks/useMomentSymbol";

const RANGES = [
  { key: "1M", bars: 21 },
  { key: "6M", bars: 126 },
  { key: "1Y", bars: 252 },
  { key: "5Y", bars: 1300 },
] as const;

export function MomentChart({ data }: { data: MomentData }) {
  const [rangeKey, setRangeKey] = useState<string>("1Y");
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

    const hist = slice.map((p, i) => ({
      label: p.date,
      price: p.actual as number | undefined,
      trend: trendAt(start + i),
      mean: undefined as number | undefined,
      cone: undefined as [number, number] | undefined,
    }));

    const fwd = data.forecast.forecastPoints.map((p) => ({
      label: p.date,
      price: undefined,
      trend: undefined,
      mean: p.mean,
      cone: [p.lower1, p.upper1] as [number, number],
    }));

    return [...hist, ...fwd];
  }, [data, effSpan, offset, fit]);

  const hasBand = data.forecast.forecastPoints.every(
    (p) => Number.isFinite(p.lower1) && Number.isFinite(p.upper1),
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
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Price</h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => { setRangeKey(r.key); setSpan(null); setOffset(0); }}
              className={`min-h-[44px] min-w-[44px] rounded-md px-2 text-xs font-medium ${
                rangeKey === r.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {r.key}
            </button>
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
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="label"
              tickFormatter={(date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              tick={{ fontSize: 10 }}
              minTickGap={28}
              stroke="hsl(var(--muted-foreground))"
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 10 }}
              width={46}
              stroke="hsl(var(--muted-foreground))"
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: number, name: string) => [
                `$${Number(v).toFixed(2)}`,
                name === "price" ? "Actual close" : name === "mean" ? "Model path" : "Expected range",
              ]}
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
              label={{ value: `${pos52.toFixed(0)}% of 52w range`, position: "insideTopRight", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />

            {hasBand && (
              <Area dataKey="cone" stroke="none" fill="hsl(var(--primary))" fillOpacity={0.18} isAnimationActive={false} />
            )}
            {hasBand && (
              <Line dataKey="mean" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
            )}
            <Line dataKey="price" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} isAnimationActive={false} />
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
        <li>Shaded grey = 52-week range · price sits at {pos52.toFixed(0)}% of it</li>
        <li>Blue band = support zone · red band = resistance zone</li>
        <li>{trendMeasurable ? "Solid line = fitted trend" : "Dashed grey line = no measurable trend"}</li>
        <li>Shaded cone = where price usually travels over the next 30 days</li>
        <li>Pinch to zoom, drag to pan. As of {data.asOfDate}</li>
      </ul>
    </section>
  );
}
