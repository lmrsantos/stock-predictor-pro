// ─────────────────────────────────────────────────────────────────────────────
// Hold-Window Analysis
// ─────────────────────────────────────────────────────────────────────────────
// Answers the question "how long has this stock historically taken to reach its
// best price after a setup like today's?" — purely descriptive, historical, and
// never a trade instruction.
//
// Method (per symbol, daily closes):
//   1. Walk every historical bar that had a full forward window available.
//   2. Keep only bars whose CONDITION matched today's condition (price above /
//      below its 50-day mean), so the sample is comparable to the present state.
//   3. For each matched entry, find the bar inside the forward window whose
//      close was the highest → that bar's offset is "days to peak", its return
//      is "peak gain".
//   4. Report the median days-to-peak, the interquartile range, the median peak
//      gain, the share of windows that reached a meaningful gain, and how much
//      of that peak was given back by holding the full window.
// ─────────────────────────────────────────────────────────────────────────────

export interface HoldWindowStats {
  /** Number of comparable historical entries analysed. */
  sampleSize: number;
  /** Median trading days from entry to the best close inside the window. */
  medianDaysToPeak: number;
  /** 25th / 75th percentile of days-to-peak — the "typical window". */
  p25DaysToPeak: number;
  p75DaysToPeak: number;
  /** Median best-close gain, in % from entry. */
  medianPeakGainPct: number;
  /** Share of windows whose best close beat entry by >= `targetGainPct`. */
  reachTargetRatePct: number;
  /** Median return from holding the FULL window instead of exiting at the peak. */
  medianHoldFullPct: number;
  /** Median percentage points surrendered by holding past the peak. */
  medianGiveBackPp: number;
  /** Gain threshold used for `reachTargetRatePct`. */
  targetGainPct: number;
  /** Max forward window length in trading days. */
  maxHoldDays: number;
  /** Whether the sample is large enough to read (>= 20 windows). */
  reliable: boolean;
  /** Condition today's entry was matched on. */
  condition: "above-trend" | "below-trend";
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const median = (xs: number[]) => percentile([...xs].sort((a, b) => a - b), 0.5);

function meanOfLast(closes: number[], end: number, len: number): number | null {
  const start = end - len + 1;
  if (start < 0) return null;
  let sum = 0;
  for (let i = start; i <= end; i++) sum += closes[i];
  return sum / len;
}

export function computeHoldWindow(
  closes: number[],
  opts: { maxHoldDays?: number; targetGainPct?: number; trendLen?: number } = {}
): HoldWindowStats | null {
  const maxHoldDays = opts.maxHoldDays ?? 30;
  const targetGainPct = opts.targetGainPct ?? 3;
  const trendLen = opts.trendLen ?? 50;

  const clean = closes.filter(c => Number.isFinite(c) && c > 0);
  if (clean.length < trendLen + maxHoldDays + 20) return null;

  const lastIdx = clean.length - 1;
  const todayMean = meanOfLast(clean, lastIdx, trendLen);
  if (todayMean == null) return null;
  const condition: HoldWindowStats["condition"] =
    clean[lastIdx] >= todayMean ? "above-trend" : "below-trend";

  const daysToPeak: number[] = [];
  const peakGains: number[] = [];
  const holdFull: number[] = [];
  const giveBack: number[] = [];

  for (let i = trendLen - 1; i + maxHoldDays <= lastIdx; i++) {
    const mean = meanOfLast(clean, i, trendLen);
    if (mean == null) continue;
    const cond = clean[i] >= mean ? "above-trend" : "below-trend";
    if (cond !== condition) continue;

    const entry = clean[i];
    let bestIdx = i + 1;
    let best = clean[i + 1];
    for (let k = i + 2; k <= i + maxHoldDays; k++) {
      if (clean[k] > best) { best = clean[k]; bestIdx = k; }
    }
    const peakPct = ((best - entry) / entry) * 100;
    const fullPct = ((clean[i + maxHoldDays] - entry) / entry) * 100;

    daysToPeak.push(bestIdx - i);
    peakGains.push(peakPct);
    holdFull.push(fullPct);
    giveBack.push(peakPct - fullPct);
  }

  if (daysToPeak.length < 8) return null;

  const sortedDays = [...daysToPeak].sort((a, b) => a - b);
  const hits = peakGains.filter(g => g >= targetGainPct).length;

  return {
    sampleSize: daysToPeak.length,
    medianDaysToPeak: Math.round(percentile(sortedDays, 0.5)),
    p25DaysToPeak: Math.round(percentile(sortedDays, 0.25)),
    p75DaysToPeak: Math.round(percentile(sortedDays, 0.75)),
    medianPeakGainPct: median(peakGains),
    reachTargetRatePct: (hits / peakGains.length) * 100,
    medianHoldFullPct: median(holdFull),
    medianGiveBackPp: median(giveBack),
    targetGainPct,
    maxHoldDays,
    reliable: daysToPeak.length >= 20,
    condition,
  };
}

/** One-line, plain-language summary of the hold window. */
export function describeHoldWindow(h: HoldWindowStats, symbol?: string): string {
  const who = symbol ? `${symbol} ` : "";
  return (
    `Historically ${who}reached its best close about ${h.medianDaysToPeak} trading ` +
    `days after a setup like today's (typical range ${h.p25DaysToPeak}–${h.p75DaysToPeak} days), ` +
    `median best gain ${h.medianPeakGainPct >= 0 ? "+" : ""}${h.medianPeakGainPct.toFixed(1)}%. ` +
    `${Math.round(h.reachTargetRatePct)}% of ${h.sampleSize} comparable windows reached ` +
    `+${h.targetGainPct}% at some point. Holding the full ${h.maxHoldDays} days instead of ` +
    `exiting at the peak returned a median ${h.medianHoldFullPct >= 0 ? "+" : ""}${h.medianHoldFullPct.toFixed(1)}% ` +
    `(${h.medianGiveBackPp.toFixed(1)}pp given back). Historical distribution, not a recommendation.`
  );
}
