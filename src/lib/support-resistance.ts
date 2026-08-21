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

  /** Nearest level below / above price — what "Support"/"Resistance" means. */
  support: number;
  resistance: number;
  supportSource: string;
  resistanceSource: string;

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
  const closes = input.closes.filter((c) => Number.isFinite(c) && c > 0);
  if (closes.length < 20) return null;

  const currentPrice = closes[closes.length - 1];
  const atr = atr14(closes, input.highs, input.lows);
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
      input.dates.slice(-closes.length),
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

  const below: { v: number; src: string }[] = [
    { v: lastPivotLow ?? NaN, src: "last swing low" },
    { v: projectedTrough, src: "projected cycle trough" },
    { v: sma50, src: "50d MA" },
    { v: recentLow, src: "60-bar low" },
    { v: currentPrice - 2 * atr, src: "2×ATR band" },
  ].filter((c) => Number.isFinite(c.v) && c.v > 0 && c.v < currentPrice);

  const above: { v: number; src: string }[] = [
    { v: lastPivotHigh ?? NaN, src: "last swing high" },
    { v: projectedPeak, src: "projected cycle peak" },
    { v: recentHigh, src: "60-bar high" },
    { v: currentPrice + 2 * atr, src: "2×ATR band" },
  ].filter((c) => Number.isFinite(c.v) && c.v > currentPrice);

  // Nearest level on each side is what price must actually trade through.
  const supportPick = below.length
    ? below.reduce((best, c) => (c.v > best.v ? c : best))
    : { v: currentPrice - 2 * atr, src: "2×ATR band" };
  const resistancePick = above.length
    ? above.reduce((best, c) => (c.v < best.v ? c : best))
    : { v: currentPrice + 2 * atr, src: "2×ATR band" };

  return {
    currentPrice,
    atr,
    sma20,
    sma50,
    support: supportPick.v,
    resistance: resistancePick.v,
    supportSource: supportPick.src,
    resistanceSource: resistancePick.src,
    projectedTrough,
    projectedPeak,
    troughConfidence,
    peakConfidence,
    cycleConfidence: (troughConfidence + peakConfidence) / 2,
    lastPivotLow,
    lastPivotHigh,
  };
}
