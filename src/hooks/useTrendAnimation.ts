// hooks/useTrendAnimation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Animation clock + interpolation for the trend term structure overlay.
//
// The line pivots about the RIGHT EDGE of the series: only the anchor (fitted
// value at the most recent bar) and the slope are interpolated; the left
// endpoint is derived from those two. Interpolating the left endpoint directly
// makes the line sweep upward on a declining series and reads as a reversal.
//
// Nothing here is a forecast. Every state describes what already happened.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import {
  analyzeTrendTermStructure,
  HORIZON_ORDER,
  type Horizon,
} from "@/lib/trend-term-structure";

const TRAVEL_MS = 1100;
const HOLD_MS = 800;
const STEP_MS = TRAVEL_MS + HOLD_MS;

export const HORIZON_LABEL: Record<Horizon, string> = {
  "1y": "1Y",
  "6m": "6M",
  "3m": "3M",
  "1m": "1M",
};

export interface TrendOverlay {
  startDate: string;
  startValue: number;
  endDate: string;
  endValue: number;
  color: string;
  dashed: boolean;
  label: string;
  sublabel?: string;
  ghost?: {
    startDate: string;
    startValue: number;
    endDate: string;
    endValue: number;
  } | null;
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

const signed = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;

export function useTrendAnimation(dates: string[], closes: number[]) {
  const reduced = useMemo(prefersReducedMotion, []);
  const ts = useMemo(() => analyzeTrendTermStructure(closes), [closes]);

  const available = useMemo(
    () => HORIZON_ORDER.filter((h) => ts.fits[h] != null),
    [ts],
  );

  const [playing, setPlaying] = useState(!reduced);
  const [frozen, setFrozen] = useState<Horizon | null>(reduced ? "1y" : null);
  const [elapsed, setElapsed] = useState(0);

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

  const stepIdx = Math.floor(elapsed / STEP_MS);
  const inStep = elapsed - stepIdx * STEP_MS;
  const rawT = Math.min(1, inStep / TRAVEL_MS);
  const t = rawT * rawT * (3 - 2 * rawT); // ease-in-out

  const fallbackH: Horizon = available[0] ?? "1y";
  const pick = (h: Horizon | undefined): Horizon => (h && ts.fits[h] ? h : fallbackH);
  const ZERO_FIT = {
    endValue: closes[endIdx] ?? 0,
    slope: 0,
    startIdx: Math.max(0, endIdx),
    totalMovePct: 0,
    significant: false,
    direction: 0 as const,
    startValue: closes[endIdx] ?? 0,
    tStat: 0,
    driftAnnualizedPct: 0,
  };

  const n = Math.max(1, available.length);
  const fromH = pick(available[stepIdx % n]);
  const toH = pick(available[(stepIdx + 1) % n]);

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

  const color = !activeFit.significant
    ? "hsl(var(--muted-foreground))"
    : activeFit.direction > 0
      ? "hsl(142 71% 45%)"
      : "hsl(0 72% 51%)";

  const overlay: TrendOverlay | null =
    endIdx < 1 || !dates[endIdx]
      ? null
      : {
          startDate: dates[Math.max(0, Math.min(startIdx, endIdx))],
          startValue: leftValue,
          endDate: dates[endIdx],
          endValue: anchor,
          color,
          dashed: !activeFit.significant,
          label: `${signed(activeFit.totalMovePct)}% over ${HORIZON_LABEL[activeHorizon]}`,
          sublabel: activeFit.significant ? undefined : "not sig.",
          ghost:
            longFit && activeHorizon !== "1y" && dates[longFit.startIdx]
              ? {
                  startDate: dates[longFit.startIdx],
                  startValue: longFit.startValue,
                  endDate: dates[endIdx],
                  endValue: longFit.endValue,
                }
              : null,
        };

  return {
    ts,
    reduced,
    playing,
    frozen,
    activeHorizon,
    overlay,
    togglePlay: () => {
      setFrozen(null);
      setPlaying((p) => !p);
    },
    jump: (h: Horizon) => {
      setFrozen(h);
      setPlaying(false);
    },
  };
}
