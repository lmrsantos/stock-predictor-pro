import { StockDataPoint, RegressionResult, PredictionPoint, FitPoint } from "./types";

/**
 * Risk context from VIX and geopolitical tension.
 * Used to discount predictions during high-fear regimes.
 */
export interface RiskContext {
  vixLevel?: number;       // Current VIX value (long-term avg ~19-20)
  tensionScore?: number;   // 0-100 geopolitical tension
}

/**
 * Compute a risk discount factor based on VIX + geopolitical tension.
 * 
 * - VIX component: When VIX > 20, apply increasing discount.
 *   VIX 20 → 0% discount, VIX 30 → ~3% discount, VIX 40 → ~6% discount
 * - Tension component: tension 50+ adds additional discount.
 *   Tension 50 → 0%, tension 75 → ~2%, tension 100 → ~4%
 * - Combined max discount capped at ~12%
 */
function computeRiskDiscount(risk?: RiskContext): number {
  if (!risk) return 0;

  let discount = 0;

  // VIX component — elevated fear = lower expected returns
  const vix = risk.vixLevel ?? 20;
  if (vix > 20) {
    // Each point above 20 adds ~0.3% discount, capped contribution at 8%
    discount += Math.min((vix - 20) * 0.003, 0.08);
  }

  // Geopolitical tension component
  const tension = risk.tensionScore ?? 0;
  if (tension > 40) {
    // Each point above 40 adds ~0.07% discount, capped at 4%
    discount += Math.min((tension - 40) * 0.0007, 0.04);
  }

  // Total cap at 12%
  return Math.min(discount, 0.12);
}

/**
 * Dampened Weighted Log-Linear Regression with Risk Adjustment
 * 
 * Fixes for optimistic bias:
 * 1. Exponential weighting — recent data matters more (decay = 0.008)
 * 2. Log-space regression — models compounding, not linear growth
 * 3. Mean-reversion dampening — forecast slope decays toward zero over time
 * 4. **Risk discount** — VIX & geopolitical tension pull predictions lower
 *    during high-fear market regimes
 */
export function computeLinearRegression(
  data: StockDataPoint[],
  forecastDays: number = 30,
  riskContext?: RiskContext
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

  // Historical fit points (no risk discount applied to historical fit)
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

  // Risk discount from VIX + geopolitical tension
  const riskDiscount = computeRiskDiscount(riskContext);

  // Future predictions with mean-reversion dampening + risk discount
  const dampeningHalfLife = 15;
  const lastDate = new Date(data[n - 1].date);
  const predictions: PredictionPoint[] = [];

  for (let i = 1; i <= forecastDays; i++) {
    const dayIndex = n - 1 + i;
    
    // Dampened prediction: slope decays toward zero
    const dampeningFactor = Math.exp(-0.693 * i / dampeningHalfLife);
    const dampenedLogSlope = logSlope * dampeningFactor;
    
    // Predict using dampened slope from last known point
    let predicted = Math.exp(
      logSlope * (n - 1) + logIntercept + dampenedLogSlope * i
    );

    // Apply risk discount — pulls prediction toward last known price
    // The discount grows with forecast horizon (more discount further out)
    const horizonFactor = Math.min(i / forecastDays, 1);
    const appliedDiscount = riskDiscount * horizonFactor;
    predicted = predicted * (1 - appliedDiscount);
    
    const futureDate = new Date(lastDate);
    futureDate.setDate(futureDate.getDate() + i);

    // Skip weekends
    const dow = futureDate.getDay();
    if (dow === 0 || dow === 6) continue;

    // Widen uncertainty bands during high-risk regimes
    const riskVolMultiplier = 1 + riskDiscount * 2; // e.g., 10% discount → 20% wider bands
    const timeUncertainty = standardDeviation * Math.sqrt(i / n + 1) * riskVolMultiplier;

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
