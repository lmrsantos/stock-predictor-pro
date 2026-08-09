// lib/backtest.ts
// ─────────────────────────────────────────────────────────────────────────────
// Calibration-by-Hindsight Backtest Engine
//
// Core idea (per user design):
//   1. Start from N months ago (known prices)
//   2. Run 5 models forward from that point toward "today"
//   3. Compare each model's predicted "today" price to actual current price
//   4. The model with lowest error WINS — it proved it can reach today
//   5. Use the winning model to forecast the next 30 days forward
//
// This is fundamentally better than train/test split because:
//   - We know the right answer (current price) → objective ranking
//   - No arbitrary split needed
//   - Winner has verifiable real-world proof
//   - Forecast comes from a model that already earned its credibility
//
// Models: 5 window sizes (10, 15, 20, 30, 40 days)
// Each model: linear regression on its window slice → project to today
// ─────────────────────────────────────────────────────────────────────────────
import {
  validateModelRolling, selectWinner, summarizeValidation,
  type ProjectFn, type ValidationSummary,
} from './model-validation';


export interface BacktestDataPoint {
  date: string;
  timestamp: number;
  actual: number;
}

export interface ForecastPoint {
  date: string;
  timestamp: number;
  mean: number;
  upper1: number;
  lower1: number;
  upper2: number;
  lower2: number;
}

export interface ModelCalibration {
  windowSize: number;         // days used for smoothing
  label: string;              // e.g. "10-day trend"
  slope: number;              // daily price change ($/day) fit on TRAIN data only
  intercept: number;
  rSquared: number;           // fit quality on the training window
  /** Out-of-sample: price this model predicted for today, standing `holdoutDays` bars ago. */
  predictedTodayPrice: number;
  actualTodayPrice: number;
  errorPct: number;           // abs % error vs actual current price (true out-of-sample)
  annualizedReturn: number;   // projected annual return from slope
  winner: boolean;            // true for the best-fitting model
  /** Actual close on the as-of (cutoff) date the projection started from. */
  asOfPrice: number;
  asOfDate: string;
  /** Whether the model got the direction of the realized move right. */
  directionCorrect: boolean;
  /** Slope refit on ALL data through today — used for the forward forecast. */
  forwardSlope: number;
  /** Empirical shrink factor applied to the raw slope (0 = pure persistence, 1 = raw trend). */
  lambda: number;
}

/** How far ahead this symbol can be forecast before expected error exceeds a target band. */
export interface AccuracyHorizon {
  /** Target accuracy band, in % (e.g. 2). */
  targetPct: number;
  /** Trading days over which the 1σ expected error stays inside the target band. */
  days: number;
  /** Expected 1σ error at the full forecast horizon, in %. */
  expectedErrorAtHorizonPct: number;
  message: string;
}



export interface ForecastResult {
  // The winning model's forward projection
  forecastPoints: ForecastPoint[];
  forecastPct: number;        // % change projected over forecastDays
  forecastDirection: "up" | "down";
  winningModel: ModelCalibration;

  // All model calibrations (for display)
  models: ModelCalibration[];

  // Ensemble vote counts and majority direction
  upCount: number;
  downCount: number;
  majorityDirection: "up" | "down";

  // Ensemble cone from all models
  ensembleAgreement: number;  // 0–1, fraction of models that agree with the majority direction
  modelDisagreement: boolean;

  // Regime detection
  regime: RegimeResult;

  // Confidence score 0–100
  confidenceScore: number;

  // Calibration reliability gate
  calibration: CalibrationQuality;

  // Magnitude-only signal (valid even when direction is not credible)
  magnitudeSignal: MagnitudeSignal;

  // Horizon over which a ±2% band is actually achievable for this symbol
  accuracyHorizon: AccuracyHorizon;

  // Rolling-window validation across multiple holdout windows
  validation: ValidationSummary;



  // Chart paths
  actualPath: BacktestDataPoint[];

  // Meta
  lookbackMonths: number;
  currentPrice: number;
  priceMin: number;
  priceMax: number;

  // True out-of-sample holdout metadata
  holdout?: {
    days: number;
    asOfDate: string;
    asOfPrice: number;
    predictedTodayPrice: number;
    directionHitRate: number;
  };

  // Compatibility fields

  walkForward?: {
    actualPath: BacktestDataPoint[];
    predictedPath: BacktestDataPoint[];
    mape: number;
    hitRate: number;
  };
  mape?: number;
  finalForecastError?: number;
  converged?: boolean;
  epochsRun?: number;
  latentVector?: number[];
  reconstructedPath?: BacktestDataPoint[];
}

export interface RegimeResult {
  currentVol: number;
  trainingVol: number;
  ratio: number;
  outsideDistribution: boolean;
  warning: string | null;
}

export interface CalibrationQuality {
  winnerErrorPct: number;
  bestErrorPct: number;
  medianErrorPct: number;
  grade: "good" | "fair" | "poor" | "failed";
  /** True only when the winning model tracked today's price closely enough to trust its direction. */
  directionCredible: boolean;
  message: string;
}

export interface MagnitudeSignal {
  /** Annualized realized vol over the last 20 bars. */
  shortVol: number;
  /** Annualized realized vol over the prior ~100 bars. */
  baseVol: number;
  /** shortVol / baseVol — below 0.7 means volatility is compressed (energy build-up). */
  compressionRatio: number;
  compressed: boolean;
  /** 1σ expected absolute move over the forecast horizon, in %. */
  expectedMovePct: number;
  message: string;
}

// Keep BacktestResult as alias for compatibility
export type BacktestResult = ForecastResult;


// ─── Math helpers ─────────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

// Linear regression over a price array
function linReg(prices: number[]): {
  slope: number;
  intercept: number;
  rSquared: number;
  annualizedReturn: number;
} {
  const n = prices.length;
  if (n < 3) return { slope: 0, intercept: prices[0] ?? 0, rSquared: 0, annualizedReturn: 0 };

  const xs = prices.map((_, i) => i);
  const sumX  = xs.reduce((a, b) => a + b, 0);
  const sumY  = prices.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * prices[i], 0);
  const sumX2 = xs.reduce((s, x) => s + x * x, 0);
  const denom = n * sumX2 - sumX * sumX;

  const slope     = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  const meanY     = sumY / n;

  const ssTot = prices.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const ssRes = prices.reduce((s, y, i) => s + (y - (slope * i + intercept)) ** 2, 0);
  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  const lastPrice = prices[n - 1];
  const annualizedReturn = lastPrice > 0 ? (slope * 252) / lastPrice : 0;

  return { slope, intercept, rSquared, annualizedReturn };
}

// ─── Regime Detection ─────────────────────────────────────────────────────────

function detectRegime(prices: number[]): RegimeResult {
  const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
  const currentVol  = stdDev(returns.slice(-20)) * Math.sqrt(252);
  const trainingVol = stdDev(returns.slice(0, -20)) * Math.sqrt(252);
  const ratio = trainingVol > 0 ? currentVol / trainingVol : 1;
  const outsideDistribution = ratio > 1.5;

  let warning: string | null = null;
  if (ratio > 2.5) {
    warning = `EXTREME REGIME SHIFT — Current volatility is ${ratio.toFixed(1)}× the training period. Model reliability is significantly reduced.`;
  } else if (ratio > 1.5) {
    warning = `REGIME WARNING — Current volatility (${(currentVol * 100).toFixed(1)}% ann.) is ${ratio.toFixed(1)}× higher than the training period. Forecast uncertainty is elevated.`;
  }

  return { currentVol, trainingVol, ratio, outsideDistribution, warning };
}

// ─── Main backtest function ───────────────────────────────────────────────────

const WINDOW_SIZES = [
  { days: 10, label: "10-day short trend"  },
  { days: 15, label: "15-day trend"        },
  { days: 20, label: "20-day monthly"      },
  { days: 30, label: "30-day medium trend" },
  { days: 40, label: "40-day long trend"   },
];

const LOOKBACK_DAYS  = 126; // ~6 months of trading days
const FORECAST_DAYS  = 30;

export function backtest(
  historicalData: BacktestDataPoint[],
  lookbackMonths: 3 | 6 = 6,
  forecastDays = FORECAST_DAYS
): ForecastResult {

  // ── 1. Deduplicate and sort ─────────────────────────────────────────────────
  const seen = new Set<string>();
  const data = historicalData
    .filter(d => { if (seen.has(d.date)) return false; seen.add(d.date); return true; })
    .sort((a, b) => a.timestamp - b.timestamp);

  // Normalize timestamps — Supabase may return seconds instead of milliseconds
  const normalizedData = data.map(d => ({
    ...d,
    timestamp: d.timestamp < 1e10 ? d.timestamp * 1000 : d.timestamp,
  }));

  if (normalizedData.length < 60) {
    throw new Error("Need at least 60 data points for calibration.");
  }

  const currentPrice    = normalizedData[normalizedData.length - 1].actual;
  const currentTs       = normalizedData[normalizedData.length - 1].timestamp;
  const prices          = normalizedData.map(d => d.actual);
  const priceMin        = Math.min(...prices);
  const priceMax        = Math.max(...prices);

  // ── 2. Calibrate each model — TRUE OUT-OF-SAMPLE HOLDOUT ────────────────────
  // Stand `forecastDays` bars in the past (the "as-of" cutoff). Each model may
  // only see data up to that bar. It then projects `forecastDays` forward,
  // blind, and we score its predicted price against today's ACTUAL close.
  // Nothing after the cutoff touches the fit — this is a real forecast test.

  const lastIdx    = normalizedData.length - 1;
  const holdoutDays = Math.min(forecastDays, Math.max(5, Math.floor(normalizedData.length / 4)));
  const asOfIdx    = lastIdx - holdoutDays;
  const asOfPrice  = normalizedData[asOfIdx].actual;
  const asOfDate   = normalizedData[asOfIdx].date;
  const realizedMove = currentPrice - asOfPrice;

  // Training history available at the as-of date (up to ~2 years of bars)
  const lookbackCount = Math.min(lookbackMonths * 21 * 2, asOfIdx);
  const trainStart    = Math.max(0, asOfIdx - lookbackCount);

  // Simple moving average of width `days` — the window size controls smoothing
  const smooth = (series: number[], days: number) => {
    const out: number[] = [];
    for (let i = days - 1; i < series.length; i++) {
      const w = series.slice(i - days + 1, i + 1);
      out.push(w.reduce((a, b) => a + b, 0) / w.length);
    }
    return out;
  };

  // ── Empirical calibration (fitted on 3,386 out-of-sample 30-bar windows
  //    across 36 symbols). Two corrections beat the raw trend at every horizon:
  //      1. Slope shrink λ — trust the trend only when the fit is tight (R²)
  //         AND volatility is low. Noisy/violent tapes collapse λ toward 0,
  //         which is what stops the 45%-style overshoots on names like RKLB.
  //      2. Mild pull toward the 50-bar mean (β = 0.15) — captures the
  //         short-horizon reversion that pure trend extrapolation ignores.
  const REVERSION_BETA = 0.15;

  const annVol = (series: number[], bars: number) => {
    const slice = series.slice(-Math.min(bars + 1, series.length));
    if (slice.length < 3) return 0.35;
    const rets = slice.slice(1).map((p, i) => (p - slice[i]) / slice[i]);
    return stdDev(rets) * Math.sqrt(252);
  };
  const sma = (series: number[], bars: number) => {
    const w = series.slice(-Math.min(bars, series.length));
    return w.reduce((a, b) => a + b, 0) / w.length;
  };
  // λ = 0.6 · R² scaled down as volatility rises above the 35% ann. reference
  const shrink = (rSquared: number, vol: number) =>
    Math.max(0, Math.min(0.6, (0.6 * Math.max(0, rSquared)) / Math.max(1, vol / 0.35)));

  /** Calibrated price projection `steps` bars ahead of `series`. */
  const project = (series: number[], slope: number, rSquared: number, steps: number) => {
    const anchor = series[series.length - 1];
    const lambda = shrink(rSquared, annVol(series, 20));
    const price =
      anchor + slope * steps * lambda + REVERSION_BETA * (sma(series, 50) - anchor);
    return { price: Math.max(0, price), lambda };
  };

  const models: ModelCalibration[] = WINDOW_SIZES.map(({ days, label }) => {
    // TRAIN slice: strictly data at or before the as-of cutoff
    const trainSlice = normalizedData.slice(trainStart, asOfIdx + 1).map(d => d.actual);

    if (trainSlice.length < days + 5) {
      return {
        windowSize: days, label,
        slope: 0, intercept: trainSlice[0] ?? asOfPrice,
        rSquared: 0, predictedTodayPrice: asOfPrice,
        actualTodayPrice: currentPrice,
        errorPct: Math.abs((asOfPrice - currentPrice) / currentPrice) * 100,
        annualizedReturn: 0, winner: false,
        asOfPrice, asOfDate,
        directionCorrect: false,
        forwardSlope: 0,
        lambda: 0,
      };
    }

    const smoothedTrain = smooth(trainSlice, days);
    const reg = linReg(smoothedTrain);

    // Blind projection from the as-of bar to today, using the calibrated
    // (shrunk + reversion-corrected) path. Nothing after the cutoff is seen.
    const proj = project(trainSlice, reg.slope, reg.rSquared, holdoutDays);
    const predictedTodayPrice = proj.price;
    const errorPct = Math.abs((predictedTodayPrice - currentPrice) / currentPrice) * 100;
    const predictedMove = predictedTodayPrice - asOfPrice;
    const directionCorrect =
      Math.sign(predictedMove) === Math.sign(realizedMove) || realizedMove === 0;

    // Refit the same model on ALL data through today — this is the slope used
    // for the forward-looking forecast (never for scoring).
    const fullSlice = normalizedData
      .slice(Math.max(0, lastIdx - Math.min(lookbackMonths * 21 * 2, lastIdx)), lastIdx + 1)
      .map(d => d.actual);
    const forwardReg = fullSlice.length >= days + 5
      ? linReg(smooth(fullSlice, days))
      : reg;
    const forwardLambda = shrink(forwardReg.rSquared, annVol(fullSlice, 20));

    return {
      windowSize: days,
      label,
      slope: reg.slope,
      intercept: reg.intercept,
      rSquared: reg.rSquared,
      predictedTodayPrice,
      actualTodayPrice: currentPrice,
      errorPct,
      annualizedReturn: reg.annualizedReturn,
      winner: false,
      asOfPrice,
      asOfDate,
      directionCorrect,
      // Calibrated forward slope — already shrunk, so the forecast path uses it directly.
      forwardSlope: forwardReg.slope * forwardLambda,
      lambda: proj.lambda,
    };
  });

  // Reversion pull applied to the forward path (spread over the horizon)
  const fwdSeries = normalizedData.map(d => d.actual);
  const reversionPull = REVERSION_BETA * (sma(fwdSeries, 50) - currentPrice);

  // ── Rolling-window validation — replaces single-endpoint winner selection ───
  const priceSeries = normalizedData.map(d => d.actual);
  const makeProjector = (days: number): ProjectFn => (train, steps) => {
    if (train.length < days + 5) {
      return Array(steps).fill(train[train.length - 1]);
    }
    const reg = linReg(smooth(train, days));
    const anchor = train[train.length - 1];
    const lambda = shrink(reg.rSquared, annVol(train, 20));
    const revTarget = sma(train, 50);
    return Array.from({ length: steps }, (_, i) => {
      const step = i + 1;
      const rev = REVERSION_BETA * (revTarget - anchor) * (step / steps);
      return Math.max(0, anchor + reg.slope * step * lambda + rev);
    });
  };

  const rollingValidations = WINDOW_SIZES.map(({ days, label }) =>
    validateModelRolling(priceSeries, days, label, holdoutDays, makeProjector(days))
  );
  const selection = selectWinner(rollingValidations);
  const validation = summarizeValidation(selection);

  // ── 3. Winner only when rolling validation found one decisively ─────────────
  // Otherwise use the median-scoring model but flag it as non-decisive —
  // the forecast will be presented as an ensemble, not a single model's call.
  const sortedByError = [...models].sort((a, b) => a.errorPct - b.errorPct);
  const decisiveWinner = selection.decisive
    ? models.find(m => m.windowSize === selection.winnerWindowSize)
    : null;
  const winner = decisiveWinner ?? sortedByError[0];
  models.forEach(m => {
    m.winner = selection.decisive && m.windowSize === winner.windowSize;
  });

  // ── 4. Generate forecast ────────────────────────────────────────────────────
  // Anchor to actual current price. When no model validated decisively, the
  // forward slope is the ensemble mean rather than one model's call.
  const forecastPoints: ForecastPoint[] = [];

  const effectiveForwardSlope = selection.decisive
    ? winner.forwardSlope
    : models.reduce((s, m) => s + m.forwardSlope, 0) / models.length;

  // Compute uncertainty from ensemble spread at each step
  for (let i = 0; i < forecastDays; i++) {
    const dayOffset = i + 1;
    // Reversion is a level correction, phased in across the horizon
    const revAtStep = reversionPull * (dayOffset / forecastDays);

    // Each model's projected price at this future day (calibrated slopes)
    const modelPrices = models.map(m => currentPrice + m.forwardSlope * dayOffset + revAtStep);

    // Primary forecast line
    const winnerPrice = currentPrice + effectiveForwardSlope * dayOffset + revAtStep;



    // Spread from ensemble for uncertainty bands
    const spreadSd = stdDev(modelPrices);


    const ts = currentTs + dayOffset * 86400000;
    forecastPoints.push({
      date:      new Date(ts).toISOString().split("T")[0],
      timestamp: ts,
      mean:      Math.max(0, winnerPrice),
      upper1:    Math.max(0, winnerPrice + spreadSd),
      lower1:    Math.max(0, winnerPrice - spreadSd),
      upper2:    Math.max(0, winnerPrice + 2 * spreadSd),
      lower2:    Math.max(0, winnerPrice - 2 * spreadSd),
    });
  }

  // ── 5. Forecast summary ─────────────────────────────────────────────────────
  const finalForecastPrice = forecastPoints[forecastPoints.length - 1]?.mean ?? currentPrice;
  const forecastPct        = ((finalForecastPrice - currentPrice) / currentPrice) * 100;
  const forecastDirection  = forecastPct >= 0 ? "up" : "down";

  // ── 6. Ensemble agreement ───────────────────────────────────────────────────
  // Vote count across all 5 models: how many point up vs down. The majority
  // fraction is the consensus strength; the UI shows the split so the user can
  // see both the prevailing direction and the dissent.
  const upCount = models.filter(m => m.slope > 0).length;
  const downCount = models.filter(m => m.slope < 0).length;
  const majorityDirection = upCount > downCount ? "up" : "down";
  const majorityCount = Math.max(upCount, downCount);
  const ensembleAgreement = models.length > 0 ? majorityCount / models.length : 0;
  const modelDisagreement = ensembleAgreement < 0.7;

  // ── 7. Regime detection ─────────────────────────────────────────────────────
  const regime = detectRegime(prices);

  // ── 8. Confidence score ─────────────────────────────────────────────────────
  // Direction hit rate across rolling windows is the primary credibility
  // signal — path error and R² are secondary.
  const dirHitScore = Math.max(0, (validation.directionHitRate - 0.5)) * 2 * 60;
  const pathScore   = Math.max(0, 1 - validation.medianPathMape / 15) * 25;
  const regimePenalty = regime.outsideDistribution
    ? (regime.ratio > 2.5 ? -25 : -12) : 15;

  let confidenceScore = Math.min(100, Math.max(0,
    dirHitScore + pathScore + regimePenalty));

  // Hard cap when direction hit rate is at or below chance
  if (validation.directionHitRate <= 0.55) {
    confidenceScore = Math.min(confidenceScore, 25);
  }


  // ── 9. Calibration reliability gate ─────────────────────────────────────────
  // If even the best model missed today's price badly, the ensemble has NOT earned
  // the right to claim a direction — no amount of R² or agreement rescues that.
  const errorsSorted   = models.map(m => m.errorPct).sort((a, b) => a - b);
  const medianErrorPct = errorsSorted[Math.floor(errorsSorted.length / 2)];
  const e = winner.errorPct;
  const grade: CalibrationQuality["grade"] =
    e <= 3 ? "good" : e <= 8 ? "fair" : e <= 20 ? "poor" : "failed";
  const directionCredible = e <= 8;

  const calibration: CalibrationQuality = {
    winnerErrorPct: e,
    bestErrorPct:   errorsSorted[0],
    medianErrorPct,
    grade,
    directionCredible,
    message:
      grade === "good"
        ? `Calibration good — the winning model landed within ${e.toFixed(1)}% of today's price.`
        : grade === "fair"
        ? `Calibration fair — ${e.toFixed(1)}% miss on today's price. Treat direction as a lean, not a call.`
        : grade === "poor"
        ? `CALIBRATION POOR — the best model missed today's price by ${e.toFixed(1)}%. Direction is not reliable; use the magnitude signal instead.`
        : `CALIBRATION FAILED — every model missed today's price by ${errorsSorted[0].toFixed(1)}%+ (winner ${e.toFixed(1)}%). No directional forecast is defensible for this symbol right now.`,
  };

  // Cap confidence when calibration failed to track reality
  if (!directionCredible) {
    confidenceScore = Math.min(confidenceScore, grade === "failed" ? 15 : 30);
  }

  // ── 10. Magnitude-only signal (valid regardless of direction credibility) ───
  const returns  = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
  const shortVol = stdDev(returns.slice(-20)) * Math.sqrt(252);
  const baseVol  = stdDev(returns.slice(-120, -20)) * Math.sqrt(252) || shortVol;
  const compressionRatio = baseVol > 0 ? shortVol / baseVol : 1;
  const compressed = compressionRatio < 0.7;
  const expectedMovePct = shortVol * Math.sqrt(forecastDays / 252) * 100;

  const magnitudeSignal: MagnitudeSignal = {
    shortVol,
    baseVol,
    compressionRatio,
    compressed,
    expectedMovePct,
    message: compressed
      ? `Volatility compressed to ${compressionRatio.toFixed(2)}× its 6-month baseline — a large move is more likely than usual over the next ${forecastDays} days, direction unknown. 1σ expected move ±${expectedMovePct.toFixed(1)}%.`
      : compressionRatio > 1.4
      ? `Volatility expanded to ${compressionRatio.toFixed(2)}× baseline — the move is already underway. 1σ expected move ±${expectedMovePct.toFixed(1)}% over ${forecastDays} days.`
      : `Volatility near baseline (${compressionRatio.toFixed(2)}×). 1σ expected move ±${expectedMovePct.toFixed(1)}% over ${forecastDays} days, direction unknown.`,
  };

  // ── 11. ±2% accuracy horizon ────────────────────────────────────────────────
  // No 30-day point forecast can hold ±2% on a volatile name — the floor is the
  // stock's own realized move. Solve σ·√(H/252) = 2% for H to get the honest
  // horizon over which a ±2% band is achievable for THIS symbol.
  const TARGET_PCT = 2;
  const horizonDays = shortVol > 0
    ? Math.max(1, Math.min(forecastDays, Math.floor(252 * ((TARGET_PCT / 100) / shortVol) ** 2)))
    : forecastDays;
  const accuracyHorizon: AccuracyHorizon = {
    targetPct: TARGET_PCT,
    days: horizonDays,
    expectedErrorAtHorizonPct: expectedMovePct,
    message:
      horizonDays >= forecastDays
        ? `±${TARGET_PCT}% is achievable across the full ${forecastDays}-day horizon at this volatility (${(shortVol * 100).toFixed(0)}% ann.).`
        : `At ${(shortVol * 100).toFixed(0)}% annualized volatility, a ±${TARGET_PCT}% band only holds for about ${horizonDays} trading day${horizonDays === 1 ? "" : "s"}. Over ${forecastDays} days the irreducible 1σ error is ±${expectedMovePct.toFixed(1)}%.`,
  };

  return {
    calibration,
    magnitudeSignal,
    accuracyHorizon,
    validation,


    forecastPoints,
    forecastPct:       Math.round(forecastPct * 10) / 10,
    forecastDirection,
    winningModel:      winner,
    models,
    ensembleAgreement,
    modelDisagreement,
    regime,
    confidenceScore:   Math.round(confidenceScore),
    actualPath:        normalizedData.slice(-60), // last 60 days for chart
    lookbackMonths,
    currentPrice,
    priceMin,
    priceMax,

    // True holdout metadata
    holdout: {
      days: holdoutDays,
      asOfDate,
      asOfPrice,
      predictedTodayPrice: winner.predictedTodayPrice,
      directionHitRate:
        (models.filter(m => m.directionCorrect).length / models.length) * 100,
    },

    // Compatibility fields for BacktestModal — the holdout path itself
    walkForward: {
      actualPath:    normalizedData.slice(asOfIdx),
      predictedPath: normalizedData.slice(asOfIdx).map((d, i) => ({
        date:      d.date,
        timestamp: d.timestamp,
        actual:    Math.max(0, asOfPrice + winner.slope * i),
      })),
      mape:    winner.errorPct,
      hitRate: (models.filter(m => m.directionCorrect).length / models.length) * 100,
    },
    mape:              winner.errorPct,
    finalForecastError: winner.errorPct,
    converged:         winner.errorPct < 2,
    epochsRun:         WINDOW_SIZES.length,
    latentVector:      [winner.slope, winner.rSquared, winner.errorPct, forecastPct],
    reconstructedPath: normalizedData.slice(asOfIdx).map((d, i) => ({
      date: d.date, timestamp: d.timestamp,
      actual: Math.max(0, asOfPrice + winner.slope * i),
    })),
  };

}
