import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { ChartDataPoint } from "@/lib/types";
import { formatPrice } from "@/lib/regression";
import { InfoTooltip, metricInfo } from "./InfoTooltip";

interface RegressionChartProps {
  data: ChartDataPoint[];
  isLoading: boolean;
  slopePositive: boolean;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload as ChartDataPoint;
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
  if (isLoading) {
    return (
      <div className="flex-1 chart-surface flex items-center justify-center min-h-[400px]">
        <div className="space-y-3 text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-xs font-mono">Loading market data…</p>
        </div>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="flex-1 chart-surface flex items-center justify-center min-h-[400px]">
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

  const isDark = document.documentElement.classList.contains("dark");

  const regressionColor = slopePositive
    ? "hsl(150, 70%, 40%)"
    : "hsl(0, 75%, 55%)";

  const bandColor = isDark ? "hsl(0, 0%, 60%)" : "hsl(0, 0%, 50%)";
  const bgColor = isDark ? "hsl(0, 0%, 11%)" : "hsl(270, 30%, 96%)";
  const gridColor = isDark ? "hsl(0, 0%, 20%)" : "hsl(268, 25%, 88%)";
  const tickColor = isDark ? "hsl(0, 0%, 55%)" : "hsl(265, 15%, 45%)";
  const priceLineColor = isDark ? "hsl(0, 0%, 85%)" : "hsl(265, 40%, 30%)";
  const refLineColor = isDark ? "hsl(0, 0%, 35%)" : "hsl(268, 25%, 75%)";

  return (
    <div className="flex-1 chart-surface min-h-[400px] p-4 lg:p-6">
      <div className="flex items-center gap-4 mb-4 text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-foreground inline-block rounded" />
          Price
          <InfoTooltip {...metricInfo.price} />
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 inline-block rounded" style={{ background: regressionColor }} />
          Regression
          <InfoTooltip {...metricInfo.regressionLine} />
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 inline-block rounded bg-muted-foreground/30" />
          1σ Band
          <InfoTooltip {...metricInfo.oneSigmaBand} />
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 inline-block rounded opacity-15" style={{ background: bandColor }} />
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
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
          <CartesianGrid
            stroke={gridColor}
            strokeDasharray="3 3"
            vertical={true}
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

          {/* 2-sigma band (just the upper area, low opacity) */}
          <Area
            dataKey="upper2Sigma"
            stroke="none"
            fill={bandColor}
            fillOpacity={0.06}
            type="linear"
            isAnimationActive={false}
          />

          {/* 1-sigma band */}
          <Area
            dataKey="upper1Sigma"
            stroke="none"
            fill={bandColor}
            fillOpacity={0.1}
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
