// lib/trend-term-structure.ts
// ─────────────────────────────────────────────────────────────────────────────
// Multi-horizon trend analysis: fit a regression line over 1y, 6m, 3m and 1m
// windows and compare them. The difference between horizons is curvature —
// whether a trend is accelerating, decelerating, or reversing.
//
// WHY NOT ANGLES IN DEGREES:
// An angle requires arctan(slope), which assumes one dollar and one day are the
// same length. They are not. Change the y-axis scale, the chart aspect ratio,
// or switch to log scale and the "angle" changes while the trend has not moved
// at all. A 45-degree line on a $50 stock means nothing like a 45-degree line
// on a $1,000 stock. This is why Gann angle theory does not survive scrutiny.
//
// Instead we use two scale-free measures:
//   normalizedSlope — percent of price per day. Comparable across stocks.
//   tStat           — slope divided by its own standard error. Answers
//                     "is this trend distinguishable from zero given the noise?"
//
// CRITICAL — WHY SIGNIFICANCE IS NOT COMPUTED FROM THE REGRESSION:
// Regressing price on time and reading the slope's t-statistic is a spurious
// regression (Granger & Newbold, 1974). OLS standard errors assume independent
// residuals; residuals from fitting a line to a random walk are massively
// autocorrelated, so the standard error is understated several-fold.
//
// Measured on 400 simulated driftless random walks, the price-vs-time t-stat
// exceeded 2 in 92% of them at the 1-year horizon (median |t| = 14.4). A valid
// test would flag 5%. Any classifier built on that number is reading noise.
//
// The valid test of drift uses MEAN LOG RETURN, because returns are close to
// independent while price levels are not:
//     t = mean(r) / ( sd(r) / sqrt(n) )
// On the same 400 driftless walks this flags 3.5-5.5% across horizons, as it
// should.
//
// So: the regression line is retained for DRAWING ONLY — it is an honest visual
// summary of where price went. Every significance decision comes from the
// returns-based drift test.
// ─────────────────────────────────────────────────────────────────────────────

export type Horizon = '1y' | '6m' | '3m' | '1m';

export const HORIZON_BARS: Record<Horizon, number> = {
  '1y': 252,
  '6m': 126,
  '3m': 63,
  '1m': 21,
};

export const HORIZON_ORDER: Horizon[] = ['1y', '6m', '3m', '1m'];

export interface HorizonFit {
  horizon: Horizon;
  /** Bars actually used (may be fewer than requested if history is short). */
  n: number;
  /** Raw OLS slope in price units per bar. Only for drawing the line. */
  slope: number;
  /** Intercept in price units, relative to the window's first bar. */
  intercept: number;
  /** Percent of current price per day. Scale-free, comparable across stocks. */
  normalizedSlope: number;
  /** Same figure annualized (×252), which reads more naturally. */
  annualizedPct: number;
  /**
   * Drift t-statistic from mean log return — the VALID significance test.
   * Not the regression slope's t-stat, which is spurious on price data.
   */
  tStat: number;
  /** Mean daily log return over the window. */
  meanLogReturn: number;
  /** Annualized drift implied by meanLogReturn, as a percent. */
  driftAnnualizedPct: number;
  /** Annualized volatility over the window, for context on the noise floor. */
  annualizedVol: number;
  /** Fraction of variance explained. Low R² with high |t| = weak but real drift. */
  rSquared: number;
  /** Total price change across the fitted line, as a percent. */
  totalMovePct: number;
  /** True when |tStat| >= T_SIGNIFICANT. */
  significant: boolean;
  /** +1 up, -1 down, 0 when not significant. */
  direction: 1 | -1 | 0;
  /** Fitted value at the first and last bar — for drawing. */
  startValue: number;
  endValue: number;
  /** Index into the full closes array where this window begins. */
  startIdx: number;
}

export type TrendState =
  | 'accelerating_up'
  | 'steady_up'
  | 'decelerating_up'
  | 'pullback_in_uptrend'
  | 'breaking_down'
  | 'accelerating_down'
  | 'steady_down'
  | 'decelerating_down'
  | 'rally_in_downtrend'
  | 'recovering'
  | 'uptrend_no_longer_measurable'
  | 'downtrend_no_longer_measurable'
  | 'short_term_decline_only'
  | 'short_term_advance_only'
  | 'flat_range'
  | 'no_trend';


export interface TrendTermStructure {
  fits: Record<Horizon, HorizonFit | null>;
  state: TrendState;
  stateLabel: string;
  stateDescription: string;
  /** Short-horizon drift minus long-horizon drift, in percent per day. */
  curvature: number;
  /**
   * t-statistic on that difference. Curvature is only called accelerating or
   * decelerating when |curvatureT| >= 2 — a fixed threshold on the raw
   * difference gets tripped constantly by noise.
   */
  curvatureT: number;
  /**
   * 'significant' — at least one horizon clears |t| >= 2, so the direction is
   * statistically distinguishable from noise.
   * 'provisional' — no horizon clears the bar; the state below is a DESCRIPTIVE
   * read of the raw drift signs (what actually happened), not a validated claim.
   * 'none' — not even a descriptive direction (flat / no history).
   */
  evidence: 'significant' | 'provisional' | 'none';
  /** How many of the four horizons are statistically significant. */
  significantCount: number;

  /** Conditioning key for the base-rate engine, e.g. "pullback_in_uptrend". */
  conditioningKey: string;
  /** Plain-language caution about what this structure does and does not imply. */
  caveat: string;
}

/** |t| threshold for calling a slope distinguishable from zero. */
export const T_SIGNIFICANT = 2.0;
/** Minimum bars before a horizon is fitted at all. */
export const MIN_BARS_PER_FIT = 12;

// ─── Single-window regression ────────────────────────────────────────────────

/**
 * Fit y = a + b·x over the last `bars` closes, ending at `endIdx` inclusive.
 * Returns null when there is not enough history.
 *
 * Strictly backward-looking: reads closes[startIdx..endIdx] only.
 */
export function fitHorizon(
  closes: number[],
  horizon: Horizon,
  endIdx: number = closes.length - 1,
): HorizonFit | null {
  const want = HORIZON_BARS[horizon];
  const startIdx = Math.max(0, endIdx - want + 1);
  const y = closes.slice(startIdx, endIdx + 1).filter(v => Number.isFinite(v) && v > 0);
  const n = y.length;
  if (n < MIN_BARS_PER_FIT) return null;

  // x = 0..n-1, so closed-form sums are exact and cheap
  const sx = ((n - 1) * n) / 2;
  const sxx = ((n - 1) * n * (2 * n - 1)) / 6;
  const sy = y.reduce((a, b) => a + b, 0);
  const sxy = y.reduce((s, v, i) => s + i * v, 0);

  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;

  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;

  // R² of the drawn line — descriptive only, never used for significance
  let ssr = 0;
  let sst = 0;
  const yMean = sy / n;
  for (let i = 0; i < n; i++) {
    const fitted = intercept + slope * i;
    ssr += (y[i] - fitted) ** 2;
    sst += (y[i] - yMean) ** 2;
  }
  const rSquared = sst > 0 ? Math.max(0, 1 - ssr / sst) : 0;

  // VALID significance test: drift in mean log return.
  // Returns are approximately independent; price levels are not.
  const rets: number[] = [];
  for (let i = 1; i < n; i++) {
    if (y[i] > 0 && y[i - 1] > 0) rets.push(Math.log(y[i] / y[i - 1]));
  }
  let tStat = 0;
  let meanLogReturn = 0;
  let annualizedVol = 0;
  if (rets.length >= 10) {
    const rn = rets.length;
    meanLogReturn = rets.reduce((a, b) => a + b, 0) / rn;
    const sd = Math.sqrt(
      rets.reduce((s2, v) => s2 + (v - meanLogReturn) ** 2, 0) / (rn - 1),
    );
    annualizedVol = sd * Math.sqrt(252);
    const se = sd / Math.sqrt(rn);
    tStat = se > 0 ? meanLogReturn / se : 0;
  }
  const driftAnnualizedPct = (Math.exp(meanLogReturn * 252) - 1) * 100;

  const lastPrice = y[n - 1];
  const normalizedSlope = lastPrice > 0 ? (slope / lastPrice) * 100 : 0;
  const startValue = intercept;
  const endValue = intercept + slope * (n - 1);
  const totalMovePct = startValue > 0 ? ((endValue - startValue) / startValue) * 100 : 0;

  const significant = Math.abs(tStat) >= T_SIGNIFICANT;
  const direction: 1 | -1 | 0 = !significant ? 0 : meanLogReturn > 0 ? 1 : -1;

  return {
    horizon,
    n,
    slope,
    intercept,
    normalizedSlope,
    annualizedPct: normalizedSlope * 252,
    tStat,
    meanLogReturn,
    driftAnnualizedPct,
    annualizedVol,
    rSquared,
    totalMovePct,
    significant,
    direction,
    startValue,
    endValue,
    startIdx,
  };
}

// ─── State classification ────────────────────────────────────────────────────

const STATE_COPY: Record<TrendState, { label: string; description: string }> = {
  accelerating_up: {
    label: 'Accelerating uptrend',
    description: 'Up across horizons, and the recent slope is steeper than the long one.',
  },
  steady_up: {
    label: 'Steady uptrend',
    description: 'Up across horizons at a broadly constant rate.',
  },
  decelerating_up: {
    label: 'Decelerating uptrend',
    description: 'Still up, but the recent slope is flatter than the long one — the trend is tiring.',
  },
  pullback_in_uptrend: {
    label: 'Pullback in an uptrend',
    description: 'The long trend is up while the most recent window is down.',
  },
  breaking_down: {
    label: 'Uptrend breaking down',
    description: 'The long trend is still up, but the medium and short windows have both turned down.',
  },
  accelerating_down: {
    label: 'Accelerating downtrend',
    description: 'Down across horizons, and the recent decline is steeper than the long one.',
  },
  steady_down: {
    label: 'Steady downtrend',
    description: 'Down across horizons at a broadly constant rate.',
  },
  decelerating_down: {
    label: 'Decelerating downtrend',
    description: 'Still down, but the recent decline is shallower than the long one.',
  },
  rally_in_downtrend: {
    label: 'Rally in a downtrend',
    description: 'The long trend is down while the most recent window is up.',
  },
  recovering: {
    label: 'Turning up from a downtrend',
    description: 'The long trend is down, but a shorter window has turned up and is measurable.',
  },
  uptrend_no_longer_measurable: {
    label: 'Uptrend no longer measurable',
    description: 'The long window is up, but no shorter window shows drift distinguishable from noise. The advance may have stopped, or it may simply be too quiet to measure — over this few bars those look identical.',
  },
  downtrend_no_longer_measurable: {
    label: 'Downtrend no longer measurable',
    description: 'The long window is down, but no shorter window shows drift distinguishable from noise. The decline may have stopped, or it may simply be too quiet to measure — over this few bars those look identical.',
  },
  short_term_decline_only: {
    label: 'Recent decline, no longer-term trend',
    description: 'A shorter window is measurably down, but the year shows no trend to place it against. This is not a pullback — there is no established uptrend to pull back from.',
  },
  short_term_advance_only: {
    label: 'Recent advance, no longer-term trend',
    description: 'A shorter window is measurably up, but the year shows no trend to place it against.',
  },
  flat_range: {
    label: 'Flat range',
    description: 'The year has gone nowhere, and the shorter windows point in opposite directions. This is a range, not a trend.',
  },
  no_trend: {
    label: 'No measurable trend',
    description: 'No horizon has a slope distinguishable from zero. Direction here is noise.',
  },
};


// ─── Curvature calibration ───────────────────────────────────────────────────
// A raw drift gap threshold of 1.5 bp/day was far too loose: on real daily data
// the 1m-vs-1y drift gap is routinely 20-70 annualized points of pure noise, so
// nearly every name came out "accelerating". Two corrections:
//   1. Acceleration must be MONOTONE — each shorter window steeper than the one
//      above it (1y -> 3m -> 1m), by a real step each time. One steep 1m window
//      on its own is noise, not acceleration.
//   2. Deceleration means the short window has lost most of the long window's
//      drift, not merely a little of it.

/** Annualized drift (%) inside which a horizon counts as flat, not directional. */
export const FLAT_ANN_PCT = 10;
/** Minimum annualized-point step between consecutive horizons to count. */
const MIN_STEP_ANN = 8;
/** Minimum total 1y -> 1m annualized-point gap for curvature to count. */
const MIN_TOTAL_GAP_ANN = 25;
/** Short drift must fall below this fraction of long drift to be decelerating. */
const DECEL_RATIO = 0.5;
/**
 * The long window only outranks the shorter ones while its drift is at least
 * this fraction of the strongest recent drift. Below it, the recent windows are
 * the trend and the long window is stale history.
 */
const DOMINANCE_RATIO = 0.5;

function curvatureFlags(
  dL: number,
  dM: number,
  dS: number,
  dir: number,
): { accelerating: boolean; decelerating: boolean } {
  if (!dir) return { accelerating: false, decelerating: false };
  // Rotate into the trend's own direction: larger = steeper in that direction.
  const l = dir * dL;
  const m = dir * dM;
  const s = dir * dS;

  const accelerating =
    m - l >= MIN_STEP_ANN && s - m >= MIN_STEP_ANN && s - l >= MIN_TOTAL_GAP_ANN;

  const decelerating =
    l > 0 && s < DECEL_RATIO * l && l - s >= MIN_TOTAL_GAP_ANN;

  return { accelerating, decelerating: decelerating && !accelerating };
}

/**
 * Shape of the term structure, given a direction per horizon.
 *
 * Branch order is long-window first, then whether the shorter windows agree,
 * then curvature. When the long window is flat but both shorter windows agree,
 * the agreement itself is the trend — a stock flat over a year and down over
 * both the quarter and the month is a downtrend, not "a recent decline".
 */
function shapeOf(
  L: number,
  M: number,
  S: number,
  accelerating: boolean,
  decelerating: boolean,
  aL: number = 0,
  aM: number = 0,
  aS: number = 0,
): TrendState {
  // Dominance check. A barely-positive year does not outrank a heavy decline in
  // both shorter windows: when the recent drift dwarfs the long window's drift,
  // the shorter windows ARE the trend, not a break in an uptrend.
  const recentMag = Math.max(Math.abs(aM), Math.abs(aS));
  const longDominated = Math.abs(aL) < DOMINANCE_RATIO * recentMag;

  if (L > 0) {
    if (S < 0 && M < 0) {
      if (longDominated) {
        if (accelerating) return 'accelerating_down';
        if (decelerating) return 'decelerating_down';
        return 'steady_down';
      }
      return 'breaking_down';
    }
    if (S < 0) return 'pullback_in_uptrend';
    if (M < 0) return 'breaking_down';
    if (S > 0 || M > 0) {
      if (accelerating) return 'accelerating_up';
      if (decelerating) return 'decelerating_up';
      return 'steady_up';
    }
    return 'uptrend_no_longer_measurable';
  }

  if (L < 0) {
    if (S > 0 && M > 0) {
      if (longDominated) {
        if (accelerating) return 'accelerating_up';
        if (decelerating) return 'decelerating_up';
        return 'steady_up';
      }
      return 'recovering';
    }
    if (S > 0) return 'rally_in_downtrend';
    if (M > 0) return 'recovering';
    if (S < 0 || M < 0) {
      if (accelerating) return 'accelerating_down';
      if (decelerating) return 'decelerating_down';
      return 'steady_down';
    }
    return 'downtrend_no_longer_measurable';
  }


  // Long window flat. If both shorter windows agree, that IS the trend.
  if (M < 0 && S < 0) {
    if (accelerating) return 'accelerating_down';
    if (decelerating) return 'decelerating_down';
    return 'steady_down';
  }
  if (M > 0 && S > 0) {
    if (accelerating) return 'accelerating_up';
    if (decelerating) return 'decelerating_up';
    return 'steady_up';
  }
  // Only one shorter window points anywhere, or they contradict each other.
  if (M !== 0 && S !== 0) return 'flat_range'; // opposite signs, no direction
  if (S < 0 || M < 0) return 'short_term_decline_only';
  if (S > 0 || M > 0) return 'short_term_advance_only';
  return 'no_trend';
}

function classify(
  fits: Record<Horizon, HorizonFit | null>,
): { state: TrendState; evidence: 'significant' | 'provisional' | 'none' } {
  const long = fits['1y'] ?? fits['6m'];
  const mid = fits['3m'];
  const short = fits['1m'];

  const aL = long?.driftAnnualizedPct ?? 0;
  const aM = mid?.driftAnnualizedPct ?? 0;
  const aS = short?.driftAnnualizedPct ?? 0;

  const sigCount = HORIZON_ORDER.filter(h => fits[h]?.significant).length;

  if (sigCount > 0) {
    const L = long?.direction ?? 0;
    const M = mid?.direction ?? 0;
    const S = short?.direction ?? 0;
    const dir = L !== 0 ? L : M !== 0 ? M : S;
    const { accelerating, decelerating } = curvatureFlags(aL, aM, aS, dir);
    return { state: shapeOf(L, M, S, accelerating, decelerating), evidence: 'significant' };
  }

  // ── Descriptive fallback ────────────────────────────────────────────────────
  // Nothing clears the significance bar. Read the SIGN of realized drift in each
  // window, with a dead zone so a fraction of a percent a year is not called a
  // direction. Flagged provisional so it is never mistaken for a validated trend.
  const sign = (a: number): number =>
    !Number.isFinite(a) || Math.abs(a) < FLAT_ANN_PCT ? 0 : a > 0 ? 1 : -1;

  const dL = sign(aL);
  const dM = sign(aM);
  const dS = sign(aS);
  if (dL === 0 && dM === 0 && dS === 0) return { state: 'no_trend', evidence: 'none' };

  const dir = dL !== 0 ? dL : dM !== 0 ? dM : dS;
  const { accelerating, decelerating } = curvatureFlags(aL, aM, aS, dir);
  return {
    state: shapeOf(dL, dM, dS, accelerating, decelerating),
    evidence: 'provisional',
  };
}



// ─── Main entry point ────────────────────────────────────────────────────────

export function analyzeTrendTermStructure(
  closes: number[],
  endIdx: number = closes.length - 1,
): TrendTermStructure {
  const fits = {
    '1y': fitHorizon(closes, '1y', endIdx),
    '6m': fitHorizon(closes, '6m', endIdx),
    '3m': fitHorizon(closes, '3m', endIdx),
    '1m': fitHorizon(closes, '1m', endIdx),
  } as Record<Horizon, HorizonFit | null>;

  const longFit = fits['1y'] ?? fits['6m'];
  const shortFit = fits['1m'] ?? fits['3m'];
  // Curvature from DRIFT, not regression slope — same reason as significance.
  const curvature =
    longFit && shortFit
      ? (shortFit.meanLogReturn - longFit.meanLogReturn) * 100
      : 0;

  // Standard error of the difference between two independent-ish drift
  // estimates. Used to test acceleration rather than thresholding the gap.
  let curvatureT = 0;
  if (longFit && shortFit) {
    const seShort = shortFit.n > 2
      ? (shortFit.annualizedVol / Math.sqrt(252)) / Math.sqrt(shortFit.n - 1) : 0;
    const seLong = longFit.n > 2
      ? (longFit.annualizedVol / Math.sqrt(252)) / Math.sqrt(longFit.n - 1) : 0;
    const seDiff = Math.sqrt(seShort ** 2 + seLong ** 2);
    curvatureT = seDiff > 0
      ? (shortFit.meanLogReturn - longFit.meanLogReturn) / seDiff : 0;
  }

  const { state, evidence } = classify(fits);
  const significantCount = HORIZON_ORDER.filter(h => fits[h]?.significant).length;

  // The four windows overlap heavily, so their slopes are strongly correlated.
  // Four measurements are worth roughly one and a half independent observations.
  const caveat =
    evidence === 'none'
      ? 'No horizon shows any drift at all. There is nothing here to describe.'
      : evidence === 'provisional'
        ? 'No horizon clears the significance bar, so this shape is a description of realized drift, not a validated trend. Do not size a position on it.'
        : significantCount <= 1
          ? 'Only one horizon is statistically significant. The trend structure is weak evidence on its own.'
          : 'The four windows overlap heavily, so their slopes are correlated. Treat this as roughly one and a half independent observations, not four.';

  return {
    fits,
    state,
    stateLabel: STATE_COPY[state].label,
    stateDescription: STATE_COPY[state].description,
    curvature,
    curvatureT,
    evidence,
    significantCount,
    conditioningKey: state,
    caveat,
  };
}


// ─── Drawing helper ──────────────────────────────────────────────────────────

export interface TrendLineSegment {
  horizon: Horizon;
  startIdx: number;
  endIdx: number;
  startValue: number;
  endValue: number;
  direction: 1 | -1 | 0;
  significant: boolean;
}

/**
 * Line segments in index/price space, ready for a chart overlay.
 * Ordered longest horizon first so an animation can walk from 1y down to 1m.
 */
export function trendLineSegments(
  ts: TrendTermStructure,
  endIdx: number,
): TrendLineSegment[] {
  return HORIZON_ORDER
    .map(h => {
      const f = ts.fits[h];
      if (!f) return null;
      return {
        horizon: h,
        startIdx: f.startIdx,
        endIdx,
        startValue: f.startValue,
        endValue: f.endValue,
        direction: f.direction,
        significant: f.significant,
      } as TrendLineSegment;
    })
    .filter((s): s is TrendLineSegment => s !== null);
}
