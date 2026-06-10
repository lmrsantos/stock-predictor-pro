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
    <Minus className="w-3 h-3 text-zinc-400" />;

  // Find nearby fib levels
  const nearbyFibs = projection.fibLevels
    .filter(f => Math.abs(f.distanceFromCurrent) < 15)
    .sort((a, b) => Math.abs(a.distanceFromCurrent) - Math.abs(b.distanceFromCurrent));

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
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
          <p className="text-[9px] font-mono text-zinc-600">
            {((projection.nextTrough - currentPrice) / currentPrice * 100).toFixed(1)}% from current
            · {projection.troughConfidence}% conf
          </p>
          <div className="flex items-center gap-1 text-[9px] font-mono text-zinc-600">
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
          <p className="text-[9px] font-mono text-zinc-600">
            {((projection.nextPeak - currentPrice) / currentPrice * 100).toFixed(1)}% from current
            · {projection.peakConfidence}% conf
          </p>
          <div className="flex items-center gap-1 text-[9px] font-mono text-zinc-600">
            <TrendingUp className="w-3 h-3 text-red-400" />
            <span>Highs +{projection.avgPeakGrowth}%/cycle avg</span>
          </div>
        </div>
      </div>

      {/* Fibonacci levels */}
      {nearbyFibs.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Target className="w-3 h-3 text-zinc-500" />
            <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">
              Fibonacci Levels (nearby)
            </p>
          </div>
          <div className="space-y-1">
            {nearbyFibs.slice(0, 4).map(fib => (
              <div key={fib.level} className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-zinc-500">{fib.level}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-300">${fib.price.toFixed(2)}</span>
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
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
        <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">
          Cycle History ({peaks.length} peaks · {troughs.length} troughs)
        </p>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {[...peaks, ...troughs]
            .sort((a, b) => a.index - b.index)
            .slice(-8)
            .map((pt, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={pt.type === "peak" ? "text-red-400" : "text-emerald-400"}>
                    {pt.type === "peak" ? "▲" : "▼"}
                  </span>
                  <span className="text-[9px] font-mono text-zinc-500">{pt.date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-300">${pt.price.toFixed(2)}</span>
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
      </div>

      {/* Interpretation */}
      <div className="rounded-lg border border-sky-800/30 bg-sky-950/10 p-3">
        <p className="text-[10px] font-mono text-zinc-400 leading-relaxed">
          {projection.interpretation}
        </p>
        <p className="text-[9px] font-mono text-zinc-600 mt-1">
          Avg cycle: {projection.cycleLength} trading days (~{Math.round(projection.cycleLength/21)} months)
        </p>
      </div>

      <p className="text-[9px] font-mono text-zinc-700 text-center">
        Zigzag detection · Fibonacci retracements · Geometric cycle projection
      </p>
    </div>
  );
}
