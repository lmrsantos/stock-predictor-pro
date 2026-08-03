import { StockDataPoint, RegressionResult, PredictionPoint, FitPoint } from "./types";

// ~3.5 months of trading days — the sweet spot between 3mo and 4mo windows,
// both of which backtested with materially lower 30d projection error than 1y.
export const SHORT_TERM_PROJECTION_LOOKBACK_DAYS = 73;

export function getShortTermProjectionWindow(data: StockDataPoint[]): StockDataPoint[] {
  return data.slice(-SHORT_TERM_PROJECTION_LOOKBACK_DAYS);
}

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
 */
function computeRiskDiscount(risk?: RiskContext): number {
  if (!risk) return 0;

  let discount = 0;

  const vix = risk.vixLevel ?? 20;
  if (vix > 20) {
    discount += Math.min((vix - 20) * 0.003, 0.08);
  }

  const tension = risk.tensionScore ?? 0;
  if (tension > 40) {
    discount += Math.min((tension - 40) * 0.0007, 0.04);
  }

  return Math.min(discount, 0.12);
}

// ============================================
// IMPROVEMENT 1: Momentum Factor
// Compares short-term vs long-term moving average
// to detect trend acceleration/deceleration
// ============================================
function computeMomentumFactor(prices: number[]): number {
  const n = prices.length;
  if (n < 50) return 1.0; // not enough data

  const shortWindow = Math.min(20, Math.floor(n * 0.1));
  const longWindow = Math.min(50, Math.floor(n * 0.3));

  const shortMA = prices.slice(-shortWindow).reduce((a, b) => a + b, 0) / shortWindow;
  const longMA = prices.slice(-longWindow).reduce((a, b) => a + b, 0) / longWindow;

  // Ratio > 1 = bullish momentum, < 1 = bearish momentum
  const ratio = shortMA / longMA;

  // Clamp between 0.85 and 1.15 to avoid extreme adjustments
  return Math.max(0.85, Math.min(1.15, ratio));
}

// ============================================
// IMPROVEMENT 2: Own-Volatility Regime Detection
// Uses the stock's own recent volatility vs historical
// ============================================
function computeOwnVolatilityMultiplier(prices: number[]): number {
  const n = prices.length;
  if (n < 30) return 1.0;

  // Compute daily returns
  const returns: number[] = [];
  for (let i = 1; i < n; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }

  // Recent volatility (last 20 days)
  const recentReturns = returns.slice(-20);
  const recentMean = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
  const recentVol = Math.sqrt(recentReturns.reduce((acc, r) => acc + (r - recentMean) ** 2, 0) / recentReturns.length);

  // Historical volatility (full period)
  const histMean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const histVol = Math.sqrt(returns.reduce((acc, r) => acc + (r - histMean) ** 2, 0) / returns.length);

  if (histVol === 0) return 1.0;

  // Ratio > 1 means elevated recent volatility → widen bands, dampen more
  const volRatio = recentVol / histVol;

  // Clamp between 0.7 and 2.0
  return Math.max(0.7, Math.min(2.0, volRatio));
}

// ============================================
// IMPROVEMENT 5: Residual Bias Correction
// Analyzes recent residuals and subtracts systematic bias
// ============================================
function computeResidualBias(residuals: number[], prices: number[]): number {
  const n = residuals.length;
  if (n < 20) return 0;

  // Look at last 20% of residuals (recent bias)
  const recentCount = Math.max(10, Math.floor(n * 0.2));
  const recentResiduals = residuals.slice(-recentCount);

  // Mean residual as percentage of price
  const recentPrices = prices.slice(-recentCount);
  const biasRatios = recentResiduals.map((r, i) => r / recentPrices[i]);
  const meanBias = biasRatios.reduce((a, b) => a + b, 0) / biasRatios.length;

  // If model consistently overshoots (positive residuals mean actual > fitted),
  // the bias will be positive. We return this to correct predictions.
  // Clamp to ±5%
  return Math.max(-0.05, Math.min(0.05, meanBias));
}

/**
 * Enhanced Regression Model v2
 * 
 * Improvements over v1:
 * 1. Momentum Factor — adjusts slope based on short vs long MA crossover
 * 2. Own-Volatility Regime — widens bands when stock's own vol is elevated
 * 3. R² Confidence Scaling — weak trends → predictions closer to current price
 * 4. Asymmetric Confidence Bands — downside bands 25% wider than upside
 * 5. Residual Bias Correction — corrects systematic over/undershoot
 * 6. Horizon-Adaptive Decay — different decay rates for different forecast lengths
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

  // ============ NEW: Compute enhancement factors ============

  // IMPROVEMENT 1: Momentum
  const momentumFactor = computeMomentumFactor(ys);

  // IMPROVEMENT 2: Own-volatility regime
  const ownVolMultiplier = computeOwnVolatilityMultiplier(ys);

  // IMPROVEMENT 3: R² confidence scaling
  // When R² is low, pull predictions toward current price more aggressively
  // R² of 0.9 → scale 1.0, R² of 0.5 → scale 0.5, R² of 0 → scale 0.1
  const r2ConfidenceScale = Math.max(0.1, Math.min(1.0, rSquared));

  // IMPROVEMENT 5: Residual bias is now handled by the continuity anchor below
  void computeResidualBias(residuals, ys);

  // Historical fit points (no adjustments applied)
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

  // IMPROVEMENT 6: Horizon-adaptive decay
  // Shorter forecasts trust momentum more; longer forecasts revert faster
  const baseHalfLife = forecastDays <= 30 ? 20 : forecastDays <= 90 ? 12 : 8;

  const lastPrice = ys[n - 1];
  const lastDate = new Date(data[n - 1].date);
  const predictions: PredictionPoint[] = [];

  // Continuity anchor: the regression line at the last observed day usually sits
  // above/below the last close. Projecting straight off the line creates a visible
  // gap-up/gap-down on day 1. We start the path at the last close and let it
  // re-converge to the regression line as the horizon extends.
  const anchorFit = Math.exp(logSlope * (n - 1) + logIntercept);
  const anchorGap = anchorFit > 0 ? lastPrice / anchorFit : 1;

  for (let i = 1; i <= forecastDays; i++) {
    const dayIndex = n - 1 + i;

    // IMPROVEMENT 6: Adaptive dampening
    const dampeningFactor = Math.exp(-0.693 * i / baseHalfLife);
    const dampenedLogSlope = logSlope * dampeningFactor;

    // Base prediction from regression, anchored at the last close so the
    // forecast line joins the price line continuously.
    const gapDecay = Math.exp(-0.693 * (i - 1) / (baseHalfLife * 2));
    let predicted =
      Math.exp(logSlope * (n - 1) + logIntercept + dampenedLogSlope * i) *
      Math.pow(anchorGap, gapDecay);

    // IMPROVEMENT 1: Apply momentum adjustment
    // Momentum pulls prediction in the direction of recent trend
    const momentumAdjustment = (momentumFactor - 1.0) * dampeningFactor;
    predicted = predicted * (1 + momentumAdjustment);

    // IMPROVEMENT 3: R² confidence scaling
    // Blend predicted with lastPrice based on R² confidence
    predicted = lastPrice + (predicted - lastPrice) * r2ConfidenceScale;

    // Risk discount — pulls the projection toward the last known price.
    // Must shrink the projected move, not the price level, otherwise a flat
    // instrument (e.g. a T-bill ETF) gets marked down by the full discount.
    const horizonFactor = Math.min(i / forecastDays, 1);
    const appliedDiscount = riskDiscount * horizonFactor;
    predicted = lastPrice + (predicted - lastPrice) * (1 - appliedDiscount);


    const futureDate = new Date(lastDate);
    futureDate.setDate(futureDate.getDate() + i);

    // Skip weekends
    const dow = futureDate.getDay();
    if (dow === 0 || dow === 6) continue;

    // IMPROVEMENT 2: Own-volatility widens bands
    // IMPROVEMENT 4: Asymmetric bands (downside 25% wider)
    const riskVolMultiplier = 1 + riskDiscount * 2;
    const baseUncertainty = standardDeviation * Math.sqrt(i / n + 1) * riskVolMultiplier * ownVolMultiplier;

    const upperUncertainty = baseUncertainty;         // Upside band
    const lowerUncertainty = baseUncertainty * 1.25;  // IMPROVEMENT 4: Downside 25% wider

    predictions.push({
      date: futureDate.toISOString().split("T")[0],
      timestamp: futureDate.getTime() / 1000,
      predicted,
      upper1Sigma: predicted + upperUncertainty,
      lower1Sigma: predicted - lowerUncertainty,
      upper2Sigma: predicted + 2 * upperUncertainty,
      lower2Sigma: predicted - 2 * lowerUncertainty,
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
  return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatPercent(value: number): string {
  return (value * 100).toFixed(2) + "%";
}

/**
 * Implied annual return from the regression trend.
 *
 * The underlying fit is log-linear, so growth compounds per trading bar.
 * `slope` is the linear-space delta of the last fitted bar, which implies a
 * daily growth rate g = ln(P / (P - slope)). Annualizing over 252 trading days:
 *   annual = (P / (P - slope))^252 - 1
 *
 * The old formula ((slope * 252) / P) was a simple, non-compounded
 * approximation that understated strong uptrends and overstated downtrends.
 */
export function slopeToAnnualReturn(slope: number, currentPrice: number): number {
  if (!currentPrice || !isFinite(currentPrice) || !isFinite(slope)) return 0;

  const base = currentPrice - slope;
  // Degenerate case (slope >= price): fall back to the linear approximation.
  if (base <= 0) return (slope * 252) / currentPrice;

  const dailyGrowth = Math.log(currentPrice / base);
  const annual = Math.expm1(dailyGrowth * 252);

  // Clamp runaway extrapolations from very short/steep windows.
  return Math.max(-0.99, Math.min(10, annual));
}
