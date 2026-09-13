import { analyzeCycles } from "./cycle-analysis";

/**
 * Single source of truth for structural support / resistance.
 *
 * Two different questions were previously answered by two different code paths,
 * which is why the Trade Plan panel and the Cycle tab of the Symbol Backtest
 * disagreed:
 *
 *  1. "Where is the nearest level price has to trade through?"  → ACTIVE
 *     support/resistance. Blends the latest confirmed zigzag pivots with the
 *     50-day moving average, the 60-bar range and an ATR band, then clamps so
 *     support ≤ current price ≤ resistance.
 *  2. "Where would the NEXT cycle low / high land if the cycle keeps growing at
 *     its average rate?" → PROJECTED trough/peak (geometric extrapolation from
 *     cycle-analysis.ts). Always a forecast, never a level price is sitting on.
 *
 * Both are returned here so every surface can show the same numbers with the
 * same labels. Anything showing "Support" / "Resistance" must use the ACTIVE
 * values; anything showing a cycle forecast must label it as projected.
 */

/** Shared swing size so cycle pivots are identical across every surface. */
export const SR_SWING_THRESHOLD = 0.08;

/** Canonical structural-level window: approximately one trading year. */
export const SR_LOOKBACK_BARS = 252;

export interface StructuralLevelsInput {
  ticker: string;
  closes: number[];
  dates: string[];
  highs?: number[];
  lows?: number[];
  /** Zigzag swing size; defaults to SR_SWING_THRESHOLD. */
  swingThreshold?: number;
}

export interface StructuralLevels {
  currentPrice: number;
  atr: number;
  sma20: number;
  sma50: number;

  /** Confluence level below / above price — what "Support"/"Resistance" means. */
  support: number;
  resistance: number;
  supportSource: string;
  resistanceSource: string;
  /** How many individual measures landed in the winning cluster. */
  supportCount: number;
  resistanceCount: number;
  /** src values of every candidate in the winning cluster, in order. */
  supportMethodNames: string[];
  resistanceMethodNames: string[];
  /**
   * Distinct method TYPES in the winning cluster (structure / trend /
   * volatility). Three structure-type levels agreeing is one kind of
   * evidence, not three — this is the headline count.
   */
  supportGroupCount: number;
  resistanceGroupCount: number;

  /** Cycle extrapolation (forecast, may sit far from price). */
  projectedTrough: number;
  projectedPeak: number;
  troughConfidence: number;
  peakConfidence: number;
  cycleConfidence: number;

  /** Latest confirmed pivots used as structure. */
  lastPivotLow: number | null;
  lastPivotHigh: number | null;
}

function sma(values: number[], period: number): number {
  if (!values.length) return 0;
  const slice = values.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

function atr14(closes: number[], highs?: number[], lows?: number[]): number {
  const last = closes[closes.length - 1] ?? 0;
  if (!highs || !lows || highs.length !== closes.length || lows.length !== closes.length) {
    // Fall back to a close-to-close true-range proxy
    const trs: number[] = [];
    for (let i = 1; i < closes.length; i++) trs.push(Math.abs(closes[i] - closes[i - 1]));
    const v = sma(trs, 14);
    return v > 0 ? v : last * 0.02;
  }
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - prev), Math.abs(lows[i] - prev));
    if (Number.isFinite(tr)) trs.push(tr);
  }
  const v = sma(trs, 14);
  return v > 0 ? v : last * 0.02;
}

export function computeStructuralLevels(input: StructuralLevelsInput): StructuralLevels | null {
  // Normalize every caller to the same aligned observations and lookback.
  // This prevents a 1y Trade Plan and 2y Cycle screen from choosing different
  // zigzag pivots for the same symbol and date.
  const observations = input.closes
    .map((close, index) => ({
      close,
      date: input.dates[index],
      high: input.highs?.[index],
      low: input.lows?.[index],
    }))
    .filter((row) => Number.isFinite(row.close) && row.close > 0 && Boolean(row.date))
    .slice(-SR_LOOKBACK_BARS);

  const closes = observations.map((row) => row.close);
  if (closes.length < 20) return null;

  const dates = observations.map((row) => row.date);
  const hasCompleteOhlc = observations.every(
    (row) => Number.isFinite(row.high) && Number.isFinite(row.low),
  );
  const highs = hasCompleteOhlc ? observations.map((row) => Number(row.high)) : undefined;
  const lows = hasCompleteOhlc ? observations.map((row) => Number(row.low)) : undefined;

  const currentPrice = closes[closes.length - 1];
  const atr = atr14(closes, highs, lows);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);

  let projectedTrough = currentPrice * 0.95;
  let projectedPeak = currentPrice * 1.05;
  let troughConfidence = 0;
  let peakConfidence = 0;
  let lastPivotLow: number | null = null;
  let lastPivotHigh: number | null = null;

  try {
    const cycle = analyzeCycles(
      input.ticker,
      closes,
      dates,
      input.swingThreshold ?? SR_SWING_THRESHOLD,
    );
    projectedTrough = cycle.projection.nextTrough;
    projectedPeak = cycle.projection.nextPeak;
    troughConfidence = cycle.projection.troughConfidence;
    peakConfidence = cycle.projection.peakConfidence;
    lastPivotLow = cycle.troughs.at(-1)?.price ?? null;
    lastPivotHigh = cycle.peaks.at(-1)?.price ?? null;
  } catch {
    // structural levels fall back to range / ATR below
  }

  const recent = closes.slice(-60);
  const recentLow = Math.min(...recent);
  const recentHigh = Math.max(...recent);

  // Projected trough/peak are deliberately NOT candidates here. Support and
  // resistance mean "the nearest level price must trade through"; a cycle
  // extrapolation is a forecast, and when it happened to land near price it
  // won the nearest-level contest and a forecast was rendered under a
  // structural label. They stay in the returned object for display only.
  // Method types: structure = swing pivots and range extremes, trend = moving
  // average, volatility = ATR band. Three structure-type levels agreeing is
  // one kind of evidence, not three.
  type MethodType = "structure" | "trend" | "volatility";
  const below: { v: number; src: string; type: MethodType }[] = [
    { v: lastPivotLow ?? NaN, src: "last swing low", type: "structure" },
    { v: sma50, src: "50-day average", type: "trend" },
    { v: recentLow, src: "60-bar low", type: "structure" },
    { v: currentPrice - 2 * atr, src: "2×ATR band", type: "volatility" },
  ].filter((c) => Number.isFinite(c.v) && c.v > 0 && c.v < currentPrice);

  const above: { v: number; src: string; type: MethodType }[] = [
    { v: lastPivotHigh ?? NaN, src: "last swing high", type: "structure" },
    { v: recentHigh, src: "60-bar high", type: "structure" },
    { v: currentPrice + 2 * atr, src: "2×ATR band", type: "volatility" },
  ].filter((c) => Number.isFinite(c.v) && c.v > currentPrice);

  // Confluence clustering: group candidates within 0.75×ATR of each other,
  // prefer the cluster with the most independent measures, break ties by
  // proximity to price. The level is the cluster average.
  const pickByConfluence = (
    candidates: { v: number; src: string }[],
    fallback: { v: number; src: string },
  ): { v: number; src: string; count: number } => {
    const list = candidates.length ? candidates : [fallback];
    const sorted = [...list].sort((a, b) => a.v - b.v);
    const tolerance = Math.max(atr * 0.75, currentPrice * 0.005);

    const clusters: { members: { v: number; src: string }[] }[] = [];
    for (const c of sorted) {
      const last = clusters[clusters.length - 1];
      if (last && c.v - last.members[last.members.length - 1].v <= tolerance) {
        last.members.push(c);
      } else {
        clusters.push({ members: [c] });
      }
    }

    const best = clusters
      .map((cl) => {
        const mean = cl.members.reduce((s, m) => s + m.v, 0) / cl.members.length;
        return { mean, count: cl.members.length, sources: cl.members.map((m) => m.src) };
      })
      .sort(
        (a, b) => b.count - a.count || Math.abs(a.mean - currentPrice) - Math.abs(b.mean - currentPrice),
      )[0];

    return { v: best.mean, src: best.sources.join(" + "), count: best.count };
  };

  const supportPick = pickByConfluence(below, { v: currentPrice - 2 * atr, src: "2×ATR band" });
  const resistancePick = pickByConfluence(above, { v: currentPrice + 2 * atr, src: "2×ATR band" });

  return {
    currentPrice,
    atr,
    sma20,
    sma50,
    support: supportPick.v,
    resistance: resistancePick.v,
    supportSource: supportPick.src,
    resistanceSource: resistancePick.src,
    supportCount: supportPick.count,
    resistanceCount: resistancePick.count,
    projectedTrough,
    projectedPeak,
    troughConfidence,
    peakConfidence,
    cycleConfidence: (troughConfidence + peakConfidence) / 2,
    lastPivotLow,
    lastPivotHigh,
  };
}
