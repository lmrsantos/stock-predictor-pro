export interface StockDataPoint {
  date: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
  standardDeviation: number;
  predictions: PredictionPoint[];
  historicalFit: FitPoint[];
}

export interface PredictionPoint {
  date: string;
  timestamp: number;
  predicted: number;
  upper1Sigma: number;
  lower1Sigma: number;
  upper2Sigma: number;
  lower2Sigma: number;
  dayIndex: number;
}

export interface FitPoint {
  date: string;
  timestamp: number;
  actual: number;
  fitted: number;
  residual: number;
  upper1Sigma: number;
  lower1Sigma: number;
  upper2Sigma: number;
  lower2Sigma: number;
}

export interface ChartDataPoint {
  date: string;
  timestamp: number;
  actual?: number;
  fitted?: number;
  predicted?: number;
  upper1Sigma: number;
  lower1Sigma: number;
  upper2Sigma: number;
  lower2Sigma: number;
  isForecast?: boolean;
  volume?: number;
  volumeUp?: boolean;
}
