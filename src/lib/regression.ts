import { StockDataPoint, RegressionResult, PredictionPoint, FitPoint } from "./types";

/**
 * Dampened Weighted Log-Linear Regression
 * 
 * Fixes for optimistic bias:
 * 1. Exponential weighting — recent data matters more (decay = 0.008)
 * 2. Log-space regression — models compounding, not linear growth
 * 3. Mean-reversion dampening — forecast slope decays toward zero over time
 *    so projections don't blindly extend bullish/bearish trends
 */
export function computeLinearRegression(
  data: StockDataPoint[],
  forecastDays: number = 30
): RegressionResult {
  const n = data.length;
  if (n < 2) {
    throw new Error("Need at least 2 data points");
  }

  const xs = data.map((_, i) => i);
  const ys = data.map((d) => d.close);
  const logYs = ys.map(y => Math.log(y));

  // Exponential weights — recent data weighted higher
  const decay = 0.008;
  const weights = xs.map((_, i) => Math.exp(decay * (i - n + 1)));
  const totalW = weights.reduce((a, b) => a + b, 0);

  // Weighted regression in log-space
  const wSumX = xs.reduce((acc, x, i) => acc + weights[i] * x, 0);
  const wSumY = logYs.reduce((acc, y, i) => acc + weights[i] * y, 0);
  const wSumXY = xs.reduce((acc, x, i) => acc + weights[i] * x * logYs[i], 0);
  const wSumX2 = xs.reduce((acc, x, i) => acc + weights[i] * x * x, 0);

  const logSlope = (totalW * wSumXY - wSumX * wSumY) / (totalW * wSumX2 - wSumX * wSumX);
  const logIntercept = (wSumY - logSlope * wSumX) / totalW;

  // Convert log-space slope to linear-space equivalent for external use
  const lastFitted = Math.exp(logSlope * (n - 1) + logIntercept);
  const prevFitted = Math.exp(logSlope * (n - 2) + logIntercept);
  const effectiveSlope = lastFitted - prevFitted;
  const effectiveIntercept = lastFitted - effectiveSlope * (n - 1);

  // Residuals in actual price space (using log-linear fit)
  const fittedValues = xs.map(x => Math.exp(logSlope * x + logIntercept));
  const residuals = ys.map((y, i) => y - fittedValues[i]);
  const meanResidual = residuals.reduce((a, b) => a + b, 0) / n;
  const variance =
    residuals.reduce((acc, r) => acc + (r - meanResidual) ** 2, 0) / (n - 2);
  const standardDeviation = Math.sqrt(variance);

  // R-squared
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  const ssTotal = ys.reduce((acc, y) => acc + (y - meanY) ** 2, 0);
  const ssResidual = residuals.reduce((acc, r) => acc + r * r, 0);
  const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  // Historical fit points
  const historicalFit: FitPoint[] = data.map((d, i) => {
    const fitted = fittedValues[i];
    return {
      date: d.date,
      timestamp: d.timestamp,
      actual: d.close,
      fitted,
      residual: d.close - fitted,
      upper1Sigma: fitted + standardDeviation,
      lower1Sigma: fitted - standardDeviation,
      upper2Sigma: fitted + 2 * standardDeviation,
      lower2Sigma: fitted - 2 * standardDeviation,
    };
  });

  // Future predictions with mean-reversion dampening
  // The slope decays exponentially so projections don't run away
  const dampeningHalfLife = 15; // slope halves every 15 trading days
  const lastDate = new Date(data[n - 1].date);
  const predictions: PredictionPoint[] = [];

  for (let i = 1; i <= forecastDays; i++) {
    const dayIndex = n - 1 + i;
    
    // Dampened prediction: slope decays toward zero
    const dampeningFactor = Math.exp(-0.693 * i / dampeningHalfLife); // ln(2) ≈ 0.693
    const dampenedLogSlope = logSlope * dampeningFactor;
    
    // Predict using dampened slope from last known point
    const predicted = Math.exp(
      logSlope * (n - 1) + logIntercept + dampenedLogSlope * i
    );
    
    const futureDate = new Date(lastDate);
    futureDate.setDate(futureDate.getDate() + i);

    // Skip weekends
    const dow = futureDate.getDay();
    if (dow === 0 || dow === 6) continue;

    // Widen uncertainty bands over time
    const timeUncertainty = standardDeviation * Math.sqrt(i / n + 1);

    predictions.push({
      date: futureDate.toISOString().split("T")[0],
      timestamp: futureDate.getTime() / 1000,
      predicted,
      upper1Sigma: predicted + timeUncertainty,
      lower1Sigma: predicted - timeUncertainty,
      upper2Sigma: predicted + 2 * timeUncertainty,
      lower2Sigma: predicted - 2 * timeUncertainty,
      dayIndex,
    });
  }

  return {
    slope: effectiveSlope,
    intercept: effectiveIntercept,
    rSquared,
    standardDeviation,
    predictions,
    historicalFit,
  };
}

export function formatPrice(price: number): string {
  return price.toFixed(2);
}

export function formatPercent(value: number): string {
  return (value * 100).toFixed(2) + "%";
}

export function slopeToAnnualReturn(slope: number, currentPrice: number): number {
  // Approximate: slope is per trading day, ~252 trading days/year
  return (slope * 252) / currentPrice;
}
