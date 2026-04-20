// lib/backtest.ts
// ─────────────────────────────────────────────────────────────────────────────
// Unsupervised Time-Series Autoencoder with Backpropagation
//
// Architecture:
//   Encoder:    [windowSize=20] → [10] → [latentSize=4]
//   Decoder:    [4] → [10] → [windowSize=20]
//   Forecaster: [4] → [10] → [forecastSteps]
//
// Training is fully unsupervised:
//   - No external labels used during autoencoder training
//   - Loss = MSE(reconstruction, input window)
//   - Backprop adjusts all weights/biases across all layers
//   - Network learns the latent "rhythm" of price movement
//
// After autoencoder convergence:
//   - Forecaster head is trained self-supervised (next-step prediction)
//     using the frozen latent representations learned unsupervised
//
// Backtest calibration:
//   Train on lookback slice → encode last window → reconstruct →
//   compare reconstructed endpoint to actual current price →
//   iterate until reconstruction error < threshold
// ─────────────────────────────────────────────────────────────────────────────

export interface BacktestDataPoint {
  date: string;
  timestamp: number;
  actual: number;
}

export interface TrainingEpochLog {
  epoch: number;
  reconstructionLoss: number;
  forecastError: number;
}

export interface BacktestResult {
  mape: number;
  finalForecastError: number;
  confidenceScore: number;
  converged: boolean;
  epochsRun: number;
  actualPath: BacktestDataPoint[];
  reconstructedPath: BacktestDataPoint[];
  forecastPath: BacktestDataPoint[];
  trainingLog: TrainingEpochLog[];
  latentVector: number[];
  priceMin: number;
  priceMax: number;
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

const relu = (x: number) => Math.max(0, x);
const reluGrad = (x: number) => (x > 0 ? 1 : 0);

function mse(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length;
}

// W [m x n] · v [n] + b [m] → [m]
function affine(W: number[][], b: number[], v: number[]): number[] {
  return W.map((row, i) => row.reduce((s, w, j) => s + w * v[j], 0) + b[i]);
}

// ─── Initialization (Xavier) ──────────────────────────────────────────────────

function randMat(rows: number, cols: number): number[][] {
  const scale = Math.sqrt(2 / (rows + cols));
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (Math.random() * 2 - 1) * scale)
  );
}
const zeros = (n: number) => new Array(n).fill(0);

interface Weights {
  We1: number[][]; be1: number[]; // encoder layer 1: [10 x W]
  We2: number[][]; be2: number[]; // encoder layer 2: [L x 10]
  Wd1: number[][]; bd1: number[]; // decoder layer 1: [10 x L]
  Wd2: number[][]; bd2: number[]; // decoder layer 2: [W x 10]
  Wf1: number[][]; bf1: number[]; // forecaster layer 1: [10 x L]
  Wf2: number[][]; bf2: number[]; // forecaster layer 2: [F x 10]
}

function initWeights(W: number, L: number, F: number): Weights {
  return {
    We1: randMat(10, W), be1: zeros(10),
    We2: randMat(L, 10), be2: zeros(L),
    Wd1: randMat(10, L), bd1: zeros(10),
    Wd2: randMat(W, 10), bd2: zeros(W),
    Wf1: randMat(10, L), bf1: zeros(10),
    Wf2: randMat(F, 10), bf2: zeros(F),
  };
}

// ─── Normalization ────────────────────────────────────────────────────────────

function normalize(prices: number[]) {
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  return { normalized: prices.map((p) => (p - min) / range), min, max };
}

const denorm = (v: number, min: number, max: number) => v * (max - min) + min;

// ─── Forward pass ─────────────────────────────────────────────────────────────

interface Fwd {
  he1pre: number[]; he1: number[];
  he2pre: number[]; latent: number[];
  hd1pre: number[]; hd1: number[];
  recon: number[];
  hf1pre: number[]; hf1: number[];
  forecast: number[];
}

function forward(input: number[], w: Weights): Fwd {
  const he1pre = affine(w.We1, w.be1, input);
  const he1 = he1pre.map(relu);
  const he2pre = affine(w.We2, w.be2, he1);
  const latent = he2pre; // linear bottleneck

  const hd1pre = affine(w.Wd1, w.bd1, latent);
  const hd1 = hd1pre.map(relu);
  const recon = affine(w.Wd2, w.bd2, hd1);

  const hf1pre = affine(w.Wf1, w.bf1, latent);
  const hf1 = hf1pre.map(relu);
  const forecast = affine(w.Wf2, w.bf2, hf1);

  return { he1pre, he1, he2pre, latent, hd1pre, hd1, recon, hf1pre, hf1, forecast };
}

// ─── Backward pass (autoencoder only — unsupervised) ──────────────────────────

function backward(input: number[], fwd: Fwd, w: Weights, lr: number): Weights {
  const n = input.length;

  // Decoder gradients
  const dRecon = fwd.recon.map((r, i) => (2 / n) * (r - input[i]));
  const dWd2 = dRecon.map((g) => fwd.hd1.map((h) => g * h));
  const dHd1 = fwd.hd1.map((_, j) => dRecon.reduce((s, g, i) => s + g * w.Wd2[i][j], 0));
  const dHd1pre = dHd1.map((g, i) => g * reluGrad(fwd.hd1pre[i]));
  const dWd1 = dHd1pre.map((g) => fwd.latent.map((l) => g * l));
  const dLatent = fwd.latent.map((_, j) => dHd1pre.reduce((s, g, i) => s + g * w.Wd1[i][j], 0));

  // Encoder gradients (latent is linear → gradient passes straight through)
  const dHe2pre = dLatent;
  const dWe2 = dHe2pre.map((g) => fwd.he1.map((h) => g * h));
  const dHe1 = fwd.he1.map((_, j) => dHe2pre.reduce((s, g, i) => s + g * w.We2[i][j], 0));
  const dHe1pre = dHe1.map((g, i) => g * reluGrad(fwd.he1pre[i]));
  const dWe1 = dHe1pre.map((g) => input.map((x) => g * x));

  const upd = (M: number[][], dM: number[][]) => M.map((r, i) => r.map((v, j) => v - lr * dM[i][j]));
  const updV = (b: number[], db: number[]) => b.map((v, i) => v - lr * db[i]);

  return {
    We1: upd(w.We1, dWe1), be1: updV(w.be1, dHe1pre),
    We2: upd(w.We2, dWe2), be2: updV(w.be2, dHe2pre),
    Wd1: upd(w.Wd1, dWd1), bd1: updV(w.bd1, dHd1pre),
    Wd2: upd(w.Wd2, dWd2), bd2: updV(w.bd2, dRecon),
    // Forecaster weights unchanged during unsupervised phase
    Wf1: w.Wf1, bf1: w.bf1,
    Wf2: w.Wf2, bf2: w.bf2,
  };
}

// ─── Forecaster training (self-supervised, latent repr already learned) ───────

function trainForecaster(
  windows: number[][], targets: number[][], w: Weights, epochs: number, lr: number, F: number
): Weights {
  let weights = { ...w };
  for (let e = 0; e < epochs; e++) {
    for (let i = 0; i < windows.length; i++) {
      const fwd = forward(windows[i], weights);
      const n = F;
      const dF = fwd.forecast.map((f, j) => (2 / n) * (f - targets[i][j]));
      const dWf2 = dF.map((g) => fwd.hf1.map((h) => g * h));
      const dHf1 = fwd.hf1.map((_, j) => dF.reduce((s, g, i) => s + g * weights.Wf2[i][j], 0));
      const dHf1pre = dHf1.map((g, i) => g * reluGrad(fwd.hf1pre[i]));
      const dWf1 = dHf1pre.map((g) => fwd.latent.map((l) => g * l));
      weights = {
        ...weights,
        Wf1: weights.Wf1.map((r, i) => r.map((v, j) => v - lr * dWf1[i][j])),
        bf1: weights.bf1.map((v, i) => v - lr * dHf1pre[i]),
        Wf2: weights.Wf2.map((r, i) => r.map((v, j) => v - lr * dWf2[i][j])),
        bf2: weights.bf2.map((v, i) => v - lr * dF[i]),
      };
    }
  }
  return weights;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function runBacktest(
  historicalData: BacktestDataPoint[],
  lookbackMonths: 3 | 6,
  forecastDays = 30,
  {
    windowSize = 20,
    latentSize = 4,
    learningRate = 0.001,
    maxEpochs = 300,
    errorThreshold = 1.0, // % — stop when reconstruction endpoint error < this
  } = {}
): BacktestResult {
  if (!historicalData || historicalData.length < windowSize + forecastDays) {
    throw new Error(`Need at least ${windowSize + forecastDays} data points.`);
  }

  // 1. Slice lookback
  const cutoffMs = lookbackMonths * 30 * 24 * 60 * 60 * 1000;
  const latestTs = historicalData[historicalData.length - 1].timestamp;
  const slice = historicalData.filter((d) => d.timestamp >= latestTs - cutoffMs);
  if (slice.length < windowSize + 5) throw new Error("Not enough data in lookback window.");

  // 2. Normalize
  const rawPrices = slice.map((d) => d.actual);
  const { normalized, min: priceMin, max: priceMax } = normalize(rawPrices);

  // 3. Build sliding windows
  const windows: number[][] = [];
  for (let i = 0; i + windowSize <= normalized.length; i++) {
    windows.push(normalized.slice(i, i + windowSize));
  }

  // 4. Init weights
  let W = initWeights(windowSize, latentSize, forecastDays);

  // 5. Train autoencoder (unsupervised)
  const trainingLog: TrainingEpochLog[] = [];
  const actualCurrentNorm = normalized[normalized.length - 1];
  let converged = false;
  let epochsRun = 0;
  let lr = learningRate;

  for (let epoch = 0; epoch < maxEpochs; epoch++) {
    epochsRun = epoch + 1;
    let totalLoss = 0;

    // Shuffle windows
    const shuffled = [...windows].sort(() => Math.random() - 0.5);
    for (const win of shuffled) {
      const fwd = forward(win, W);
      totalLoss += mse(fwd.recon, win);
      W = backward(win, fwd, W, lr);
    }

    const avgLoss = totalLoss / windows.length;
    const lastWin = normalized.slice(normalized.length - windowSize);
    const fwd = forward(lastWin, W);
    const reconEnd = fwd.recon[fwd.recon.length - 1];
    const forecastError = Math.abs((reconEnd - actualCurrentNorm) / (actualCurrentNorm || 1)) * 100;

    trainingLog.push({ epoch: epoch + 1, reconstructionLoss: avgLoss, forecastError });

    if (forecastError < errorThreshold && epoch > 20) {
      converged = true;
      break;
    }

    // Adaptive LR decay
    if (epoch === 100) lr *= 0.5;
    if (epoch === 200) lr *= 0.5;
  }

  // 6. Train forecaster head (self-supervised)
  const fwWindows: number[][] = [];
  const fwTargets: number[][] = [];
  for (let i = 0; i + windowSize + forecastDays <= normalized.length; i++) {
    fwWindows.push(normalized.slice(i, i + windowSize));
    fwTargets.push(normalized.slice(i + windowSize, i + windowSize + forecastDays));
  }
  if (fwWindows.length > 0) {
    W = trainForecaster(fwWindows, fwTargets, W, 100, learningRate * 0.5, forecastDays);
  }

  // 7. Final forward on last window
  const lastWin = normalized.slice(normalized.length - windowSize);
  const finalFwd = forward(lastWin, W);
  const latentVector = finalFwd.latent;

  // 8. Reconstruction path (last point of each window's reconstruction)
  const reconstructedPath: BacktestDataPoint[] = windows.map((win, i) => {
    const fwd = forward(win, W);
    return {
      date: slice[i + windowSize - 1].date,
      timestamp: slice[i + windowSize - 1].timestamp,
      actual: denorm(fwd.recon[fwd.recon.length - 1], priceMin, priceMax),
    };
  });

  // 9. Forecast path (future dates)
  const lastPoint = slice[slice.length - 1];
  const forecastPath: BacktestDataPoint[] = finalFwd.forecast.map((val, i) => ({
    date: new Date(lastPoint.timestamp + (i + 1) * 86400000).toISOString().split("T")[0],
    timestamp: lastPoint.timestamp + (i + 1) * 86400000,
    actual: denorm(val, priceMin, priceMax),
  }));

  // 10. MAPE
  let mapeSum = 0;
  const n = Math.min(reconstructedPath.length, slice.length - windowSize + 1);
  for (let i = 0; i < n; i++) {
    const actual = slice[i + windowSize - 1].actual;
    mapeSum += Math.abs((reconstructedPath[i].actual - actual) / actual);
  }
  const mape = (mapeSum / n) * 100;

  // 11. Final error
  const finalForecastError = Math.abs(
    (denorm(finalFwd.recon[finalFwd.recon.length - 1], priceMin, priceMax) -
      slice[slice.length - 1].actual) /
      slice[slice.length - 1].actual
  ) * 100;

  // 12. Confidence
  const lastLog = trainingLog[trainingLog.length - 1];
  const s1 = Math.max(0, 1 - lastLog.reconstructionLoss * 50) * 35;
  const s2 = Math.max(0, 1 - mape / 15) * 35;
  const s3 = Math.max(0, 1 - finalForecastError / 5) * 20;
  const s4 = converged ? 10 : 0;
  const confidenceScore = Math.min(100, Math.max(0, s1 + s2 + s3 + s4));

  return {
    mape,
    finalForecastError,
    confidenceScore,
    converged,
    epochsRun,
    actualPath: slice.map((d) => ({ date: d.date, timestamp: d.timestamp, actual: d.actual })),
    reconstructedPath,
    forecastPath,
    trainingLog,
    latentVector,
    priceMin,
    priceMax,
  };
}
