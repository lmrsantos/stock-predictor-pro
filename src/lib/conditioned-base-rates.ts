// lib/conditioned-base-rates.ts
// ─────────────────────────────────────────────────────────────────────────────
// Conditional base rates for setup evaluation, conditioned on forecastability.
//
// Core finding this encodes: forecast reliability is not uniform across the
// universe. Calm, long-listed names are meaningfully more predictable than
// young, volatile, narrative-driven ones. A single universe-wide base rate
// averages those together and misleads in both directions.
//
// Conditioning dimensions:
//   - volatility bucket (annualized realized vol, terciles of the universe)
//   - listing age bucket (years of price history available)
//
// Metrics are chosen for a downside-averse user: hit rate with a confidence
// interval, downside percentiles, and probability of a large loss — NOT just
// median return, which hides tail risk.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────

export type VolBucket     = 'calm' | 'normal' | 'volatile';
export type ListingBucket = 'seasoned' | 'established' | 'young';

export interface ConditioningProfile {
  annualizedVol: number;
  volBucket: VolBucket;
  /** Years since the real listing (IPO) date. null when unknown — NEVER inferred
   *  from how much price history happens to be available. */
  listingYears: number | null;
  /** null when listing age is unknown; the listing dimension is then skipped. */
  listingBucket: ListingBucket | null;
  /** Trend term-structure state as of the profiling bar, or null when unknown.
   *  Fourth conditioning dimension; dropped FIRST when a cell is thin. */
  trendState: string | null;
  /** Cell key without the trend dimension, e.g. "calm|seasoned". */
  volListingKey: string;
  /** Combined cell key, e.g. "calm|seasoned|steady_up". */
  cellKey: string;
  /** Plain-language note on how forecastable this name is likely to be. */
  forecastabilityNote: string;
}

export interface Occurrence {
  symbol: string;
  /** Index of the bar where the setup was detected. */
  barIdx: number;
  /** Realized forward return over the evaluation horizon, as a fraction (0.024 = +2.4%). */
  forwardReturn: number;
  cellKey: string;
  volListingKey: string;
  volBucket: VolBucket;
  listingBucket: ListingBucket | null;
  trendState: string | null;
}


export interface BaseRateStats {
  n: number;
  hitRate: number;              // fraction with forwardReturn > 0
  hitRateCI95: [number, number];
  medianReturn: number;
  meanReturn: number;
  p10: number;                  // 10th percentile — the bad case
  p25: number;
  p75: number;
  p90: number;
  /** Probability the forward return is worse than -10%. */
  probLossOver10: number;
  /** Standard deviation of forward returns. */
  dispersion: number;
}

export type CellSource = 'exact' | 'volatility_only' | 'universe' | 'insufficient';

export interface ConditionedBaseRate {
  setupName: string;
  profile: ConditioningProfile;
  /** Which level of the fallback hierarchy actually supplied the numbers. */
  source: CellSource;
  sourceNote: string;
  stats: BaseRateStats | null;
  /** Universe-wide stats, always shown alongside for contrast. */
  universeStats: BaseRateStats | null;
  /**
   * Unconditional forward-return statistics over the SAME population and period
   * (all bars, no setup filter). This is the honest comparison point — see
   * the note on path-selection bias below.
   */
  baselineStats: BaseRateStats | null;
  /** Setup hit rate minus baseline hit rate, in percentage points. */
  excessHitRatePp: number | null;
  /** Setup median return minus baseline median return, as a fraction. */
  excessMedianReturn: number | null;
  /** Symbol-specific occurrence count — usually far too small to use alone. */
  symbolOccurrences: number;
  /** Conservative gate — see CONSERVATIVE_CRITERIA. */
  meetsConservativeCriteria: boolean;
  conservativeVerdict: string;
}

// ─── Why baseline comparison is mandatory ─────────────────────────────────────
//
// Control testing on pure random walks (zero predictive structure by
// construction) showed that any setup conditioning on a long-term uptrend —
// "price above its 200-day average", "50-day above 200-day" — produces a hit
// rate near 55%, not 50%, across eight independent simulated universes.
//
// The mechanism is path selection, not predictive power. Symbols whose realized
// history happened to drift upward satisfy the uptrend filter on far more bars,
// so they contribute disproportionately many observations — and within a path
// that did drift up, forward returns are positive more often. This is the same
// structural bias as survivorship bias, and it is present in real data too.
//
// Consequence: an absolute hit rate of 55% on an uptrend-conditioned setup is
// evidence of NOTHING. The quantity that carries information is the excess over
// the unconditional hit rate measured on the same population over the same
// period. The conservative gate below therefore tests excess, not level.

// ─── Config ───────────────────────────────────────────────────────────────────

/** Annualized volatility cut points. Recomputed from the universe at runtime;
 *  these are fallbacks used when universe context is unavailable. */
export const VOL_CUTS = { calmMax: 0.28, normalMax: 0.50 };

/** Listing age cut points, in years. */
export const LISTING_CUTS = { seasonedMin: 8, establishedMin: 3 };

/** Minimum occurrences before a cell's numbers are trusted. */
export const MIN_N_EXACT     = 60;
export const MIN_N_VOL_ONLY  = 100;
export const MIN_N_UNIVERSE  = 150;

/**
 * Gate tuned for a downside-averse user: prefers a modest, reliable edge over
 * a large, uncertain one. All four must hold.
 */
export const CONSERVATIVE_CRITERIA = {
  /**
   * Minimum excess hit rate over the unconditional baseline, in percentage
   * points. Absolute level is NOT tested — see the path-selection note above.
   * Set to 5 because control tests on pure noise produced residual excess of
   * up to +5pp for uptrend-conditioned setups even against a global baseline.
   */
  minExcessHitRatePp: 5,
  /**
   * The setup's hit-rate CI must not overlap the baseline hit rate. This is the
   * statistical version of the criterion above.
   */
  requireCIAboveBaseline: true,
  /** Cap on how often a large loss occurs. */
  maxProbLossOver10: 0.15,
  /** The bad case must not be catastrophic. */
  minP10: -0.12,
  /** Need enough observations for any of the above to mean anything. */
  minN: MIN_N_EXACT,
};

// ─── Profiling ────────────────────────────────────────────────────────────────

/** Annualized realized volatility from daily closes over the trailing window. */
export function annualizedVol(closes: number[], window = 60): number {
  const slice = closes.slice(-Math.min(window, closes.length));
  if (slice.length < 10) return 0.5;
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i] > 0 && slice[i - 1] > 0) rets.push(Math.log(slice[i] / slice[i - 1]));
  }
  if (rets.length < 5) return 0.5;
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((s, r) => s + (r - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}

export function bucketVol(vol: number, cuts = VOL_CUTS): VolBucket {
  if (vol <= cuts.calmMax) return 'calm';
  if (vol <= cuts.normalMax) return 'normal';
  return 'volatile';
}

/** null in, null out — an unknown listing age must not be bucketed. */
export function bucketListing(years: number | null | undefined): ListingBucket | null {
  if (years == null || !Number.isFinite(years)) return null;
  if (years >= LISTING_CUTS.seasonedMin) return 'seasoned';
  if (years >= LISTING_CUTS.establishedMin) return 'established';
  return 'young';
}

/**
 * Derive volatility cut points from the universe itself (terciles), so buckets
 * stay meaningful as market conditions shift. Falls back to VOL_CUTS if the
 * universe is too small.
 */
export function deriveVolCuts(universeVols: number[]): typeof VOL_CUTS {
  const clean = universeVols.filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (clean.length < 30) return VOL_CUTS;
  return {
    calmMax:   clean[Math.floor(clean.length / 3)],
    normalMax: clean[Math.floor((clean.length * 2) / 3)],
  };
}

export function buildProfile(
  closes: number[],
  listingYears: number | null,
  cuts = VOL_CUTS,
  trendState: string | null = null,
): ConditioningProfile {
  const vol = annualizedVol(closes);
  const volBucket = bucketVol(vol, cuts);
  const listingBucket = bucketListing(listingYears);

  let note: string;
  if (volBucket === 'calm' && listingBucket === 'seasoned') {
    note = 'Calm and long-listed. Historically the most forecastable part of the universe.';
  } else if (volBucket === 'volatile' && listingBucket === 'young') {
    note = 'Young and highly volatile. Narrative-driven names like this are the least ' +
           'forecastable — direction here is close to a coin flip regardless of setup.';
  } else if (volBucket === 'volatile') {
    note = 'High volatility. Forecast direction is materially less reliable than for calm names.';
  } else if (listingBucket === 'young') {
    note = 'Short listing history. Limited data and no established price regime to fit against.';
  } else if (listingBucket === null) {
    note = `Mid-range volatility. Listing age is unknown for this symbol, so the ` +
           `listing dimension is not used in its conditioning.`;
  } else {
    note = 'Mid-range volatility and listing history. Typical forecastability.';
  }

  return {
    annualizedVol: vol,
    volBucket,
    listingYears: listingYears == null || !Number.isFinite(listingYears) ? null : listingYears,
    listingBucket,
    trendState,
    // Listing age unknown → the cell key collapses to the volatility bucket alone.
    volListingKey: listingBucket ? `${volBucket}|${listingBucket}` : volBucket,
    cellKey: trendState
      ? `${listingBucket ? `${volBucket}|${listingBucket}` : volBucket}|${trendState}`
      : listingBucket ? `${volBucket}|${listingBucket}` : volBucket,
    forecastabilityNote: note,
  };
}


// ─── Statistics ───────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Wilson score interval — behaves properly at small n, unlike the normal approximation. */
function wilsonCI(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [
    Math.max(0, (centre - spread) / d),
    Math.min(1, (centre + spread) / d),
  ];
}

export function computeStats(returns: number[]): BaseRateStats {
  const n = returns.length;
  if (n === 0) {
    return { n: 0, hitRate: 0, hitRateCI95: [0, 1], medianReturn: 0, meanReturn: 0,
             p10: 0, p25: 0, p75: 0, p90: 0, probLossOver10: 0, dispersion: 0 };
  }
  const sorted = [...returns].sort((a, b) => a - b);
  const wins = returns.filter(r => r > 0).length;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const dispersion = n > 1
    ? Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1))
    : 0;

  return {
    n,
    hitRate: wins / n,
    hitRateCI95: wilsonCI(wins, n),
    medianReturn: percentile(sorted, 0.5),
    meanReturn: mean,
    p10: percentile(sorted, 0.10),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.90),
    probLossOver10: returns.filter(r => r < -0.10).length / n,
    dispersion,
  };
}

// ─── Conditioned lookup with fallback hierarchy ───────────────────────────────

/**
 * Resolve base rates for a setup at a given profile.
 *
 * Fallback order — always reports which level was used, never silently
 * substitutes a broader population for a narrow one:
 *   1. exact cell (vol bucket × listing bucket)
 *   2. volatility bucket only
 *   3. universe-wide
 *   4. insufficient data — no numbers reported
 */
export function resolveConditionedBaseRate(
  setupName: string,
  profile: ConditioningProfile,
  allOccurrences: Occurrence[],
  symbol: string,
  /**
   * Unconditional forward returns sampled from the same population and period
   * — every evaluable bar, no setup filter. Produced by
   * sampleBaselineReturns() in setup-detector.ts. Without this the gate cannot
   * distinguish a real edge from path-selection bias.
   */
  baselineReturns: number[] = [],
): ConditionedBaseRate {
  const universeReturns = allOccurrences.map(o => o.forwardReturn);
  const universeStats = universeReturns.length >= MIN_N_UNIVERSE
    ? computeStats(universeReturns)
    : null;

  const symbolOccurrences = allOccurrences.filter(o => o.symbol === symbol).length;

  const exact = allOccurrences.filter(o => o.cellKey === profile.cellKey);
  // Dropping the trend dimension is the FIRST fallback step — it is the newest
  // and thinnest dimension, so it goes before listing age is given up.
  const noTrend = allOccurrences.filter(o => o.volListingKey === profile.volListingKey);
  const volOnly = allOccurrences.filter(o => o.volBucket === profile.volBucket);

  let stats: BaseRateStats | null = null;
  let source: CellSource = 'insufficient';
  let sourceNote = '';

  if (exact.length >= MIN_N_EXACT) {
    stats = computeStats(exact.map(o => o.forwardReturn));
    source = 'exact';
    sourceNote = profile.listingBucket
      ? `Measured on ${exact.length} occurrences among ${profile.volBucket}-volatility, ` +
        `${profile.listingBucket} names — the same population as this stock.`
      : `Measured on ${exact.length} occurrences among ${profile.volBucket}-volatility names ` +
        `— the same population as this stock. Listing age is unknown here, so it is not ` +
        `used as a conditioning dimension.`;
  } else if (profile.trendState && noTrend.length >= MIN_N_EXACT) {
    stats = computeStats(noTrend.map(o => o.forwardReturn));
    source = 'exact';
    sourceNote =
      `Too few occurrences in the exact ${profile.cellKey} cell (${exact.length}), so the ` +
      `trend-structure dimension is dropped. Measured on ${noTrend.length} occurrences among ` +
      `${profile.volListingKey} names — volatility and listing age still match this stock.`;
  } else if (volOnly.length >= MIN_N_VOL_ONLY) {
    stats = computeStats(volOnly.map(o => o.forwardReturn));
    source = 'volatility_only';
    sourceNote =
      `Too few occurrences in the exact ${profile.cellKey} cell ` +
      `(${exact.length}). Falling back to all ${profile.volBucket}-volatility names ` +
      `(${volOnly.length} occurrences). Listing age is not controlled for here.`;

  } else if (universeStats) {
    stats = universeStats;
    source = 'universe';
    sourceNote =
      `Too few occurrences among comparable names (${volOnly.length}). Showing the ` +
      `universe-wide rate, which pools calm and volatile stocks together — it will ` +
      `overstate reliability for a ${profile.volBucket} name like this one.`;
  } else {
    sourceNote =
      `Only ${allOccurrences.length} occurrences of this setup exist in the available ` +
      `history. Not enough to measure anything. No base rate is reported.`;
  }

  // Baseline: unconditional forward returns over the same population/period
  const baselineStats = baselineReturns.length >= MIN_N_UNIVERSE
    ? computeStats(baselineReturns)
    : null;

  const excessHitRatePp = stats && baselineStats
    ? (stats.hitRate - baselineStats.hitRate) * 100
    : null;
  const excessMedianReturn = stats && baselineStats
    ? stats.medianReturn - baselineStats.medianReturn
    : null;

  // Conservative gate — tests EXCESS over baseline, never absolute level
  let meets = false;
  let verdict: string;

  if (!stats) {
    verdict = 'Insufficient data to evaluate.';
  } else if (!baselineStats) {
    verdict =
      'No baseline available for comparison. An absolute hit rate cannot be ' +
      'interpreted on its own — setups that condition on an uptrend score near ' +
      '55% even with no predictive power. Not evaluated.';
  } else {
    const c = CONSERVATIVE_CRITERIA;
    const okExcess = (excessHitRatePp ?? 0) >= c.minExcessHitRatePp;
    const okCI     = !c.requireCIAboveBaseline || stats.hitRateCI95[0] > baselineStats.hitRate;
    const okTail   = stats.probLossOver10 <= c.maxProbLossOver10;
    const okP10    = stats.p10 >= c.minP10;
    const okN      = stats.n >= c.minN;
    meets = okExcess && okCI && okTail && okP10 && okN;

    const lvl = (stats.hitRate * 100).toFixed(0);
    const base = (baselineStats.hitRate * 100).toFixed(0);

    if (meets) {
      verdict =
        `Meets conservative criteria: ${lvl}% hit rate against a ${base}% baseline for ` +
        `comparable names over the same period — an excess of ` +
        `${(excessHitRatePp ?? 0).toFixed(1)} points that holds at the low end of its ` +
        `confidence interval. A loss worse than 10% occurred in ` +
        `${(stats.probLossOver10 * 100).toFixed(0)}% of cases.`;
    } else {
      const fails: string[] = [];
      if (!okExcess) fails.push(
        `hit rate of ${lvl}% is only ${(excessHitRatePp ?? 0).toFixed(1)} points above the ` +
        `${base}% baseline — inside what path selection alone produces`);
      else if (!okCI) fails.push(
        `the confidence interval overlaps the ${base}% baseline`);
      if (!okTail) fails.push(`losses worse than 10% occurred ${(stats.probLossOver10 * 100).toFixed(0)}% of the time`);
      if (!okP10)  fails.push(`the bad case is ${(stats.p10 * 100).toFixed(0)}%`);
      if (!okN)    fails.push(`only ${stats.n} occurrences`);
      verdict = `Does not meet conservative criteria: ${fails.join('; ')}.`;
    }
  }

  return {
    setupName,
    profile,
    source,
    sourceNote,
    stats,
    universeStats,
    baselineStats,
    excessHitRatePp,
    excessMedianReturn,
    symbolOccurrences,
    meetsConservativeCriteria: meets,
    conservativeVerdict: verdict,
  };
}

// ─── Comparison helper for the UI ─────────────────────────────────────────────

export interface BucketComparison {
  bucket: VolBucket;
  n: number;
  hitRate: number;
  medianReturn: number;
  probLossOver10: number;
}

/**
 * Hit rate by volatility bucket for a setup — the table that demonstrates
 * empirically that volatile names are less forecastable, rather than asserting it.
 */
export function compareAcrossVolBuckets(occurrences: Occurrence[]): BucketComparison[] {
  const buckets: VolBucket[] = ['calm', 'normal', 'volatile'];
  return buckets.map(bucket => {
    const subset = occurrences.filter(o => o.volBucket === bucket);
    const s = computeStats(subset.map(o => o.forwardReturn));
    return {
      bucket,
      n: s.n,
      hitRate: s.hitRate,
      medianReturn: s.medianReturn,
      probLossOver10: s.probLossOver10,
    };
  });
}
