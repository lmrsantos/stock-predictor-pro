// lib/model-validation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Rolling-window validation for the calibration backtest engine.
//
// Replaces single-endpoint winner selection, which had three flaws:
//   1. Scoring on ONE holdout endpoint — a model that wandered for 29 days and
//      happened to cross the right price on day 30 scored the same as one that
//      tracked closely throughout. Path information was discarded.
//   2. Selection bias — with 5 candidates scored on one point, the winner is
//      partly chance. Even five pure-noise models produce a "winner".
//   3. No margin check — a 0.7% vs 0.9% gap was treated as a decisive ranking
//      when it is inside the noise.
//
// This module scores each model across MULTIPLE rolling holdout windows using
// path MAPE, then only declares a winner when it beats the field by more than
// the spread among the others. Otherwise it reports "no clear winner" and the
// caller should fall back to the ensemble mean.
// ─────────────────────────────────────────────────────────────────────────────

export interface WindowScore {
  /** Index of the as-of bar this window projected from. */
  asOfIdx: number;
  /** Mean absolute % error across every bar in the holdout path. */
  pathMape: number;
  /** Absolute % error at the final bar only (kept for comparison/reporting). */
  endpointErrorPct: number;
  /** Did the model get the sign of the realized move right? */
  directionCorrect: boolean;
}

export interface RollingValidation {
  windowSize: number;
  label: string;
  /** Per-window results, oldest first. */
  windows: WindowScore[];
  /** Median path MAPE across all windows — the headline score. */
  medianPathMape: number;
  /** Mean path MAPE (reported, but median is used for ranking — less tail-sensitive). */
  meanPathMape: number;
  /** Fraction of windows where this model had the lowest path MAPE. */
  winRate: number;
  /** Fraction of windows where direction was called correctly. */
  directionHitRate: number;
  /** Windows actually evaluated (may be fewer than requested if history is short). */
  windowCount: number;
}

export interface WinnerSelection {
  /** Window size of the selected model, or null when no model is clearly best. */
  winnerWindowSize: number | null;
  /** True when the best model's margin exceeds the spread among the rest. */
  decisive: boolean;
  /** Gap between best and second-best median path MAPE, in percentage points. */
  margin: number;
  /** Standard deviation of the non-winning models' median MAPEs — the noise floor. */
  fieldSpread: number;
  /** Human-readable explanation of the decision. */
  message: string;
  /** Ranked validations, best first. */
  ranked: RollingValidation[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

/** Number of rolling holdout windows to evaluate. */
export const N_WINDOWS = 12;
/** Bars between consecutive window start points. */
export const WINDOW_STRIDE = 10;
/** Minimum training bars required before a window is evaluated. */
export const MIN_TRAIN_BARS = 60;

// ─── Core scoring ─────────────────────────────────────────────────────────────

/**
 * Score a projection against the actual path over the holdout period.
 * Unlike endpoint-only scoring, every bar contributes — a model cannot win by
 * wandering and getting lucky on the final bar.
 */
export function scorePath(
  projectedPrices: number[],
  actualPrices: number[],
): { pathMape: number; endpointErrorPct: number } {
  const n = Math.min(projectedPrices.length, actualPrices.length);
  if (n === 0) return { pathMape: 100, endpointErrorPct: 100 };

  let sumAbsPct = 0;
  for (let i = 0; i < n; i++) {
    const actual = actualPrices[i];
    if (actual <= 0) continue;
    sumAbsPct += Math.abs((projectedPrices[i] - actual) / actual) * 100;
  }

  const endpointErrorPct =
    actualPrices[n - 1] > 0
      ? Math.abs((projectedPrices[n - 1] - actualPrices[n - 1]) / actualPrices[n - 1]) * 100
      : 100;

  return { pathMape: sumAbsPct / n, endpointErrorPct };
}

// ─── Rolling validation ───────────────────────────────────────────────────────

/**
 * Projection function supplied by the caller (backtest.ts owns the model math).
 * Given the training prices available at the as-of bar and how many steps to
 * project, it must return the projected price path — one entry per step.
 * It must NOT see any data beyond `trainPrices`.
 */
export type ProjectFn = (trainPrices: number[], steps: number) => number[];

/**
 * Evaluate one model across N rolling holdout windows.
 *
 * Windows are laid out walking backwards from the most recent bar, each
 * `WINDOW_STRIDE` bars earlier than the last. A model that wins on 9 of 12
 * windows has demonstrated something; one that wins on 1 has not.
 */
export function validateModelRolling(
  prices: number[],
  windowSize: number,
  label: string,
  holdoutDays: number,
  project: ProjectFn,
  nWindows: number = N_WINDOWS,
  stride: number = WINDOW_STRIDE,
): RollingValidation {
  const windows: WindowScore[] = [];
  const lastIdx = prices.length - 1;

  for (let w = 0; w < nWindows; w++) {
    const endIdx = lastIdx - w * stride;
    const asOfIdx = endIdx - holdoutDays;
    if (asOfIdx < MIN_TRAIN_BARS) break;

    const trainPrices = prices.slice(0, asOfIdx + 1);
    const actualPath = prices.slice(asOfIdx + 1, endIdx + 1);
    if (actualPath.length === 0) continue;

    const projected = project(trainPrices, actualPath.length);
    if (projected.length === 0) continue;

    const { pathMape, endpointErrorPct } = scorePath(projected, actualPath);

    const asOfPrice = prices[asOfIdx];
    const realizedMove = actualPath[actualPath.length - 1] - asOfPrice;
    const predictedMove = projected[projected.length - 1] - asOfPrice;
    const directionCorrect =
      Math.sign(predictedMove) === Math.sign(realizedMove) || realizedMove === 0;

    windows.push({ asOfIdx, pathMape, endpointErrorPct, directionCorrect });
  }

  windows.reverse(); // oldest first

  const mapes = windows.map(w => w.pathMape).sort((a, b) => a - b);
  const medianPathMape = mapes.length
    ? mapes[Math.floor(mapes.length / 2)]
    : 100;
  const meanPathMape = mapes.length
    ? mapes.reduce((s, v) => s + v, 0) / mapes.length
    : 100;
  const directionHitRate = windows.length
    ? windows.filter(w => w.directionCorrect).length / windows.length
    : 0;

  return {
    windowSize,
    label,
    windows,
    medianPathMape,
    meanPathMape,
    winRate: 0, // filled in by selectWinner once all models are scored
    directionHitRate,
    windowCount: windows.length,
  };
}

// ─── Winner selection with margin check ───────────────────────────────────────

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

/**
 * Rank models and decide whether any is decisively best.
 *
 * A winner is only declared when its margin over second place exceeds the
 * standard deviation of the field. Otherwise the models are statistically
 * indistinguishable and the caller should use the ensemble mean instead of
 * pretending one earned the right to forecast alone.
 */
export function selectWinner(validations: RollingValidation[]): WinnerSelection {
  const usable = validations.filter(v => v.windowCount > 0);

  if (usable.length === 0) {
    return {
      winnerWindowSize: null,
      decisive: false,
      margin: 0,
      fieldSpread: 0,
      message: 'Not enough history to validate any model. No forecast is defensible.',
      ranked: validations,
    };
  }

  // Per-window win rates: how often was each model the best on that window?
  const windowCount = Math.min(...usable.map(v => v.windowCount));
  const winCounts = new Map<number, number>();
  usable.forEach(v => winCounts.set(v.windowSize, 0));

  for (let i = 0; i < windowCount; i++) {
    let best: RollingValidation | null = null;
    for (const v of usable) {
      const w = v.windows[i];
      if (!w) continue;
      if (!best || w.pathMape < best.windows[i].pathMape) best = v;
    }
    if (best) winCounts.set(best.windowSize, (winCounts.get(best.windowSize) ?? 0) + 1);
  }

  usable.forEach(v => {
    v.winRate = windowCount > 0 ? (winCounts.get(v.windowSize) ?? 0) / windowCount : 0;
  });

  const ranked = [...usable].sort((a, b) => a.medianPathMape - b.medianPathMape);
  const best = ranked[0];
  const second = ranked[1];

  if (!second) {
    return {
      winnerWindowSize: best.windowSize,
      decisive: true,
      margin: 0,
      fieldSpread: 0,
      message: `Only one model had enough history to validate (${best.label}).`,
      ranked,
    };
  }

  const margin = second.medianPathMape - best.medianPathMape;
  const fieldSpread = stdDev(ranked.slice(1).map(v => v.medianPathMape));

  // Decisive requires BOTH a margin above the field's own noise AND consistency
  // across windows — winning once out of twelve is not a credential.
  const marginDecisive = margin > fieldSpread;
  const consistentlyBest = best.winRate >= 0.4;
  const decisive = marginDecisive && consistentlyBest;

  let message: string;
  if (decisive) {
    message =
      `${best.label} won ${Math.round(best.winRate * 100)}% of ${windowCount} rolling windows ` +
      `with a median path error of ${best.medianPathMape.toFixed(1)}%, ` +
      `beating the next model by ${margin.toFixed(1)} points — a clear margin.`;
  } else if (!marginDecisive) {
    message =
      `No clear winner. The best model (${best.label}, ${best.medianPathMape.toFixed(1)}% median path error) ` +
      `beat second place by only ${margin.toFixed(1)} points, inside the field's own spread of ` +
      `${fieldSpread.toFixed(1)}. Using the ensemble mean instead of crowning one model.`;
  } else {
    message =
      `No clear winner. ${best.label} has the lowest median error but only won ` +
      `${Math.round(best.winRate * 100)}% of ${windowCount} windows — not consistent enough ` +
      `to forecast alone. Using the ensemble mean.`;
  }

  return {
    winnerWindowSize: decisive ? best.windowSize : null,
    decisive,
    margin,
    fieldSpread,
    message,
    ranked,
  };
}

// ─── Reporting helper ─────────────────────────────────────────────────────────

export interface ValidationSummary {
  decisive: boolean;
  winnerLabel: string | null;
  medianPathMape: number;
  directionHitRate: number;
  windowCount: number;
  message: string;
  /** Per-model table for the UI. */
  table: {
    label: string;
    medianPathMape: number;
    winRate: number;
    directionHitRate: number;
  }[];
}

export function summarizeValidation(sel: WinnerSelection): ValidationSummary {
  const best = sel.ranked[0];
  return {
    decisive: sel.decisive,
    winnerLabel: sel.decisive ? best?.label ?? null : null,
    medianPathMape: best?.medianPathMape ?? 100,
    directionHitRate: best?.directionHitRate ?? 0,
    windowCount: best?.windowCount ?? 0,
    message: sel.message,
    table: sel.ranked.map(v => ({
      label: v.label,
      medianPathMape: v.medianPathMape,
      winRate: v.winRate,
      directionHitRate: v.directionHitRate,
    })),
  };
}
