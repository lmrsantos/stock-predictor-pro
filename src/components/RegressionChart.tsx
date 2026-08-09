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
  label: "HH" | "LH" | "HL" | "LL" | "P" | "T";
  pct?: number;
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
      </div>

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
            domain={["auto", "auto"]}
            tick={{ fill: tickColor, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} />

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
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
