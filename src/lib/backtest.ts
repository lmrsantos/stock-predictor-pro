// lib/backtest.ts
// Backtest engine: fits regression from a historical start point,
// then iteratively calibrates slope via gradient descent until
// the projected price at "today" converges on the actual current price.

export interface BacktestDataPoint {
  date: string;
  timestamp: number;
  actual: number;
}

export interface BacktestIteration {
  iteration: number;
  slope: number;
  intercept: number;
  predictedPrice: number;
  error: number; // absolute % error vs actual current price
}

export interface CalibratedParams {
  slope: number;
  intercept: number;
  rSquared: number;
  learningRate: number;
  iterationsRun: number;
  converged: boolean;
}

export interface BacktestResult {
  // Accuracy
  mape: number;           // Mean Absolute Percentage Error across all historical points
  finalError: number;     // % error of endpoint prediction vs actual current price

  // Calibrated model params
  calibrated: CalibratedParams;

  // Confidence score 0–100
  confidenceScore: number;

  // Chart data
  actualPath: BacktestDataPoint[];       // actual historical prices
  regressionPath: BacktestDataPoint[];   // regression line (initial, uncalibrated)
  calibratedPath: BacktestDataPoint[];   // calibrated regression line after convergence

  // Convergence trace (for optional debug display)
  convergenceTrace: BacktestIteration[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function linearRegression(
  xs: number[],
  ys: number[]
): { slope: number; intercept: number; rSquared: number } {
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let ssXY = 0;
  let ssXX = 0;
  let ssTot = 0;
  let ssRes = 0;

  for (let i = 0; i < n; i++) {
    ssXY += (xs[i] - meanX) * (ys[i] - meanY);
    ssXX += (xs[i] - meanX) ** 2;
  }

  const slope = ssXX !== 0 ? ssXY / ssXX : 0;
  const intercept = meanY - slope * meanX;

  for (let i = 0; i < n; i++) {
    const predicted = slope * xs[i] + intercept;
    ssRes += (ys[i] - predicted) ** 2;
    ssTot += (ys[i] - meanY) ** 2;
  }

  const rSquared = ssTot !== 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  return { slope, intercept, rSquared };
}

function projectPrice(
  slope: number,
  intercept: number,
  targetTimestamp: number,
  refTimestamp: number
): number {
  // Project in "days from start" space
  const daysDelta = (targetTimestamp - refTimestamp) / (1000 * 60 * 60 * 24);
  return slope * daysDelta + intercept;
}

function computeMAPE(
  xs: number[],
  ys: number[],
  slope: number,
  intercept: number
): number {
  let totalError = 0;
  for (let i = 0; i < xs.length; i++) {
    const predicted = slope * xs[i] + intercept;
    totalError += Math.abs((ys[i] - predicted) / ys[i]);
  }
  return (totalError / xs.length) * 100;
}

function computeConfidence(
  rSquared: number,
  mape: number,
  finalError: number,
  converged: boolean
): number {
  // Weight: rSquared (40%), MAPE accuracy (35%), endpoint error (25%)
  const r2Score = rSquared * 40;
  const mapeScore = Math.max(0, (1 - mape / 20)) * 35; // 0% MAPE → full score, 20%+ → 0
  const endpointScore = Math.max(0, (1 - finalError / 5)) * 25; // 5%+ error → 0
  const convergencePenalty = converged ? 0 : -10;

  return Math.min(100, Math.max(0, r2Score + mapeScore + endpointScore + convergencePenalty));
}

// ─── Main Backtest Function ───────────────────────────────────────────────────

export function runBacktest(
  historicalData: BacktestDataPoint[], // sorted ascending, last point = current
  lookbackMonths: 3 | 6,
  errorThreshold = 0.5,  // % — stop when endpoint error < this
  maxIterations = 1000,
  learningRate = 0.0001
): BacktestResult {
  if (!historicalData || historicalData.length < 10) {
    throw new Error("Insufficient data for backtest (need at least 10 data points).");
  }

  // 1. Slice the lookback window
  const cutoffMs = lookbackMonths * 30 * 24 * 60 * 60 * 1000;
  const latestTimestamp = historicalData[historicalData.length - 1].timestamp;
  const cutoffTimestamp = latestTimestamp - cutoffMs;

  const slice = historicalData.filter((d) => d.timestamp >= cutoffTimestamp);
  if (slice.length < 5) {
    throw new Error("Not enough data in the selected lookback window.");
  }

  // 2. Build xs (days from start) and ys (prices)
  const refTimestamp = slice[0].timestamp;
  const xs = slice.map((d) => (d.timestamp - refTimestamp) / (1000 * 60 * 60 * 24));
  const ys = slice.map((d) => d.actual);

  // 3. Initial regression
  const initial = linearRegression(xs, ys);
  let { slope, intercept } = initial;
  const { rSquared } = initial;

  // 4. Actual current price (last point in slice)
  const currentActual = slice[slice.length - 1].actual;
  const endpointX = xs[xs.length - 1];

  // 5. Gradient descent calibration loop
  const convergenceTrace: BacktestIteration[] = [];
  let converged = false;
  let iterationsRun = 0;
  let finalLearningRate = learningRate;

  for (let i = 0; i < maxIterations; i++) {
    iterationsRun = i + 1;
    const predictedCurrent = slope * endpointX + intercept;
    const errorAbs = Math.abs((predictedCurrent - currentActual) / currentActual) * 100;

    convergenceTrace.push({
      iteration: i + 1,
      slope,
      intercept,
      predictedPrice: predictedCurrent,
      error: errorAbs,
    });

    if (errorAbs < errorThreshold) {
      converged = true;
      break;
    }

    // Gradient: direction to move slope to reduce endpoint error
    // Loss = (slope * endpointX + intercept - currentActual)^2
    // dLoss/dSlope = 2 * (predicted - actual) * endpointX
    const grad = (predictedCurrent - currentActual) * endpointX;
    slope = slope - finalLearningRate * grad;

    // Recompute intercept to keep regression anchored to mean
    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
    intercept = meanY - slope * meanX;

    // Adaptive learning rate: slow down as we get close
    if (errorAbs < 5) finalLearningRate = learningRate * 0.1;
    if (errorAbs < 2) finalLearningRate = learningRate * 0.01;
  }

  // 6. Final error and MAPE
  const finalPredicted = slope * endpointX + intercept;
  const finalError = Math.abs((finalPredicted - currentActual) / currentActual) * 100;
  const mape = computeMAPE(xs, ys, slope, intercept);

  // 7. Build chart paths
  const actualPath: BacktestDataPoint[] = slice.map((d) => ({
    date: d.date,
    timestamp: d.timestamp,
    actual: d.actual,
  }));

  const regressionPath: BacktestDataPoint[] = slice.map((d, idx) => ({
    date: d.date,
    timestamp: d.timestamp,
    actual: initial.slope * xs[idx] + initial.intercept,
  }));

  const calibratedPath: BacktestDataPoint[] = slice.map((d, idx) => ({
    date: d.date,
    timestamp: d.timestamp,
    actual: slope * xs[idx] + intercept,
  }));

  // 8. Confidence score
  const confidenceScore = computeConfidence(rSquared, mape, finalError, converged);

  return {
    mape,
    finalError,
    calibrated: {
      slope,
      intercept,
      rSquared,
      learningRate: finalLearningRate,
      iterationsRun,
      converged,
    },
    confidenceScore,
    actualPath,
    regressionPath,
    calibratedPath,
    convergenceTrace,
  };
}
