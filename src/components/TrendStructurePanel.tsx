// components/TrendStructurePanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Trend term structure overlay: animates the fitted trend line across
// 1Y → 6M → 3M → 1M, pivoting about the RIGHT EDGE of the series.
//
// Why the pivot matters: on a declining series the window START slides upward
// along the price path as the window shortens. Interpolating the left endpoint
// directly makes the line sweep upward and reads as a reversal even when every
// horizon is falling. So only the anchor (fitted value at the most recent bar)
// and the slope are interpolated; the left endpoint is derived from those two.
//
// Nothing here is a forecast. Every state describes what already happened.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import {
  analyzeTrendTermStructure,
  HORIZON_ORDER,
  type Horizon,
  type HorizonFit,
} from "@/lib/trend-term-structure";
import { annualizedVol, bucketVol } from "@/lib/conditioned-base-rates";

const TRAVEL_MS = 1100;
const HOLD_MS = 800;
const STEP_MS = TRAVEL_MS + HOLD_MS;

const HORIZON_LABEL: Record<Horizon, string> = {
  "1y": "1Y",
  "6m": "6M",
  "3m": "3M",
  "1m": "1M",
};

const signed = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;

function prefersReducedMotion() {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

interface Props {
  symbol: string;
  dates: string[];
  closes: number[];
}

export function TrendStructurePanel({ symbol, dates, closes }: Props) {
  const reduced = useMemo(prefersReducedMotion, []);
  const ts = useMemo(() => analyzeTrendTermStructure(closes), [closes]);

  const available = useMemo(
    () => HORIZON_ORDER.filter((h) => ts.fits[h] != null),
    [ts],
  );

  const [playing, setPlaying] = useState(!reduced);
  const [frozen, setFrozen] = useState<Horizon | null>(reduced ? "1y" : null);
  const [elapsed, setElapsed] = useState(0);

  // Container width for the SVG
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 900));
    ro.observe(el);
    setWidth(el.clientWidth || 900);
    return () => ro.disconnect();
  }, []);

  // Animation clock
  useEffect(() => {
    if (!playing || frozen || reduced || available.length < 2) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setElapsed((e) => (e + dt) % (STEP_MS * available.length));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, frozen, reduced, available.length]);

  const endIdx = closes.length - 1;

  // ─── Current interpolated line ─────────────────────────────────────────────
  const stepIdx = Math.floor(elapsed / STEP_MS);
  const inStep = elapsed - stepIdx * STEP_MS;
  const rawT = Math.min(1, inStep / TRAVEL_MS);
  const t = rawT * rawT * (3 - 2 * rawT); // ease-in-out

  const fallbackH: Horizon = available[0] ?? "1y";
  const pick = (h: Horizon | undefined): Horizon =>
    h && ts.fits[h] ? h : fallbackH;
  const ZERO_FIT = {
    endValue: closes[endIdx] ?? 0, slope: 0, startIdx: Math.max(0, endIdx),
    totalMovePct: 0, significant: false, direction: 0 as const,
    startValue: closes[endIdx] ?? 0, tStat: 0, driftAnnualizedPct: 0,
  };

  const fromH = pick(available[stepIdx % Math.max(1, available.length)]);
  const toH = pick(available[(stepIdx + 1) % Math.max(1, available.length)]);

  const activeHorizon: Horizon = pick(frozen ?? (rawT > 0.5 ? toH : fromH));
  const fromFit = ts.fits[pick(frozen ?? fromH)] ?? ZERO_FIT;
  const toFit = ts.fits[pick(frozen ?? toH)] ?? ZERO_FIT;

  const mix = frozen ? 1 : t;
  const anchor = fromFit.endValue + (toFit.endValue - fromFit.endValue) * mix;
  const slope = fromFit.slope + (toFit.slope - fromFit.slope) * mix;
  const startIdx = Math.round(
    fromFit.startIdx + (toFit.startIdx - fromFit.startIdx) * mix,
  );
  const leftValue = anchor - slope * (endIdx - startIdx); // derived, never interpolated

  const activeFit = ts.fits[activeHorizon] ?? ZERO_FIT;
  const longFit = ts.fits["1y"];

  // ─── Geometry ──────────────────────────────────────────────────────────────
  const H = 300;
  const PAD = { top: 14, right: 150, bottom: 22, left: 8 };
  const innerW = Math.max(120, width - PAD.left - PAD.right);
  const innerH = H - PAD.top - PAD.bottom;

  const visibleFrom = longFit ? longFit.startIdx : 0;
  const slice = closes.slice(visibleFrom);
  const lows = [...slice, leftValue, anchor];
  const min = Math.min(...lows);
  const max = Math.max(...lows);
  const span = max - min || 1;

  const x = (i: number) =>
    PAD.left + ((i - visibleFrom) / Math.max(1, endIdx - visibleFrom)) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - min) / span) * innerH;

  const pricePath = slice
    .map((v, k) => `${k === 0 ? "M" : "L"}${x(visibleFrom + k).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");

  const lineColor = !activeFit.significant
    ? "hsl(var(--muted-foreground))"
    : activeFit.direction > 0
      ? "hsl(142 71% 45%)"
      : "hsl(0 72% 51%)";

  const anchorX = x(endIdx);
  const anchorY = y(anchor);

  // ─── Readout ───────────────────────────────────────────────────────────────
  const vol = useMemo(() => annualizedVol(closes), [closes]);
  const volBucket = bucketVol(vol);
  const stateLabel =
    ts.state === "no_trend"
      ? `${ts.stateLabel} · ${volBucket === "normal" ? "normal volatility" : volBucket === "calm" ? "calm volatility" : "volatile"}`
      : ts.stateLabel;

  const jump = (h: Horizon) => {
    setFrozen(h);
    setPlaying(false);
  };

  return (
    <section className="rounded-xl border border-border bg-card/40 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Trend term structure · {symbol}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setFrozen(null); setPlaying((p) => !p); }}
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

      <div ref={wrapRef} className="w-full">
        <svg width={width} height={H} className="overflow-visible">
          {/* active window shading */}
          <rect
            x={x(startIdx)}
            y={PAD.top}
            width={Math.max(0, anchorX - x(startIdx))}
            height={innerH}
            fill="hsl(var(--primary))"
            fillOpacity={0.06}
          />
          {/* price path */}
          <path d={pricePath} fill="none" stroke="hsl(var(--foreground))" strokeWidth={1.2} opacity={0.75} />

          {/* 1Y ghost while a shorter horizon is active */}
          {longFit && activeHorizon !== "1y" && (
            <line
              x1={x(longFit.startIdx)}
              y1={y(longFit.startValue)}
              x2={anchorX}
              y2={y(longFit.endValue)}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1}
              strokeDasharray="4 5"
              opacity={0.45}
            />
          )}

          {/* the pivoting trend line */}
          <line
            x1={x(startIdx)}
            y1={y(leftValue)}
            x2={anchorX}
            y2={anchorY}
            stroke={lineColor}
            strokeWidth={2.2}
            strokeDasharray={activeFit.significant ? undefined : "6 5"}
          />

          {/* pivot dot — visually fixed at the right edge */}
          <circle cx={anchorX} cy={anchorY} r={6} fill={lineColor} stroke="#fff" strokeWidth={2} />

          {/* slope label pinned right of the pivot */}
          <text
            x={anchorX + 12}
            y={anchorY - (activeFit.significant ? 0 : 5)}
            fill={lineColor}
            fontSize={11}
            fontFamily="ui-monospace, monospace"
          >
            {`${signed(activeFit.totalMovePct)}% over ${HORIZON_LABEL[activeHorizon]}`}
          </text>
          {!activeFit.significant && (
            <text
              x={anchorX + 12}
              y={anchorY + 11}
              fill="hsl(var(--muted-foreground))"
              fontSize={10}
              fontFamily="ui-monospace, monospace"
            >
              not sig.
            </text>
          )}
        </svg>
      </div>

      {/* ─── Readout ─────────────────────────────────────────────────────── */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
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
