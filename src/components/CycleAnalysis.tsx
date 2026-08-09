import { useMemo } from "react";
import { analyzeCycles, formatCycleReport, type CycleAnalysisResult } from "@/lib/cycle-analysis";
import { TrendingUp, TrendingDown, Minus, Target } from "lucide-react";

interface CycleAnalysisProps {
  ticker: string;
  prices: number[];
  dates:  string[];
}

export function CycleAnalysisPanel({ ticker, prices, dates }: CycleAnalysisProps) {
  const result: CycleAnalysisResult = useMemo(() => {
    return analyzeCycles(ticker, prices, dates);
  }, [ticker, prices, dates]);

  const { projection, peaks, troughs, currentPrice } = result;

  const positionColors = {
    near_trough: "text-emerald-400 bg-emerald-500/10 border-emerald-800/40",
    near_peak:   "text-red-400 bg-red-500/10 border-red-800/40",
    mid_cycle:   "text-sky-400 bg-sky-500/10 border-sky-800/40",
    breakout:    "text-purple-400 bg-purple-500/10 border-purple-800/40",
  };

  const positionLabels = {
    near_trough: "📉 Near Support Zone",
    near_peak:   "📈 Near Resistance Zone",
    mid_cycle:   "↔️ Mid-Cycle",
    breakout:    "🚀 Breakout",
  };

  const trendIcon =
    projection.troughTrend === "rising"  ? <TrendingUp  className="w-3 h-3 text-emerald-400" /> :
    projection.troughTrend === "falling" ? <TrendingDown className="w-3 h-3 text-red-400" />    :
    <Minus className="w-3 h-3 text-muted-foreground" />;

  // Find nearby fib levels
  const nearbyFibs = projection.fibLevels
    .filter(f => Math.abs(f.distanceFromCurrent) < 15)
    .sort((a, b) => Math.abs(a.distanceFromCurrent) - Math.abs(b.distanceFromCurrent));

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Cycle Analysis — Peaks & Troughs
        </p>
        <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${positionColors[projection.currentPosition]}`}>
          {positionLabels[projection.currentPosition]}
        </span>
      </div>

      {/* Key projections */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 p-3 space-y-1">
          <p className="text-[9px] font-mono uppercase tracking-widest text-emerald-600">
            Next Support
          </p>
          <p className="text-lg font-mono font-bold text-emerald-400">
            ${projection.nextTrough.toFixed(2)}
          </p>
          <p className="text-[9px] font-mono text-muted-foreground">
            {((projection.nextTrough - currentPrice) / currentPrice * 100).toFixed(1)}% from current
            · {projection.troughConfidence}% conf
          </p>
          <div className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground">
            {trendIcon}
            <span>Lows +{projection.avgTroughGrowth}%/cycle avg</span>
          </div>
        </div>

        <div className="rounded-lg border border-red-800/40 bg-red-950/20 p-3 space-y-1">
          <p className="text-[9px] font-mono uppercase tracking-widest text-red-600">
            Next Resistance
          </p>
          <p className="text-lg font-mono font-bold text-red-400">
            ${projection.nextPeak.toFixed(2)}
          </p>
          <p className="text-[9px] font-mono text-muted-foreground">
            {((projection.nextPeak - currentPrice) / currentPrice * 100).toFixed(1)}% from current
            · {projection.peakConfidence}% conf
          </p>
          <div className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground">
            <TrendingUp className="w-3 h-3 text-red-400" />
            <span>Highs +{projection.avgPeakGrowth}%/cycle avg</span>
          </div>
        </div>
      </div>

      {/* Fibonacci levels */}
      {nearbyFibs.length > 0 && (
        <div className="rounded-lg border border-border bg-card/60 p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Target className="w-3 h-3 text-muted-foreground" />
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              Fibonacci Levels (nearby)
            </p>
          </div>
          <div className="space-y-1">
            {nearbyFibs.slice(0, 4).map(fib => (
              <div key={fib.level} className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground">{fib.level}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-foreground">${fib.price.toFixed(2)}</span>
                  <span className={`text-[9px] font-mono ${
                    fib.distanceFromCurrent > 0 ? "text-red-400" : "text-emerald-400"
                  }`}>
                    {fib.distanceFromCurrent > 0 ? "+" : ""}{fib.distanceFromCurrent}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cycle history */}
      <div className="rounded-lg border border-border bg-card/60 p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              Cycle History ({peaks.length} peaks · {troughs.length} troughs)
            </p>
            <p className="text-[8px] font-mono text-muted-foreground/70">
              ▲ red = peak (local high / resistance) · ▼ green = trough (local low / support). Showing last 8 pivots.
            </p>
          </div>
          <div className="flex rounded-md border border-border overflow-hidden shrink-0">
            {(["chart", "list"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider transition-colors ${
                  mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {mode === "chart" ? (
          <div className="h-48 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 18, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 8, fontFamily: "monospace", fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                />
                <YAxis
                  domain={["dataMin", "dataMax"]}
                  tick={{ fontSize: 8, fontFamily: "monospace", fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 10,
                    fontFamily: "monospace",
                  }}
                  labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                  formatter={(v: number, _n, p) => [
                    `$${v.toFixed(2)}${p?.payload?.pct !== undefined ? `  (${p.payload.pct > 0 ? "+" : ""}${p.payload.pct.toFixed(0)}%)` : ""}`,
                    p?.payload?.type === "peak" ? "Peak" : "Trough",
                  ]}
                />
                <Line
                  type="linear"
                  dataKey="price"
                  stroke="hsl(var(--primary))"
                  strokeWidth={1.5}
                  isAnimationActive={false}
                  dot={(props: any) => {
                    const isPeak = props.payload.type === "peak";
                    return (
                      <g key={`d-${props.index}`}>
                        <circle
                          cx={props.cx}
                          cy={props.cy}
                          r={3.5}
                          fill={isPeak ? "hsl(0 72% 60%)" : "hsl(152 62% 48%)"}
                          stroke="hsl(var(--card))"
                          strokeWidth={1}
                        />
                        <text
                          x={props.cx}
                          y={isPeak ? props.cy - 8 : props.cy + 14}
                          textAnchor="middle"
                          fontSize={8}
                          fontFamily="monospace"
                          fill={isPeak ? "hsl(0 72% 60%)" : "hsl(152 62% 48%)"}
                        >
                          ${props.payload.price.toFixed(2)}
                        </text>
                      </g>
                    );
                  }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {pivots.map((pt, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={pt.type === "peak" ? "text-red-400" : "text-emerald-400"}>
                    {pt.type === "peak" ? "▲" : "▼"}
                  </span>
                  <span className={`text-[8px] font-mono uppercase tracking-wider ${
                    pt.type === "peak" ? "text-red-400/80" : "text-emerald-400/80"
                  }`}>
                    {pt.type === "peak" ? "Peak" : "Trough"}
                  </span>
                  <span className="text-[9px] font-mono text-muted-foreground">{pt.date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-foreground">${pt.price.toFixed(2)}</span>
                  {pt.pctFromPrev !== undefined && (
                    <span className={`text-[9px] font-mono ${
                      pt.pctFromPrev > 0 ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {pt.pctFromPrev > 0 ? "+" : ""}{pt.pctFromPrev.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>


      {/* Interpretation */}
      <div className="rounded-lg border border-sky-800/30 bg-sky-950/10 p-3 space-y-2">
        <p className="text-[10px] font-mono text-muted-foreground leading-relaxed">
          {projection.interpretation}
        </p>
        <div className="border-t border-sky-800/20 pt-2 space-y-1">
          <p className="text-[9px] font-mono text-muted-foreground">
            <span className="text-sky-400">Avg cycle:</span> {projection.cycleLength} trading days (~{Math.round(projection.cycleLength/21)} months)
          </p>
          {projection.cycleLengthSampleSize > 0 ? (
            <>
              <p className="text-[9px] font-mono text-muted-foreground">
                <span className="text-sky-400">Formula:</span> {projection.cycleLengthFormula}
              </p>
              <p className="text-[9px] font-mono text-muted-foreground">
                <span className="text-sky-400">Source:</span> {projection.cycleLengthSource} · {projection.cycleLengthSampleSize} completed cycle{projection.cycleLengthSampleSize > 1 ? 's' : ''}
              </p>
              <p className="text-[9px] font-mono text-muted-foreground">
                <span className="text-sky-400">Dates:</span> {projection.cycleLengthDateRange}
              </p>
              <p className="text-[9px] font-mono text-muted-foreground">
                <span className="text-sky-400">Gaps:</span> {projection.cycleLengthGaps.join(", ")} bars
              </p>
            </>
          ) : (
            <p className="text-[9px] font-mono text-muted-foreground">
              <span className="text-sky-400">Formula:</span> {projection.cycleLengthFormula} — using default {projection.cycleLength} day estimate because only {peaks.length} peak{peaks.length !== 1 ? 's' : ''} and {troughs.length} trough{troughs.length !== 1 ? 's' : ''} were detected.
            </p>
          )}
        </div>
      </div>

      <p className="text-[9px] font-mono text-muted-foreground text-center">
        Zigzag detection · Fibonacci retracements · Geometric cycle projection
      </p>
    </div>
  );
}
