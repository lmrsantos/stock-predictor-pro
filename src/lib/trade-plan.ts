import type { StockDataPoint } from "./types";
import { backtest, type BacktestDataPoint } from "./backtest";
import { computeStructuralLevels } from "./support-resistance";

/**
 * Rule-based trade plan generator (educational, not investment advice).
 *
 * All levels are derived from live price data:
 *  - Volatility unit  : 14-period ATR (Wilder-style simple average of true range)
 *  - Support/resistance: zigzag cycle pivots (src/lib/cycle-analysis.ts) blended
 *                        with the 20/50-day moving averages
 *  - 30d expectation  : the 5-model calibration ensemble (src/lib/backtest.ts),
 *                        the same single-source-of-truth engine used elsewhere
 *  - Stop / targets   : ATR multiples clamped by structural levels
 */

export type RiskTolerance = "conservative" | "moderate" | "aggressive";
export type Horizon = "swing" | "position" | "long";
export type PlanAction = "accumulate" | "hold" | "trim" | "exit" | "wait";

export interface TradePlanInput {
  ticker: string;
  shares: number;
  avgCost: number;
  data: StockDataPoint[];
  risk: RiskTolerance;
  horizon: Horizon;
}

export interface TradePlan {
  ticker: string;
  currentPrice: number;
  avgCost: number;
  shares: number;
  unrealizedPct: number;

  atr: number;
  atrPct: number;
  sma20: number;
  sma50: number;
  support: number;
  resistance: number;

  /** Calibration-engine 30-day expected price (mean of forecast cone). */
  expected30d: number;
  expected30dPct: number;

  entryLow: number;
  entryHigh: number;
  stop: number;
  stopPct: number;
  target1: number;
  target1Pct: number;
  target2: number;
  target2Pct: number;
  riskReward: number;

  action: PlanAction;
  trend: "up" | "down" | "flat";
  confidence: "high" | "moderate" | "low";
  rationale: string[];
}

const RISK_ATR: Record<RiskTolerance, { stop: number; t1: number; t2: number }> = {
  conservative: { stop: 1.0, t1: 1.2, t2: 2.0 },
  moderate: { stop: 2.0, t1: 2.5, t2: 4.5 },
  aggressive: { stop: 3.5, t1: 5.0, t2: 9.0 },
};


const HORIZON_SCALE: Record<Horizon, number> = {
  swing: 0.7,
  position: 1,
  long: 1.6,
};

function sma(values: number[], period: number): number {
  if (!values.length) return 0;
  const slice = values.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

function averageTrueRange(data: StockDataPoint[], period = 14): number {
  if (data.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const prevClose = data[i - 1].close;
    const tr = Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - prevClose),
      Math.abs(data[i].low - prevClose),
    );
    if (Number.isFinite(tr)) trs.push(tr);
  }
  if (!trs.length) return 0;
  return sma(trs, period);
}

export function computeTradePlan(input: TradePlanInput): TradePlan | null {
  const clean = input.data.filter((d) => Number.isFinite(d.close) && d.close > 0);
  if (clean.length < 40) return null;

  const closes = clean.map((d) => d.close);
  const currentPrice = closes[closes.length - 1];
  const atrRaw = averageTrueRange(clean);
  // Guard against zero-volatility / index-like series
  const atr = atrRaw > 0 ? atrRaw : currentPrice * 0.02;
  const atrPct = atr / currentPrice;

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);

  // ── Structure: shared single source of truth (src/lib/support-resistance.ts) ──
  const levels = computeStructuralLevels({
    ticker: input.ticker,
    closes,
    dates: clean.map((d) => d.date),
    highs: clean.map((d) => d.high),
    lows: clean.map((d) => d.low),
  });

  const support = levels?.support ?? currentPrice - 2 * atr;
  const resistance = levels?.resistance ?? currentPrice + 2 * atr;
  const cycleConfidence = levels?.cycleConfidence ?? 0;


  // ── 30d expectation from the calibration ensemble ──
  let expected30d = currentPrice;
  let calibrationR2 = 0;
  try {
    const points: BacktestDataPoint[] = clean.map((d) => ({
      date: d.date,
      timestamp: new Date(d.date).getTime(),
      actual: d.close,
    }));
    if (points.length >= 60) {
      const bt = backtest(points, 6, 30);
      expected30d = bt.forecastPoints.at(-1)?.mean ?? currentPrice;
      calibrationR2 = bt.winningModel.rSquared;
    }
  } catch {
    // leave expected30d flat
  }
  const expected30dPct = (expected30d - currentPrice) / currentPrice;

  // ── Levels ──
  const mult = RISK_ATR[input.risk];
  const scale = HORIZON_SCALE[input.horizon];

  // Entry zone widens with risk appetite and horizon
  const entryLow = input.risk === "aggressive"
    ? currentPrice - mult.stop * atr * 0.5 * scale
    : Math.max(support * (1 - 0.02 * (scale - 1)), currentPrice - mult.stop * atr * 0.6 * scale);
  const entryHigh = Math.max(entryLow * 1.001, currentPrice - 0.2 * atr * scale);

  // Stop: conservative keeps it tight (ATR only), wider profiles sit under support.
  // The structural floor loosens with the horizon so longer holds tolerate more noise.
  const atrStop = currentPrice - mult.stop * atr * scale;
  const structuralBuffer = input.risk === "aggressive" ? 0.04 : 0.015;
  const supportFloor =
    input.risk === "conservative" ? Infinity : support * (1 - structuralBuffer * scale);
  const stop = Math.max(0.01, Math.min(atrStop, supportFloor));

  const atrT1 = currentPrice + mult.t1 * atr * scale;
  const atrT2 = currentPrice + mult.t2 * atr * scale;
  // Conservative books into resistance; moderate respects it loosely; aggressive runs past it.
  // The resistance cap stretches with the horizon so swing/position/long differ.
  const resistanceCap = resistance * (1 + 0.03 * (scale - 1));
  const target1Base =
    input.risk === "conservative"
      ? Math.min(atrT1, Math.max(resistanceCap, currentPrice * 1.005))
      : input.risk === "moderate"
        ? Math.min(atrT1, Math.max(resistanceCap * 1.02, currentPrice * 1.01))
        : atrT1;
  // Never let the structural clamp collapse the horizon difference entirely
  const target1Floor = currentPrice + mult.t1 * atr * scale * 0.5;
  const target1Final = Math.max(target1Base, target1Floor);
  const target2 = Math.max(atrT2, target1Final * 1.02);




  const risk = currentPrice - stop;
  const reward = target1Final - currentPrice;
  const riskReward = risk > 0 ? reward / risk : 0;

  // ── Trend classification ──
  const trend: TradePlan["trend"] =
    sma20 > sma50 * 1.005 && currentPrice > sma20
      ? "up"
      : sma20 < sma50 * 0.995 && currentPrice < sma20
        ? "down"
        : "flat";

  const unrealizedPct = input.avgCost > 0 ? (currentPrice - input.avgCost) / input.avgCost : 0;

  // ── Action ──
  let action: PlanAction;
  if (currentPrice <= stop) action = "exit";
  else if (trend === "down" && expected30dPct < -0.02) action = unrealizedPct < 0 ? "exit" : "trim";
  else if (currentPrice >= target2 * 0.99) action = "trim";
  else if (trend === "up" && expected30dPct > 0.01 && currentPrice <= entryHigh) action = "accumulate";
  else if (trend === "up" && expected30dPct > 0.01) action = "hold";
  else if (trend === "flat") action = "wait";
  else action = "hold";

  const confidence: TradePlan["confidence"] =
    calibrationR2 > 0.6 && cycleConfidence > 55
      ? "high"
      : calibrationR2 > 0.3 || cycleConfidence > 40
        ? "moderate"
        : "low";

  const rationale: string[] = [
    `ATR(14) = $${atr.toFixed(2)} (${(atrPct * 100).toFixed(1)}% of price) sets the volatility unit.`,
    `Trend: 20d SMA $${sma20.toFixed(2)} vs 50d SMA $${sma50.toFixed(2)} → ${trend === "up" ? "rising" : trend === "down" ? "falling" : "sideways"}.`,
    `Structure: support $${support.toFixed(2)}, resistance $${resistance.toFixed(2)} from cycle pivots and the 60-day range.`,
    `Calibration engine 30d expectation: $${expected30d.toFixed(2)} (${expected30dPct >= 0 ? "+" : ""}${(expected30dPct * 100).toFixed(1)}%), model R² ${calibrationR2.toFixed(2)}.`,
    `Risk/reward to first target: ${riskReward.toFixed(2)}:1 at ${input.risk} sizing, ${input.horizon} horizon.`,
  ];

  return {
    ticker: input.ticker,
    currentPrice,
    avgCost: input.avgCost,
    shares: input.shares,
    unrealizedPct,
    atr,
    atrPct,
    sma20,
    sma50,
    support,
    resistance,
    expected30d,
    expected30dPct,
    entryLow,
    entryHigh,
    stop,
    stopPct: (stop - currentPrice) / currentPrice,
    target1: target1Final,
    target1Pct: (target1Final - currentPrice) / currentPrice,
    target2,
    target2Pct: (target2 - currentPrice) / currentPrice,
    riskReward,
    action,
    trend,
    confidence,
    rationale,
  };
}
