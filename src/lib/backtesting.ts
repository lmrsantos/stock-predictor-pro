import { StockDataPoint } from "./types";

export interface BacktestConfig {
  ticker: string;
  trainingPeriod: string; // e.g., "6mo", "1y"
  forecastDays: number;   // how many days forward to predict
}

export interface BacktestResult {
  ticker: string;
  trainingPeriod: string;
  forecastDays: number;
  model: string;
  // Accuracy metrics
  mape: number;          // Mean Absolute Percentage Error
  rmse: number;          // Root Mean Squared Error
  mae: number;           // Mean Absolute Error
  directionalAccuracy: number; // % of days direction was correct
  finalPredicted: number;
  finalActual: number;
  finalError: number;    // percentage
  // Per-day data for chart overlay
  predictions: BacktestPrediction[];
  trainingEndDate: string;
  trainingR2: number;
}

export interface BacktestPrediction {
  date: string;
  actual: number;
  predicted: number;
  error: number; // percentage
}

// ============================================
// MODEL 1: Simple Linear Regression (baseline)
// ============================================
function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  const ssTotal = ys.reduce((acc, y) => acc + (y - meanY) ** 2, 0);
  const ssResidual = ys.reduce((acc, y, i) => acc + (y - (slope * xs[i] + intercept)) ** 2, 0);
  const r2 = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  return { slope, intercept, r2 };
}

// ============================================
// MODEL 2: Log-Linear Regression
// Uses log(price) for better compounding behavior
// ============================================
function logLinearRegression(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
  const logYs = ys.map(y => Math.log(y));
  const result = linearRegression(xs, logYs);
  return result;
}

function logLinearPredict(slope: number, intercept: number, x: number): number {
  return Math.exp(slope * x + intercept);
}

// ============================================
// MODEL 3: Weighted Linear Regression
// Recent points weighted more heavily
// ============================================
function weightedLinearRegression(xs: number[], ys: number[], decay: number = 0.005): { slope: number; intercept: number; r2: number } {
  const n = xs.length;
  const weights = xs.map((_, i) => Math.exp(decay * (i - n + 1))); // exponential decay, recent = highest
  const totalW = weights.reduce((a, b) => a + b, 0);

  const wSumX = xs.reduce((acc, x, i) => acc + weights[i] * x, 0);
  const wSumY = ys.reduce((acc, y, i) => acc + weights[i] * y, 0);
  const wSumXY = xs.reduce((acc, x, i) => acc + weights[i] * x * ys[i], 0);
  const wSumX2 = xs.reduce((acc, x, i) => acc + weights[i] * x * x, 0);

  const slope = (totalW * wSumXY - wSumX * wSumY) / (totalW * wSumX2 - wSumX * wSumX);
  const intercept = (wSumY - slope * wSumX) / totalW;

  const meanY = wSumY / totalW;
  const ssTotal = ys.reduce((acc, y, i) => acc + weights[i] * (y - meanY) ** 2, 0);
  const ssResidual = ys.reduce((acc, y, i) => acc + weights[i] * (y - (slope * xs[i] + intercept)) ** 2, 0);
  const r2 = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  return { slope, intercept, r2 };
}

// ============================================
// MODEL 4: Weighted Log-Linear (best of both)
// ============================================
function weightedLogLinearRegression(xs: number[], ys: number[], decay: number = 0.005): { slope: number; intercept: number; r2: number } {
  const logYs = ys.map(y => Math.log(y));
  return weightedLinearRegression(xs, logYs, decay);
}

// ============================================
// Backtest execution
// ============================================
export type ModelType = "linear" | "log-linear" | "weighted-linear" | "weighted-log-linear";

function predictWithModel(
  model: ModelType,
  slope: number,
  intercept: number,
  x: number
): number {
  if (model === "log-linear" || model === "weighted-log-linear") {
    return logLinearPredict(slope, intercept, x);
  }
  return slope * x + intercept;
}

function trainModel(
  model: ModelType,
  xs: number[],
  ys: number[]
): { slope: number; intercept: number; r2: number } {
  switch (model) {
    case "linear": return linearRegression(xs, ys);
    case "log-linear": return logLinearRegression(xs, ys);
    case "weighted-linear": return weightedLinearRegression(xs, ys);
    case "weighted-log-linear": return weightedLogLinearRegression(xs, ys);
  }
}

export function runBacktest(
  allData: StockDataPoint[],
  trainingSize: number,
  model: ModelType = "linear"
): BacktestResult | null {
  if (allData.length < trainingSize + 5) return null;

  const trainingData = allData.slice(0, trainingSize);
  const testData = allData.slice(trainingSize);

  const xs = trainingData.map((_, i) => i);
  const ys = trainingData.map(d => d.close);

  const { slope, intercept, r2 } = trainModel(model, xs, ys);

  const predictions: BacktestPrediction[] = [];
  let correctDirections = 0;

  for (let i = 0; i < testData.length; i++) {
    const dayIndex = trainingSize + i;
    const predicted = predictWithModel(model, slope, intercept, dayIndex);
    const actual = testData[i].close;
    const error = ((predicted - actual) / actual) * 100;

    predictions.push({
      date: testData[i].date,
      actual,
      predicted,
      error,
    });

    // Directional accuracy: did the model predict the right direction from prev day?
    if (i > 0) {
      const prevActual = testData[i - 1].close;
      const prevPredicted = predictWithModel(model, slope, intercept, trainingSize + i - 1);
      const actualDirection = actual > prevActual;
      const predictedDirection = predicted > prevPredicted;
      if (actualDirection === predictedDirection) correctDirections++;
    }
  }

  const absErrors = predictions.map(p => Math.abs(p.error));
  const mape = absErrors.reduce((a, b) => a + b, 0) / absErrors.length;
  
  const squaredErrors = predictions.map(p => (p.predicted - p.actual) ** 2);
  const rmse = Math.sqrt(squaredErrors.reduce((a, b) => a + b, 0) / squaredErrors.length);
  
  const mae = predictions.reduce((acc, p) => acc + Math.abs(p.predicted - p.actual), 0) / predictions.length;

  const last = predictions[predictions.length - 1];

  return {
    ticker: "",
    trainingPeriod: "",
    forecastDays: testData.length,
    model,
    mape,
    rmse,
    mae,
    directionalAccuracy: testData.length > 1 ? (correctDirections / (testData.length - 1)) * 100 : 0,
    finalPredicted: last.predicted,
    finalActual: last.actual,
    finalError: last.error,
    predictions,
    trainingEndDate: trainingData[trainingData.length - 1].date,
    trainingR2: r2,
  };
}

// Run all models and return sorted by MAPE
export function runAllModels(
  allData: StockDataPoint[],
  trainingSize: number
): BacktestResult[] {
  const models: ModelType[] = ["linear", "log-linear", "weighted-linear", "weighted-log-linear"];
  const results: BacktestResult[] = [];

  for (const model of models) {
    const result = runBacktest(allData, trainingSize, model);
    if (result) {
      result.model = model;
      results.push(result);
    }
  }

  return results.sort((a, b) => a.mape - b.mape);
}
