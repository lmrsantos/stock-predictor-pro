// lib/setup-detector.ts
// ─────────────────────────────────────────────────────────────────────────────
// Detects objectively-defined setups in price history and emits occurrence
// records for the conditioned base-rate engine.
//
// LOOKAHEAD DISCIPLINE — the single most important property of this file:
// a setup at bar i may only read prices[0..i]. Forward returns are computed
// separately and are never visible to the detection functions. Any change that
// lets a detector see prices[i+1..] silently invalidates every downstream
// statistic, and the results will look excellent.
//
// Setups are defined from economic/behavioural rationale BEFORE testing, not
// discovered by scanning parameter space. Adding a setup means writing its
// rationale first.
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildProfile,
  annualizedVol,
  bucketVol,
  bucketListing,
  type Occurrence,
  type VolBucket,
  type ListingBucket,
} from "./conditioned-base-rates";
import { analyzeTrendTermStructure } from "./trend-term-structure";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SymbolSeries {
  symbol: string;
  dates: string[];
  closes: number[];
  /** Years since the real listing (IPO) date, or null when unknown.
   *  NEVER derived from how many price bars are available. */
  listingYears: number | null;
  sector: string;
}

export interface SetupDefinition {
  name: string;
  rationale: string;
  /** Bars of history required before the setup can be evaluated at all. */
  minBars: number;
  /**
   * Returns true when the setup holds AT bar i.
   * MUST only read closes[0..i]. Never closes[i+1] or beyond.
   */
  test: (closes: number[], i: number, ctx: DetectorContext) => boolean;
}

export interface DetectorContext {
  /** Sector composite daily returns aligned to the symbol's dates, or null. */
  sectorCompositeReturns: number[] | null;
}

// ─── Helpers (all strictly backward-looking) ──────────────────────────────────

function sma(closes: number[], i: number, n: number): number {
  const start = Math.max(0, i - n + 1);
  const slice = closes.slice(start, i + 1);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function highest(closes: number[], i: number, n: number): number {
  const start = Math.max(0, i - n + 1);
  return Math.max(...closes.slice(start, i + 1));
}

function lowest(closes: number[], i: number, n: number): number {
  const start = Math.max(0, i - n + 1);
  return Math.min(...closes.slice(start, i + 1));
}

/** Realized vol over the n bars ending at i. */
function volAt(closes: number[], i: number, n: number): number {
  const start = Math.max(1, i - n + 1);
  const rets: number[] = [];
  for (let k = start; k <= i; k++) {
    if (closes[k] > 0 && closes[k - 1] > 0) rets.push(Math.log(closes[k] / closes[k - 1]));
  }
  if (rets.length < 5) return NaN;
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((s, r) => s + (r - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}

/** Slope of a simple linear fit over the n bars ending at i, normalized by price. */
function slopeAt(closes: number[], i: number, n: number): number {
  const start = Math.max(0, i - n + 1);
  const y = closes.slice(start, i + 1);
  const len = y.length;
  if (len < 3) return 0;
  const sx = ((len - 1) * len) / 2;
  const sxx = ((len - 1) * len * (2 * len - 1)) / 6;
  const sy = y.reduce((a, b) => a + b, 0);
  const sxy = y.reduce((s, v, k) => s + k * v, 0);
  const d = len * sxx - sx * sx;
  if (d === 0) return 0;
  const slope = (len * sxy - sx * sy) / d;
  return closes[i] > 0 ? slope / closes[i] : 0;
}

// ─── Setup definitions ────────────────────────────────────────────────────────
// Each has a written rationale. Do not add setups by parameter scanning.

export const SETUPS: SetupDefinition[] = [
  {
    name: "Compressed pullback in uptrend",
    rationale:
      "Volatility compression historically precedes expansion (vol clusters and " +
      "mean-reverts). Combined with an intact longer-term uptrend, the expansion " +
      "has historically resolved upward slightly more often than chance.",
    minBars: 220,
    test: (c, i) => {
      const high60 = highest(c, i, 60);
      const drawdown = (high60 - c[i]) / high60;
      const vShort = volAt(c, i, 20);
      const vLong = volAt(c, i, 100);
      if (!Number.isFinite(vShort) || !Number.isFinite(vLong) || vLong === 0) return false;
      const compression = vShort / vLong;
      const longSlope = slopeAt(c, i, 200);
      return drawdown >= 0.15 && drawdown <= 0.4 && compression < 0.7 && longSlope > 0;
    },
  },
  {
    name: "Short-term oversold in uptrend",
    rationale:
      "Short-horizon reversal is one of the more replicated anomalies: prices that " +
      "fall sharply over about a week tend to bounce slightly more often than chance, " +
      "attributed to liquidity provision being compensated. Restricted to names whose " +
      "longer trend is still up, to avoid catching falling knives.",
    minBars: 220,
    test: (c, i) => {
      if (i < 6) return false;
      const ret5 = (c[i] - c[i - 5]) / c[i - 5];
      const above200 = c[i] > sma(c, i, 200);
      return ret5 <= -0.07 && above200;
    },
  },
  {
    name: "Breakout from range",
    rationale:
      "Time-series momentum: a move above a multi-month high after a period of " +
      "range-bound trade has historically continued more often than it reversed, " +
      "at horizons of weeks to months. Requires prior contraction to distinguish " +
      "a genuine range break from ongoing trend continuation.",
    minBars: 140,
    test: (c, i) => {
      if (i < 130) return false;
      const priorHigh = highest(c, i - 1, 120);
      const priorLow = lowest(c, i - 1, 120);
      if (priorHigh <= 0) return false;
      const rangeWidth = (priorHigh - priorLow) / priorHigh;
      return c[i] > priorHigh && rangeWidth < 0.35;
    },
  },
  {
    name: "Trend pullback to moving average",
    rationale:
      "Trend-following logic: in an established uptrend, pullbacks toward a " +
      "medium-term moving average have historically been continuation points more " +
      "often than reversal points. Weakest of the four — included to test whether " +
      "the widely-believed pattern survives measurement.",
    minBars: 220,
    test: (c, i) => {
      const ma50 = sma(c, i, 50);
      const ma200 = sma(c, i, 200);
      if (ma50 <= 0) return false;
      const distToMa = Math.abs(c[i] - ma50) / ma50;
      return ma50 > ma200 && distToMa < 0.03 && c[i] < highest(c, i, 40);
    },
  },
  {
    name: "Sector-supported dip",
    rationale:
      "Cross-sectional: a name drawing down while its own sector composite is " +
      "holding up suggests idiosyncratic weakness rather than sector-wide repricing, " +
      "which historically mean-reverts more reliably than a broad sector decline.",
    minBars: 220,
    test: (c, i, ctx) => {
      if (!ctx.sectorCompositeReturns || i < 20) return false;
      const start = Math.max(0, i - 19);
      const sectorSum = ctx.sectorCompositeReturns.slice(start, i + 1).reduce((a, b) => a + b, 0);
      const ownRet20 = (c[i] - c[i - 20]) / c[i - 20];
      return ownRet20 <= -0.1 && sectorSum > 0;
    },
  },
];

// ─── Occurrence generation ────────────────────────────────────────────────────

export interface DetectionConfig {
  /** Forward horizon in trading days over which the return is measured. */
  horizonDays: number;
  /** Minimum bars between two occurrences of the same setup on the same symbol.
   *  Prevents the same episode being counted many times, which would make n
   *  look large while the effective independent sample stays small. */
  cooldownBars: number;
  /** Volatility cut points derived from the universe. */
  volCuts: { calmMax: number; normalMax: number };
}

export const DEFAULT_DETECTION: DetectionConfig = {
  horizonDays: 20,
  cooldownBars: 25,
  volCuts: { calmMax: 0.28, normalMax: 0.5 },
};

/**
 * Scan one symbol for all setups and emit occurrences.
 *
 * The volatility and listing buckets are computed AS OF the occurrence bar,
 * not from the whole series — a stock that was calm in 2023 and volatile in
 * 2025 contributes to different cells at different times, which is correct.
 */
export function detectOccurrencesForSymbol(
  series: SymbolSeries,
  ctx: DetectorContext,
  cfg: DetectionConfig = DEFAULT_DETECTION,
): Record<string, Occurrence[]> {
  const out: Record<string, Occurrence[]> = {};
  const { closes } = series;
  const lastEvaluable = closes.length - 1 - cfg.horizonDays;

  for (const setup of SETUPS) {
    const occurrences: Occurrence[] = [];
    let lastHit = -Infinity;

    for (let i = setup.minBars; i <= lastEvaluable; i++) {
      if (i - lastHit < cfg.cooldownBars) continue;
      if (!setup.test(closes, i, ctx)) continue;

      // Forward return — computed here, never visible to setup.test
      const entry = closes[i];
      const exit = closes[i + cfg.horizonDays];
      if (!(entry > 0) || !(exit > 0)) continue;
      const forwardReturn = (exit - entry) / entry;

      // Buckets as of this bar
      const volNow = volAt(closes, i, 60);
      if (!Number.isFinite(volNow)) continue;
      const volBucket: VolBucket = bucketVol(volNow, cfg.volCuts);

      // Listing age as of this bar: total listing years minus the time remaining.
      // null when the listing date is unknown — the dimension is then skipped.
      const yearsRemaining = (closes.length - 1 - i) / 252;
      const listingBucket: ListingBucket | null = series.listingYears == null
        ? null
        : bucketListing(Math.max(0, series.listingYears - yearsRemaining));

      // Trend term-structure state AS OF bar i — strictly backward-looking.
      const trendState = analyzeTrendTermStructure(closes, i).conditioningKey;
      const volListingKey = listingBucket ? `${volBucket}|${listingBucket}` : volBucket;

      occurrences.push({
        symbol: series.symbol,
        barIdx: i,
        forwardReturn,
        cellKey: `${volListingKey}|${trendState}`,
        volListingKey,
        volBucket,
        listingBucket,
        trendState,
      });
      lastHit = i;
    }

    out[setup.name] = occurrences;
  }

  return out;
}

/** Scan the whole universe. Returns setup name -> all occurrences across symbols. */
export function detectOccurrencesForUniverse(
  universe: SymbolSeries[],
  ctxBySymbol: Record<string, DetectorContext>,
  cfg: DetectionConfig = DEFAULT_DETECTION,
): Record<string, Occurrence[]> {
  const merged: Record<string, Occurrence[]> = {};
  for (const setup of SETUPS) merged[setup.name] = [];

  for (const series of universe) {
    const ctx = ctxBySymbol[series.symbol] ?? { sectorCompositeReturns: null };
    const perSetup = detectOccurrencesForSymbol(series, ctx, cfg);
    for (const [name, occs] of Object.entries(perSetup)) {
      merged[name] = merged[name].concat(occs);
    }
  }
  return merged;
}

/**
 * Which setups match RIGHT NOW (at the last bar) for a symbol.
 * Note this uses the final bar, where no forward return exists — that is the
 * point: it is the live signal, evaluated against historical base rates.
 */
export function detectCurrentSetups(series: SymbolSeries, ctx: DetectorContext): { name: string; rationale: string }[] {
  const i = series.closes.length - 1;
  return SETUPS.filter((s) => i >= s.minBars && s.test(series.closes, i, ctx)).map((s) => ({
    name: s.name,
    rationale: s.rationale,
  }));
}

/**
 * Unconditional forward returns over the same population and period — every
 * evaluable bar, no setup filter, sampled at `stride` to keep windows from
 * overlapping heavily.
 *
 * This is the comparison point every setup must beat. Control testing showed
 * that uptrend-conditioned setups score ~55% on pure random walks through path
 * selection alone, so absolute hit rates are uninterpretable without it.
 *
 * Pass `volBucket` / `listingBucket` to restrict the baseline to the same cell
 * as the setup being evaluated — an apples-to-apples comparison.
 */
export function sampleBaselineReturns(
  universe: SymbolSeries[],
  cfg: DetectionConfig = DEFAULT_DETECTION,
  filter?: { volBucket?: VolBucket; listingBucket?: ListingBucket },
  stride = 5,
): number[] {
  const out: number[] = [];
  const minBar = Math.min(...SETUPS.map((s) => s.minBars));

  for (const series of universe) {
    const { closes } = series;
    const lastEvaluable = closes.length - 1 - cfg.horizonDays;

    for (let i = minBar; i <= lastEvaluable; i += stride) {
      const entry = closes[i];
      const exit = closes[i + cfg.horizonDays];
      if (!(entry > 0) || !(exit > 0)) continue;

      if (filter?.volBucket) {
        const v = volAt(closes, i, 60);
        if (!Number.isFinite(v) || bucketVol(v, cfg.volCuts) !== filter.volBucket) continue;
      }
      if (filter?.listingBucket) {
        if (series.listingYears == null) continue;
        const yearsRemaining = (closes.length - 1 - i) / 252;
        const yrs = Math.max(0, series.listingYears - yearsRemaining);
        if (bucketListing(yrs) !== filter.listingBucket) continue;
      }

      out.push((exit - entry) / entry);
    }
  }
  return out;
}

/** Universe volatilities as of the last bar — feed to deriveVolCuts(). */
export function universeVolatilities(universe: SymbolSeries[]): number[] {
  return universe.map((s) => annualizedVol(s.closes, 60)).filter((v) => Number.isFinite(v) && v > 0);
}

/** Convenience: profile for a symbol as of its last bar. */
export function profileForSymbol(series: SymbolSeries, volCuts: { calmMax: number; normalMax: number }) {
  const trendState = analyzeTrendTermStructure(series.closes).conditioningKey;
  return buildProfile(series.closes, series.listingYears, volCuts, trendState);
}
