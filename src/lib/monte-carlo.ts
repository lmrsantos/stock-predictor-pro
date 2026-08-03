// Monte Carlo forward simulation
// ─────────────────────────────────────────────────────────────────────────────
// Simulates future price paths from the empirical distribution of historical
// log returns (block bootstrap, preserving short-term autocorrelation/vol
// clustering) and returns median path + percentile bands per forecast day.
//
// Bands are mapped to the chart's sigma slots:
//   1σ  → P16 / P84   (≈ ±1 std of a normal)
//   2σ  → P2.5 / P97.5
// ─────────────────────────────────────────────────────────────────────────────

export interface MonteCarloPoint {
  dayIndex: number;
  median: number;
  mean: number;
  p16: number;
  p84: number;
  p2_5: number;
  p97_5: number;
}

export interface MonteCarloResult {
  points: MonteCarloPoint[];
  annualVol: number;
  dailyDrift: number;
  sampleSize: number;
  paths: number;
  probUp: number;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// Deterministic PRNG so the same inputs render the same chart across renders
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateMonteCarlo(
  closes: number[],
  horizonDays: number,
  opts: { paths?: number; blockSize?: number; driftDamping?: number; seed?: number } = {}
): MonteCarloResult | null {
  const prices = closes.filter((c) => Number.isFinite(c) && c > 0);
  if (prices.length < 40 || horizonDays < 1) return null;

  const paths = opts.paths ?? 4000;
  const blockSize = Math.max(1, opts.blockSize ?? 5);
  const driftDamping = opts.driftDamping ?? 0.5; // shrink historical drift by half
  const rand = mulberry32(opts.seed ?? 20260803);

  const logRet: number[] = [];
  for (let i = 1; i < prices.length; i++) logRet.push(Math.log(prices[i] / prices[i - 1]));

  const n = logRet.length;
  const mean = logRet.reduce((a, b) => a + b, 0) / n;
  const variance = logRet.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1);
  const sd = Math.sqrt(variance);

  const S0 = prices[prices.length - 1];
  // Demean the sample, then re-inject a damped drift so extreme historical
  // trends don't dominate a 30-day horizon.
  const drift = mean * driftDamping;

  const endings = new Array<number>(paths);
  const byDay: number[][] = Array.from({ length: horizonDays }, () => new Array<number>(paths));

  const maxStart = Math.max(1, n - blockSize);
  for (let p = 0; p < paths; p++) {
    let logPrice = Math.log(S0);
    let d = 0;
    while (d < horizonDays) {
      const start = Math.floor(rand() * maxStart);
      for (let b = 0; b < blockSize && d < horizonDays; b++, d++) {
        const r = logRet[Math.min(n - 1, start + b)] - mean + drift;
        logPrice += r;
        byDay[d][p] = Math.exp(logPrice);
      }
    }
    endings[p] = byDay[horizonDays - 1][p];
  }

  const points: MonteCarloPoint[] = byDay.map((vals, i) => {
    const sorted = [...vals].sort((a, b) => a - b);
    return {
      dayIndex: i + 1,
      median: percentile(sorted, 0.5),
      mean: vals.reduce((a, b) => a + b, 0) / vals.length,
      p16: percentile(sorted, 0.16),
      p84: percentile(sorted, 0.84),
      p2_5: percentile(sorted, 0.025),
      p97_5: percentile(sorted, 0.975),
    };
  });

  return {
    points,
    annualVol: sd * Math.sqrt(252),
    dailyDrift: drift,
    sampleSize: n,
    paths,
    probUp: endings.filter((e) => e > S0).length / paths,
  };
}
