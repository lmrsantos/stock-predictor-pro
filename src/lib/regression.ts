import { StockDataPoint, RegressionResult, PredictionPoint, FitPoint } from "./types";

export function computeLinearRegression(
  data: StockDataPoint[],
  forecastDays: number = 30
): RegressionResult {
  const n = data.length;
  if (n < 2) {
    throw new Error("Need at least 2 data points");
  }

  // Use index as x, close price as y
  const xs = data.map((_, i) => i);
  const ys = data.map((d) => d.close);

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Residuals and standard deviation
  const residuals = ys.map((y, i) => y - (slope * xs[i] + intercept));
  const meanResidual = residuals.reduce((a, b) => a + b, 0) / n;
  const variance =
    residuals.reduce((acc, r) => acc + (r - meanResidual) ** 2, 0) / (n - 2);
  const standardDeviation = Math.sqrt(variance);

  // R-squared
  const meanY = sumY / n;
  const ssTotal = ys.reduce((acc, y) => acc + (y - meanY) ** 2, 0);
  const ssResidual = residuals.reduce((acc, r) => acc + r * r, 0);
  const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  // Historical fit points
  const historicalFit: FitPoint[] = data.map((d, i) => {
    const fitted = slope * i + intercept;
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

  // Future predictions
  const lastDate = new Date(data[n - 1].date);
  const predictions: PredictionPoint[] = [];

  for (let i = 1; i <= forecastDays; i++) {
    const dayIndex = n - 1 + i;
    const predicted = slope * dayIndex + intercept;
    const futureDate = new Date(lastDate);
    futureDate.setDate(futureDate.getDate() + i);

    // Skip weekends
    const dow = futureDate.getDay();
    if (dow === 0 || dow === 6) continue;

    predictions.push({
      date: futureDate.toISOString().split("T")[0],
      timestamp: futureDate.getTime() / 1000,
      predicted,
      upper1Sigma: predicted + standardDeviation,
      lower1Sigma: predicted - standardDeviation,
      upper2Sigma: predicted + 2 * standardDeviation,
      lower2Sigma: predicted - 2 * standardDeviation,
      dayIndex,
    });
  }

  return {
    slope,
    intercept,
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
