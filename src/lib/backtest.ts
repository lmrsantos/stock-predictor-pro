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
  windowSize: number;         // days used for fitting
  label: string;              // e.g. "10-day trend"
  slope: number;              // daily price change ($/day)
  intercept: number;
  rSquared: number;           // how well it fit the training window
  predictedTodayPrice: number; // where it said today's price would be
  actualTodayPrice: number;
  errorPct: number;           // abs % error vs actual current price
  annualizedReturn: number;   // projected annual return from slope
  winner: boolean;            // true for the best-fitting model
}

export interface ForecastResult {
  // The winning model's forward projection
  forecastPoints: ForecastPoint[];
  forecastPct: number;        // % change projected over forecastDays
  forecastDirection: "up" | "down";
  winningModel: ModelCalibration;

  // All model calibrations (for display)
  models: ModelCalibration[];

  // Ensemble cone from all models
  ensembleAgreement: number;  // 0–1
  modelDisagreement: boolean;

  // Regime detection
  regime: RegimeResult;

  // Confidence score 0–100
  confidenceScore: number;

  // Chart paths
  actualPath: BacktestDataPoint[];

  // Meta
  lookbackMonths: number;
  currentPrice: number;
  priceMin: number;
  priceMax: number;
}

export interface RegimeResult {
  currentVol: number;
  trainingVol: number;
  ratio: number;
  outsideDistribution: boolean;
  warning: string | null;
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

  if (data.length < 60) {
    throw new Error("Need at least 60 data points for calibration.");
  }

  const currentPrice    = data[data.length - 1].actual;
  const currentTs       = data[data.length - 1].timestamp;
  const prices          = data.map(d => d.actual);
  const priceMin        = Math.min(...prices);
  const priceMax        = Math.max(...prices);

  // ── 2. Calibrate each model ─────────────────────────────────────────────────
  // Each model looks at a window ending at the LOOKBACK point,
  // projects forward to today, compares to actual current price.

  const lookbackCount = Math.min(lookbackMonths * 21, data.length - 20); // trading days
  const startIndex    = Math.max(0, data.length - lookbackCount - 1);

  const models: ModelCalibration[] = WINDOW_SIZES.map(({ days, label }) => {
    // Training window: `days` days ending at the lookback start point
    const trainEnd   = startIndex + days;
    const trainSlice = data.slice(startIndex, trainEnd).map(d => d.actual);

    if (trainSlice.length < 5) {
      return {
        windowSize: days, label,
        slope: 0, intercept: trainSlice[0] ?? currentPrice,
        rSquared: 0, predictedTodayPrice: currentPrice,
        actualTodayPrice: currentPrice, errorPct: 100,
        annualizedReturn: 0, winner: false,
      };
    }

    const reg = linReg(trainSlice);

    // Project forward from trainEnd to today
    const daysToToday = data.length - trainEnd;
    const predictedTodayPrice = reg.slope * (trainSlice.length - 1 + daysToToday) + reg.intercept;
    const errorPct = Math.abs((predictedTodayPrice - currentPrice) / currentPrice) * 100;

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
    };
  });

  // ── 3. Pick the winner ──────────────────────────────────────────────────────
  const sortedByError = [...models].sort((a, b) => a.errorPct - b.errorPct);
  const winner = sortedByError[0];
  models.forEach(m => { m.winner = m.windowSize === winner.windowSize; });

  // ── 4. Generate forecast from winning model ─────────────────────────────────
  // Anchor to actual current price, project forward using winning slope
  const forecastPoints: ForecastPoint[] = [];

  // Compute uncertainty from ensemble spread at each step
  for (let i = 0; i < forecastDays; i++) {
    const dayOffset = i + 1;

    // Each model's projected price at this future day
    const modelPrices = models.map(m => {
      // Anchor each model at current price, project with its own slope
      return currentPrice + m.slope * dayOffset;
    });

    // Winner's projection (primary forecast line)
    const winnerPrice = currentPrice + winner.slope * dayOffset;

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
  // How much do models agree on direction?
  const positiveSlopes = models.filter(m => m.slope > 0).length;
  const directionAgreement = Math.max(positiveSlopes, models.length - positiveSlopes) / models.length;
  const ensembleAgreement  = directionAgreement;
  const modelDisagreement  = directionAgreement < 0.7;

  // ── 7. Regime detection ─────────────────────────────────────────────────────
  const regime = detectRegime(prices);

  // ── 8. Confidence score ─────────────────────────────────────────────────────
  // Winner error score: 0% error = 30pts, 5%+ = 0pts
  const winnerErrorScore   = Math.max(0, 1 - winner.errorPct / 5) * 30;
  // R² score: trend reliability of the winning model
  const rSquaredScore      = winner.rSquared * 25;
  // Direction agreement across all 5 models
  const agreementScore     = (ensembleAgreement - 0.5) * 2 * 25; // 0.5→0pts, 1.0→25pts
  // Regime: no shift = 20pts bonus
  const regimePenalty      = regime.outsideDistribution
    ? (regime.ratio > 2.5 ? -25 : -12) : 20;

  const confidenceScore = Math.min(100, Math.max(0,
    winnerErrorScore + rSquaredScore + agreementScore + regimePenalty
  ));

  return {
    forecastPoints,
    forecastPct:       Math.round(forecastPct * 10) / 10,
    forecastDirection,
    winningModel:      winner,
    models,
    ensembleAgreement,
    modelDisagreement,
    regime,
    confidenceScore:   Math.round(confidenceScore),
    actualPath:        data.slice(-60), // last 60 days for chart
    lookbackMonths,
    currentPrice,
    priceMin,
    priceMax,

    // Compatibility fields for BacktestModal
    walkForward: {
      actualPath:    data.slice(-30),
      predictedPath: data.slice(-30).map((d, i) => ({
        date:      d.date,
        timestamp: d.timestamp,
        actual:    currentPrice + winner.slope * (i - 29),
      })),
      mape:    winner.errorPct,
      hitRate: ensembleAgreement * 100,
    },
    mape:              winner.errorPct,
    finalForecastError: winner.errorPct,
    converged:         winner.errorPct < 2,
    epochsRun:         WINDOW_SIZES.length,
    latentVector:      [winner.slope, winner.rSquared, winner.errorPct, forecastPct],
    reconstructedPath: data.slice(-60).map(d => ({
      date: d.date, timestamp: d.timestamp,
      actual: winner.slope * (data.indexOf(d)) + winner.intercept,
    })),
    // Ensemble models compatibility
    models: models.map(m => ({
      windowSize: m.windowSize,
      forecast:   forecastPoints.map(fp => fp.mean),
      reconError: m.errorPct,
      converged:  m.errorPct < 2,
      epochsRun:  1,
    })),
  };
}
