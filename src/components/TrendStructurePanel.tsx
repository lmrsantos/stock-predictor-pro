// components/TrendStructurePanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Controls + readout for the trend term structure. The animated line itself is
// drawn ON the main price chart (see RegressionChart's trendOverlay prop), so
// no separate chart is duplicated here.
//
// Nothing here is a forecast. Every state describes what already happened.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { Play, Pause } from "lucide-react";
import { HORIZON_ORDER, type Horizon, type HorizonFit } from "@/lib/trend-term-structure";
import { annualizedVol, bucketVol } from "@/lib/conditioned-base-rates";
import { HORIZON_LABEL, type useTrendAnimation } from "@/hooks/useTrendAnimation";

const signed = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;

interface Props {
  symbol: string;
  closes: number[];
  anim: ReturnType<typeof useTrendAnimation>;
}

export function TrendStructurePanel({ symbol, closes, anim }: Props) {
  const { ts, reduced, playing, frozen, activeHorizon, togglePlay, jump } = anim;

  const vol = useMemo(() => annualizedVol(closes), [closes]);
  const volBucket = bucketVol(vol);
  const stateLabel =
    ts.state === "no_trend"
      ? `${ts.stateLabel} · ${volBucket === "normal" ? "normal volatility" : volBucket === "calm" ? "calm volatility" : "volatile"}`
      : ts.stateLabel;

  return (
    <section className="rounded-xl border border-border bg-card/40 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Trend term structure · {symbol} · drawn on the chart above
        </p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={togglePlay}
            disabled={reduced}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-[11px] font-mono text-secondary-foreground hover:bg-accent disabled:opacity-40"
          >
            {playing && !frozen ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {playing && !frozen ? "Pause" : "Play"}
          </button>
          {HORIZON_ORDER.map((h) => (
            <button
              key={h}
              onClick={() => jump(h)}
              disabled={!ts.fits[h]}
              className={`px-2 py-1 rounded-md text-[11px] font-mono transition-colors disabled:opacity-30 ${
                frozen === h
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {HORIZON_LABEL[h]}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Readout ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-mono font-semibold text-foreground">{stateLabel}</span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
          {ts.significantCount} of 4 significant
        </span>
      </div>
      <p className="mt-1 text-[11px] font-mono text-muted-foreground leading-relaxed">
        {ts.stateDescription}
      </p>
      {ts.state === "no_trend" && (
        <p className="mt-1 text-[11px] font-mono text-amber-500">
          Direction is unknown here.
        </p>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="text-muted-foreground text-left">
              <th className="py-1.5 pr-3 font-normal">Window</th>
              <th className="py-1.5 pr-3 font-normal">Move</th>
              <th className="py-1.5 pr-3 font-normal">Drift (annualized)</th>
              <th className="py-1.5 pr-3 font-normal">t-stat</th>
              <th className="py-1.5 font-normal">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {HORIZON_ORDER.map((h) => {
              const f: HorizonFit | null = ts.fits[h];
              const isActive = h === activeHorizon;
              return (
                <tr
                  key={h}
                  className={`border-t border-border/60 ${
                    isActive ? "bg-primary/5" : ""
                  } ${f?.significant ? "" : "opacity-55"}`}
                >
                  <td className="py-1.5 pr-3 text-foreground">{HORIZON_LABEL[h]}</td>
                  <td className="py-1.5 pr-3">{f ? `${signed(f.totalMovePct)}%` : "—"}</td>
                  <td className="py-1.5 pr-3">
                    {/* Annualizing a 3M or 1M window produces absurd figures — omitted on purpose */}
                    {f && (h === "1y" || h === "6m") ? `${signed(f.driftAnnualizedPct)}%/yr` : "—"}
                  </td>
                  <td className="py-1.5 pr-3">{f ? f.tStat.toFixed(2) : "—"}</td>
                  <td className="py-1.5">
                    {!f
                      ? "not enough history"
                      : f.significant
                        ? f.direction > 0 ? "significant up" : "significant down"
                        : "not significant"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[10px] font-mono text-muted-foreground leading-relaxed border-t border-border pt-2">
        {ts.caveat} This describes what already happened over each window — it is not a forecast.
      </p>
    </section>
  );
}
