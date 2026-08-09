import { useMemo, useState, useSyncExternalStore } from "react";
import {
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from "recharts";
import { ChartDataPoint } from "@/lib/types";
import { formatPrice } from "@/lib/regression";
import { analyzeCycles } from "@/lib/cycle-analysis";
import { InfoTooltip, metricInfo } from "./InfoTooltip";

interface RegressionChartProps {
  data: ChartDataPoint[];
  isLoading: boolean;
  slopePositive: boolean;
  /** 1-day view: x-axis shows intraday times instead of dates */
  intraday?: boolean;
}


interface StackedPoint {
  date: string;
  actual?: number;
  predicted?: number;
  fitted?: number;
  isForecast: boolean;
  volume?: number;
  volumeUp?: boolean;
  volUp?: number;
  volDown?: number;
  // Stacked band fields
  base2: number;       // lower2Sigma (invisible base)
  band2Lower: number;  // lower2Sigma → lower1Sigma
  band1: number;       // lower1Sigma → upper1Sigma
  band2Upper: number;  // upper1Sigma → upper2Sigma
  // Original for tooltip
  upper1Sigma: number;
  lower1Sigma: number;
  upper2Sigma: number;
  lower2Sigma: number;
}

interface StructureMarker {
  date: string;
  price: number;
  type: "peak" | "trough";
  label: "HH" | "LH" | "HL" | "LL" | "EH" | "EL" | "P" | "T";
  pct?: number;
  provisional?: boolean;
}

function formatVolume(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return `${Math.round(v)}`;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload as StackedPoint;
  if (!point) return null;

  const dateStr = new Date(point.date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs space-y-1.5">
      <div className="text-muted-foreground font-mono">{dateStr}</div>
      {point.actual != null && (
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Actual</span>
          <span className="font-mono font-bold">${formatPrice(point.actual)}</span>
        </div>
      )}
      {point.predicted != null && (
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Predicted</span>
          <span className="font-mono font-bold text-primary">${formatPrice(point.predicted)}</span>
        </div>
      )}
      {point.fitted != null && !point.isForecast && (
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Regression</span>
          <span className="font-mono text-primary">${formatPrice(point.fitted)}</span>
        </div>
      )}
      {point.volume != null && point.volume > 0 && (
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Volume</span>
          <span className={`font-mono ${point.volumeUp ? "text-emerald-500" : "text-red-500"}`}>
            {formatVolume(point.volume)}
          </span>
        </div>
      )}
      <div className="border-t border-border pt-1.5 mt-1.5">
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">68% Range</span>
          <span className="font-mono">
            ${formatPrice(point.lower1Sigma)} – ${formatPrice(point.upper1Sigma)}
          </span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">95% Range</span>
          <span className="font-mono">
            ${formatPrice(point.lower2Sigma)} – ${formatPrice(point.upper2Sigma)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function RegressionChart({ data, isLoading, slopePositive }: RegressionChartProps) {
  const [showVolume, setShowVolume] = useState(true);
  const [showStructure, setShowStructure] = useState(true);
  // Zigzag sensitivity: minimum % reversal required to register a swing pivot
  const [sensitivity, setSensitivity] = useState(0.08);

  const isDark = useSyncExternalStore(
    (cb) => {
      const observer = new MutationObserver(cb);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains("dark")
  );

  // Transform data into stacked format for proper band rendering
  const stackedData = useMemo(() => {
    return data.map((d): StackedPoint => {
      const l2 = d.lower2Sigma ?? 0;
      const l1 = d.lower1Sigma ?? 0;
      const u1 = d.upper1Sigma ?? 0;
      const u2 = d.upper2Sigma ?? 0;
      return {
        date: d.date,
        actual: d.actual,
        predicted: d.predicted,
        fitted: d.fitted,
        isForecast: d.isForecast,
        volume: d.volume,
        volumeUp: d.volumeUp,
        volUp: d.volumeUp ? d.volume : undefined,
        volDown: d.volumeUp === false ? d.volume : undefined,
        base2: l2,
        band2Lower: l1 - l2,
        band1: u1 - l1,
        band2Upper: u2 - u1,
        upper1Sigma: u1,
        lower1Sigma: l1,
        upper2Sigma: u2,
        lower2Sigma: l2,
      };
    });
  }, [data]);

  const maxVolume = useMemo(
    () => Math.max(0, ...data.map((d) => d.volume ?? 0)),
    [data]
  );
  const hasVolume = maxVolume > 0;

  // Explicit price domain so the volume pane never squashes the price panel
  const priceDomain = useMemo<[number, number]>(() => {
    const vals: number[] = [];
    data.forEach((d) => {
      if (d.actual != null && d.actual > 0) vals.push(d.actual);
      if (d.predicted != null && d.predicted > 0) vals.push(d.predicted);
    });
    if (!vals.length) return [0, 1];
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo) * 0.06 || hi * 0.02;
    // Reserve the bottom ~22% of the price panel for the volume histogram
    const span = hi + pad - (lo - pad);
    const lower = lo - pad - span * 0.22;
    return [Math.round(Math.max(0, lower)), Math.round(hi + pad)];
  }, [data]);


  // ── Market-structure pivots: higher/lower highs and lows ──────────────────
  // Rules:
  //  • a pivot is compared to the PREVIOUS pivot OF THE SAME TYPE
  //  • moves inside a ±1% deadband are "equal" highs/lows (EH/EL), not HH/LL
  //  • the final zigzag pivot is still unconfirmed (price can extend it), so it
  //    is drawn faded with a "?" and excluded from the trend read
  const { markers, structureSummary } = useMemo(() => {
    const hist = data.filter((d) => !d.isForecast && d.actual != null);
    if (hist.length < 30) return { markers: [] as StructureMarker[], structureSummary: null as string | null };
    const DEADBAND = 1; // percent
    let pivots: StructureMarker[] = [];
    try {
      const res = analyzeCycles(
        "chart",
        hist.map((d) => d.actual as number),
        hist.map((d) => d.date),
        sensitivity
      );
      const ordered = [...res.peaks, ...res.troughs].sort((a, b) => a.index - b.index);
      pivots = ordered.map((p, i) => {
        const pct = p.pctFromPrev;
        let label: StructureMarker["label"];
        if (pct == null || Math.abs(pct) < DEADBAND) {
          label = p.type === "peak" ? "EH" : "EL";
          if (pct == null) label = p.type === "peak" ? "P" : "T";
        } else if (p.type === "peak") {
          label = pct > 0 ? "HH" : "LH";
        } else {
          label = pct > 0 ? "HL" : "LL";
        }
        return {
          date: p.date,
          price: p.price,
          type: p.type,
          label,
          pct,
          provisional: i === ordered.length - 1,
        };
      });
    } catch {
      return { markers: [] as StructureMarker[], structureSummary: null };
    }

    // Trend read uses confirmed pivots only
    const confirmed = pivots.filter((p) => !p.provisional);
    const lastLowPivot = confirmed.filter((p) => p.type === "trough").at(-1);
    const lastHighPivot = confirmed.filter((p) => p.type === "peak").at(-1);
    const lowLabel = lastLowPivot?.label;
    const highLabel = lastHighPivot?.label;
    let summary: string | null = null;
    if (lowLabel && highLabel) {
      if (lowLabel === "HL" && highLabel === "HH") summary = "Uptrend intact — higher highs and higher lows";
      else if (lowLabel === "LL" && highLabel === "LH") summary = "Downtrend — lower highs and lower lows";
      else if (lowLabel === "HL" && highLabel === "LH") summary = "Compression — higher lows into lower highs (coiling)";
      else if (lowLabel === "LL" && highLabel === "HH") summary = "Expanding range — wider swings, no clear structure";
      else summary = "Sideways — latest swing high/low roughly equal to the prior one";
      if (lastLowPivot) summary += ` · watch ${lastLowPivot.price.toFixed(2)} as the pivot low`;
      const provisional = pivots.at(-1);
      if (provisional) {
        summary += ` · latest ${provisional.type === "peak" ? "high" : "low"} still unconfirmed`;
      }
    }
    return { markers: pivots, structureSummary: summary };
  }, [data, sensitivity]);



  if (isLoading) {
    return (
      <div className="flex-1 chart-surface flex items-center justify-center min-h-[240px]">
        <div className="space-y-3 text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-xs font-mono">Loading market data…</p>
        </div>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="flex-1 chart-surface flex items-center justify-center min-h-[240px]">
        <p className="text-muted-foreground text-sm">Enter a ticker to begin analysis</p>
      </div>
    );
  }

  const forecastStartIndex = data.findIndex((d) => d.isForecast);

  const firstYear = new Date(data[0]?.date).getFullYear();
  const lastYear = new Date(data[data.length - 1]?.date).getFullYear();
  const spanMultipleYears = firstYear !== lastYear;

  const formatDate = (date: string) => {
    const d = new Date(date);
    if (spanMultipleYears) {
      return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const regressionColor = slopePositive
    ? "hsl(150, 70%, 40%)"
    : "hsl(0, 75%, 55%)";

  const band1Fill = isDark ? "hsl(0, 0%, 50%)" : "hsl(0, 0%, 60%)";
  const band2Fill = isDark ? "hsl(0, 0%, 38%)" : "hsl(0, 0%, 78%)";
  const gridColor = isDark ? "hsl(0, 0%, 20%)" : "hsl(0, 0%, 88%)";
  const tickColor = isDark ? "hsl(0, 0%, 55%)" : "hsl(0, 0%, 45%)";
  const priceLineColor = isDark ? "hsl(0, 0%, 88%)" : "hsl(265, 60%, 40%)";
  const refLineColor = isDark ? "hsl(0, 0%, 35%)" : "hsl(0, 0%, 75%)";

  return (
    <div className="flex-1 chart-surface min-h-[240px] p-3 lg:p-4">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 inline-block rounded" style={{ background: priceLineColor }} />
          Price
          <InfoTooltip {...metricInfo.price} />
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 inline-block rounded" style={{ background: regressionColor }} />
          Regression
          <InfoTooltip {...metricInfo.regressionLine} />
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 inline-block rounded" style={{ background: band1Fill, opacity: 0.35 }} />
          1σ Band
          <InfoTooltip {...metricInfo.oneSigmaBand} />
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 inline-block rounded" style={{ background: band2Fill, opacity: 0.25 }} />
          2σ Band
          <InfoTooltip {...metricInfo.twoSigmaBand} />
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 inline-block rounded border-t border-dashed border-muted-foreground" />
          Forecast
          <InfoTooltip {...metricInfo.forecast} />
        </span>

        <span className="flex items-center gap-2 ml-auto normal-case tracking-normal">
          {hasVolume && (
            <button
              onClick={() => setShowVolume((v) => !v)}
              className={`px-2 py-0.5 rounded-md font-mono text-[10px] transition-colors ${
                showVolume ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              Volume
            </button>
          )}
          <button
            onClick={() => setShowStructure((v) => !v)}
            className={`px-2 py-0.5 rounded-md font-mono text-[10px] transition-colors ${
              showStructure ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            Structure HH/HL
          </button>
          {showStructure && (
            <span className="flex items-center gap-1 rounded-md border border-border overflow-hidden">
              {([
                { v: 0.04, l: "Fine", t: "4% reversal — labels intermediate swings" },
                { v: 0.08, l: "Med", t: "8% reversal — balanced (default)" },
                { v: 0.12, l: "Major", t: "12% reversal — only major structural swings" },
              ] as const).map((o) => (
                <button
                  key={o.v}
                  title={o.t}
                  onClick={() => setSensitivity(o.v)}
                  className={`px-2 py-0.5 font-mono text-[10px] transition-colors ${
                    sensitivity === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </span>
          )}
        </span>
      </div>

      {showStructure && structureSummary && (
        <div className="-mt-2 mb-3 text-[11px] text-muted-foreground">
          <span className="font-mono">{structureSummary}</span>
          <span className="ml-2 opacity-70">
            HH = higher high · HL = higher low · LH = lower high · LL = lower low · EH/EL = equal (±1%) · "?" = unconfirmed
          </span>
        </div>
      )}


      <ResponsiveContainer width="100%" height="90%">
        <ComposedChart data={stackedData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
          <CartesianGrid
            stroke={gridColor}
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fill: tickColor, fontSize: 11 }}
            axisLine={{ stroke: gridColor }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={60}
          />
          <YAxis
            domain={hasVolume && showVolume ? priceDomain : ["auto", "auto"]}
            allowDataOverflow={hasVolume && showVolume}
            tick={{ fill: tickColor, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            width={60}
          />
          {hasVolume && showVolume && (
            <YAxis
              yAxisId="vol"
              orientation="right"
              domain={[0, maxVolume / 0.17]}
              hide
            />
          )}
          <Tooltip content={<CustomTooltip />} />

          {/* Volume bars pinned to the bottom quarter of the plot */}
          {hasVolume && showVolume && (
            <Bar
              yAxisId="vol"
              dataKey="volUp"
              stackId="vol"
              fill="hsl(150, 65%, 45%)"
              fillOpacity={0.45}
              isAnimationActive={false}
            />
          )}
          {hasVolume && showVolume && (
            <Bar
              yAxisId="vol"
              dataKey="volDown"
              stackId="vol"
              fill="hsl(0, 72%, 55%)"
              fillOpacity={0.45}
              isAnimationActive={false}
            />
          )}


          {/* Stacked bands: base2 (invisible) → band2Lower → band1 → band2Upper */}
          <Area
            dataKey="base2"
            stackId="bands"
            stroke="none"
            fill="transparent"
            type="linear"
            isAnimationActive={false}
          />
          <Area
            dataKey="band2Lower"
            stackId="bands"
            stroke="none"
            fill={band2Fill}
            fillOpacity={0.2}
            type="linear"
            isAnimationActive={false}
          />
          <Area
            dataKey="band1"
            stackId="bands"
            stroke="none"
            fill={band1Fill}
            fillOpacity={0.25}
            type="linear"
            isAnimationActive={false}
          />
          <Area
            dataKey="band2Upper"
            stackId="bands"
            stroke="none"
            fill={band2Fill}
            fillOpacity={0.2}
            type="linear"
            isAnimationActive={false}
          />

          {/* Regression / Forecast line */}
          <Line
            dataKey="fitted"
            stroke={regressionColor}
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={false}
            type="linear"
            isAnimationActive={false}
          />

          {/* Actual price */}
          <Line
            dataKey="actual"
            stroke={priceLineColor}
            strokeWidth={1.5}
            dot={false}
            type="linear"
            isAnimationActive={false}
            connectNulls={false}
          />

          {/* Predicted price (forecast zone) */}
          <Line
            dataKey="predicted"
            stroke="hsl(265, 80%, 58%)"
            strokeWidth={2}
            dot={false}
            type="linear"
            isAnimationActive={false}
            connectNulls={false}
          />

          {/* Forecast boundary */}
          {forecastStartIndex > 0 && (
            <ReferenceLine
              x={data[forecastStartIndex]?.date}
              stroke={refLineColor}
              strokeDasharray="4 4"
              label={{
                value: "Forecast →",
                position: "insideTopRight",
                fill: tickColor,
                fontSize: 10,
              }}
            />
          )}

          {/* Market structure pivots: HH / HL / LH / LL (EH/EL = equal, ±1%) */}
          {showStructure &&
            markers.map((m) => {
              const bullish = m.label === "HH" || m.label === "HL";
              const neutral = m.label === "EH" || m.label === "EL" || m.label === "P" || m.label === "T";
              const color = neutral
                ? (isDark ? "hsl(0,0%,65%)" : "hsl(0,0%,45%)")
                : bullish
                  ? "hsl(150, 70%, 42%)"
                  : "hsl(0, 72%, 55%)";
              return (
                <ReferenceDot
                  key={`${m.date}-${m.label}`}
                  x={m.date}
                  y={m.price}
                  r={3}
                  fill={color}
                  fillOpacity={m.provisional ? 0.45 : 1}
                  stroke={isDark ? "hsl(0,0%,10%)" : "hsl(0,0%,100%)"}
                  strokeWidth={1}
                  isFront
                  label={{
                    value: m.provisional ? `${m.label}?` : m.label,
                    position: m.type === "peak" ? "top" : "bottom",
                    fill: color,
                    fillOpacity: m.provisional ? 0.6 : 1,
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                />
              );
            })}


        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
