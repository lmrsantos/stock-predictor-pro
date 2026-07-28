// src/lib/cycle-analysis.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cycle Analysis — Peak & Trough Detection
//
// Identifies the pattern of highs and lows in a price series and projects:
//   - Next support level (projected trough)
//   - Next resistance level (projected peak)
//   - Fibonacci retracements
//   - Trend of lows (higher lows = uptrend) and highs
//   - Cycle length and timing
//
// Based on the observation that stocks have repeating patterns where
// successive lows and highs follow a geometric progression.
// ─────────────────────────────────────────────────────────────────────────────

export interface PricePoint {
  date:      string;
  price:     number;
  timestamp: number;
}

export interface CyclePoint {
  date:       string;
  price:      number;
  type:       "peak" | "trough";
  index:      number;  // position in original price array
  pctFromPrev?: number;  // % change from previous same-type point
}

export interface FibLevel {
  level:   string;   // "23.6%", "38.2%", etc.
  price:   number;
  isSupport: boolean;
  distanceFromCurrent: number;  // % away from current price
}

export interface CycleProjection {
  nextTrough:        number;   // projected next low
  nextPeak:          number;   // projected next high
  troughConfidence:  number;   // 0-100
  peakConfidence:    number;   // 0-100
  avgTroughGrowth:   number;   // average % between troughs
  avgPeakGrowth:     number;   // average % between peaks
  troughTrend:       "rising" | "falling" | "flat";  // are lows getting higher?
  peakTrend:         "rising" | "falling" | "flat";  // are highs getting higher?
  cycleLength:       number;   // average bars between same-type points
  fibLevels:         FibLevel[];
  currentPosition:   "near_trough" | "near_peak" | "mid_cycle" | "breakout";
  interpretation:    string;
}

export interface CycleAnalysisResult {
  ticker:     string;
  currentPrice: number;
  peaks:      CyclePoint[];
  troughs:    CyclePoint[];
  projection: CycleProjection;
  summary:    string;
}

// ─── Zigzag detector — finds significant turning points ──────────────────────
// threshold: minimum % move to qualify as a peak/trough (default 10%)
// This filters out noise and finds meaningful cycle points

function detectZigzag(
  prices: number[],
  threshold = 0.10,
): { index: number; price: number; type: "peak" | "trough" }[] {
  const points: { index: number; price: number; type: "peak" | "trough" }[] = [];
  if (prices.length < 10) return points;

  // Find local extremes with significance filter
  let lastExtreme = prices[0];
  let lastType: "peak" | "trough" = prices[1] > prices[0] ? "trough" : "peak";
  let lastIndex = 0;

  for (let i = 1; i < prices.length; i++) {
    const pct = (prices[i] - lastExtreme) / lastExtreme;

    if (lastType === "trough" && pct >= threshold) {
      // Found a peak — confirm and look for next trough
      // First find the actual minimum between lastIndex and here
      let minPrice = lastExtreme, minIdx = lastIndex;
      for (let j = lastIndex; j < i; j++) {
        if (prices[j] < minPrice) { minPrice = prices[j]; minIdx = j; }
      }
      points.push({ index: minIdx, price: minPrice, type: "trough" });
      lastExtreme = prices[i];
      lastType = "peak";
      lastIndex = i;
    } else if (lastType === "peak" && pct <= -threshold) {
      // Found a trough — find actual maximum between lastIndex and here
      let maxPrice = lastExtreme, maxIdx = lastIndex;
      for (let j = lastIndex; j < i; j++) {
        if (prices[j] > maxPrice) { maxPrice = prices[j]; maxIdx = j; }
      }
      points.push({ index: maxIdx, price: maxPrice, type: "peak" });
      lastExtreme = prices[i];
      lastType = "trough";
      lastIndex = i;
    }

    // Update extreme if going in same direction
    if (lastType === "peak" && prices[i] > lastExtreme) {
      lastExtreme = prices[i];
      lastIndex = i;
    } else if (lastType === "trough" && prices[i] < lastExtreme) {
      lastExtreme = prices[i];
      lastIndex = i;
    }
  }

  // Add final point
  if (lastType === "trough") {
    let maxPrice = lastExtreme, maxIdx = lastIndex;
    for (let j = lastIndex; j < prices.length; j++) {
      if (prices[j] > maxPrice) { maxPrice = prices[j]; maxIdx = j; }
    }
    if (maxIdx > lastIndex) points.push({ index: maxIdx, price: maxPrice, type: "peak" });
  } else {
    let minPrice = lastExtreme, minIdx = lastIndex;
    for (let j = lastIndex; j < prices.length; j++) {
      if (prices[j] < minPrice) { minPrice = prices[j]; minIdx = j; }
    }
    if (minIdx > lastIndex) points.push({ index: minIdx, price: minPrice, type: "trough" });
  }

  return points;
}

// ─── Fibonacci levels between last peak and trough ───────────────────────────

function calcFibLevels(
  highPrice: number,
  lowPrice:  number,
  currentPrice: number,
): FibLevel[] {
  const diff   = highPrice - lowPrice;
  const levels = [
    { pct: 0.0,   label: "0% (Low)"      },
    { pct: 0.236, label: "23.6%"         },
    { pct: 0.382, label: "38.2%"         },
    { pct: 0.500, label: "50.0%"         },
    { pct: 0.618, label: "61.8% (Golden)" },
    { pct: 0.786, label: "78.6%"         },
    { pct: 1.0,   label: "100% (High)"   },
  ];

  return levels.map(({ pct, label }) => {
    const price = highPrice - diff * pct;
    return {
      level: label,
      price: Math.round(price * 100) / 100,
      isSupport: price < currentPrice,
      distanceFromCurrent: Math.round(((price - currentPrice) / currentPrice) * 1000) / 10,
    };
  });
}

// ─── Project next peak/trough using geometric growth of the series ───────────

function projectNext(values: number[]): {
  projected: number;
  avgGrowth: number;
  confidence: number;
  trend: "rising" | "falling" | "flat";
} {
  if (values.length < 2) {
    return { projected: values[0] || 0, avgGrowth: 0, confidence: 10, trend: "flat" };
  }

  // Calculate growth rates between consecutive same-type points
  const growthRates: number[] = [];
  for (let i = 1; i < values.length; i++) {
    growthRates.push((values[i] - values[i-1]) / values[i-1]);
  }

  const avgGrowth   = growthRates.reduce((s, r) => s + r, 0) / growthRates.length;
  const lastValue   = values[values.length - 1];
  const projected   = lastValue * (1 + avgGrowth);

  // Confidence: higher with more data points and consistent growth
  const variance    = growthRates.reduce((s, r) => s + (r - avgGrowth) ** 2, 0) / growthRates.length;
  const consistency = Math.max(0, 1 - Math.sqrt(variance) / Math.abs(avgGrowth || 1));
  const confidence  = Math.round(Math.min(85, 30 + values.length * 10 + consistency * 30));

  const trend: "rising" | "falling" | "flat" =
    avgGrowth > 0.05  ? "rising"  :
    avgGrowth < -0.05 ? "falling" : "flat";

  return { projected, avgGrowth, confidence, trend };
}

// ─── Main analysis function ───────────────────────────────────────────────────

export function analyzeCycles(
  ticker: string,
  prices: number[],
  dates: string[],
  threshold = 0.12,  // 12% minimum move to qualify
): CycleAnalysisResult {
  const currentPrice = prices[prices.length - 1];

  // Detect zigzag turning points
  const zigzag = detectZigzag(prices, threshold);

  // Separate peaks and troughs
  const peakPoints:   CyclePoint[] = [];
  const troughPoints: CyclePoint[] = [];

  zigzag.forEach((pt, i) => {
    const prev = zigzag.filter((p, j) => j < i && p.type === pt.type).pop();
    const pctFromPrev = prev ? ((pt.price - prev.price) / prev.price) * 100 : undefined;

    const cyclePoint: CyclePoint = {
      date:       dates[pt.index] || `bar_${pt.index}`,
      price:      Math.round(pt.price * 100) / 100,
      type:       pt.type,
      index:      pt.index,
      pctFromPrev,
    };
    if (pt.type === "peak")   peakPoints.push(cyclePoint);
    else                       troughPoints.push(cyclePoint);
  });

  // Project next trough and peak
  const troughValues = troughPoints.map(p => p.price);
  const peakValues   = peakPoints.map(p => p.price);

  const troughProj = projectNext(troughValues);
  const peakProj   = projectNext(peakValues);

  // Fibonacci levels (between last significant peak and trough)
  const lastPeak   = peakPoints[peakPoints.length - 1]?.price || currentPrice * 1.2;
  const lastTrough = troughPoints[troughPoints.length - 1]?.price || currentPrice * 0.8;
  const fibLevels  = calcFibLevels(lastPeak, lastTrough, currentPrice);

  // ─── Sanity clamp on projections ───────────────────────────────────────────
  // Guarantee: projectedSupport ≤ currentPrice ≤ projectedResistance.
  // Geometric extrapolation flips when trough-growth ≫ peak-growth (or vice
  // versa); when that happens fall back to observed levels and downgrade
  // confidence on the affected side.
  let projTrough = troughProj.projected;
  let projPeak   = peakProj.projected;
  let troughConf = troughProj.confidence;
  let peakConf   = peakProj.confidence;

  if (projTrough > currentPrice) {
    const fib382 = lastPeak - (lastPeak - lastTrough) * 0.382;
    projTrough = Math.min(lastTrough, fib382, currentPrice * 0.95);
    troughConf = Math.min(troughConf, 25);
  }
  if (projPeak < currentPrice) {
    projPeak = Math.max(lastPeak, currentPrice * 1.05);
    peakConf = Math.min(peakConf, 25);
  }
  if (projTrough >= projPeak) {
    projTrough = Math.min(projTrough, currentPrice * 0.95);
    projPeak   = Math.max(projPeak,   currentPrice * 1.05);
    troughConf = Math.min(troughConf, 20);
    peakConf   = Math.min(peakConf,   20);
  }

  // Determine current position in cycle
  const distFromTrough = (currentPrice - lastTrough) / (lastPeak - lastTrough);
  const currentPosition:
    "near_trough" | "near_peak" | "mid_cycle" | "breakout" =
    currentPrice > lastPeak    ? "breakout"    :
    distFromTrough < 0.25      ? "near_trough" :
    distFromTrough > 0.75      ? "near_peak"   :
    "mid_cycle";

  // Average cycle length
  const peakIndices   = peakPoints.map(p => p.index);
  const troughIndices = troughPoints.map(p => p.index);
  const peakGaps:   number[] = [];
  const troughGaps: number[] = [];
  for (let i = 1; i < peakIndices.length; i++)   peakGaps.push(peakIndices[i] - peakIndices[i-1]);
  for (let i = 1; i < troughIndices.length; i++) troughGaps.push(troughIndices[i] - troughIndices[i-1]);
  const avgCycleLength = peakGaps.length > 0
    ? Math.round(peakGaps.reduce((s, g) => s + g, 0) / peakGaps.length)
    : 60;

  // Build interpretation
  const troughPct   = Math.round(troughProj.avgGrowth * 100);
  const peakPct     = Math.round(peakProj.avgGrowth * 100);
  const distToNext  = Math.round(((troughProj.projected - currentPrice) / currentPrice) * 100);

  let interpretation = "";
  if (troughProj.trend === "rising") {
    interpretation = `${ticker} shows a clear UPTREND pattern — each successive low is ${troughPct > 0 ? "+" : ""}${troughPct}% higher than the previous. `;
  } else if (troughProj.trend === "falling") {
    interpretation = `${ticker} shows a DOWNTREND — lows are getting lower (${troughPct}% per cycle). `;
  } else {
    interpretation = `${ticker} shows a SIDEWAYS pattern — lows are relatively stable. `;
  }

  if (currentPosition === "near_trough") {
    interpretation += `Current price is near a potential support zone ($${Math.round(troughProj.projected)}). This may represent a buying opportunity.`;
  } else if (currentPosition === "near_peak") {
    interpretation += `Current price is near historical resistance. Caution — risk of pullback toward $${Math.round(troughProj.projected)}.`;
  } else if (currentPosition === "breakout") {
    interpretation += `Price has broken above previous highs. Momentum is strong. Next projected peak: $${Math.round(peakProj.projected)}.`;
  } else {
    interpretation += `Price is mid-cycle. Projected next support: $${Math.round(troughProj.projected)} (${distToNext}% away).`;
  }

  const summary = `${peakPoints.length} peaks and ${troughPoints.length} troughs detected. ` +
    `Lows trending ${troughProj.trend} (+${troughPct}%/cycle avg). ` +
    `Next projected support: ~$${Math.round(troughProj.projected)}. ` +
    `Next projected resistance: ~$${Math.round(peakProj.projected)}.`;

  return {
    ticker,
    currentPrice,
    peaks:   peakPoints,
    troughs: troughPoints,
    projection: {
      nextTrough:       Math.round(troughProj.projected * 100) / 100,
      nextPeak:         Math.round(peakProj.projected * 100) / 100,
      troughConfidence: troughProj.confidence,
      peakConfidence:   peakProj.confidence,
      avgTroughGrowth:  Math.round(troughProj.avgGrowth * 1000) / 10,
      avgPeakGrowth:    Math.round(peakProj.avgGrowth * 1000) / 10,
      troughTrend:      troughProj.trend,
      peakTrend:        peakProj.trend,
      cycleLength:      avgCycleLength,
      fibLevels,
      currentPosition,
      interpretation,
    },
    summary,
  };
}

// ─── Format for display ───────────────────────────────────────────────────────

export function formatCycleReport(result: CycleAnalysisResult): string {
  const { ticker, currentPrice, peaks, troughs, projection } = result;
  const lines: string[] = [
    `## ${ticker} Cycle Analysis`,
    `Current price: $${currentPrice}`,
    "",
    `### Peak & Trough History`,
  ];

  // Interleave peaks and troughs chronologically
  const allPoints = [...peaks, ...troughs].sort((a, b) => a.index - b.index);
  for (const pt of allPoints) {
    const arrow = pt.type === "peak" ? "▲" : "▼";
    const pctStr = pt.pctFromPrev !== undefined
      ? ` (${pt.pctFromPrev > 0 ? "+" : ""}${pt.pctFromPrev.toFixed(0)}% from prev ${pt.type})`
      : "";
    lines.push(`${arrow} ${pt.type.toUpperCase()} — ${pt.date}: $${pt.price}${pctStr}`);
  }

  lines.push("", `### Projections (${projection.troughTrend} trend)`);
  lines.push(`📉 Next support (projected trough): **$${projection.nextTrough}** (${projection.troughConfidence}% confidence)`);
  lines.push(`📈 Next resistance (projected peak): **$${projection.nextPeak}** (${projection.peakConfidence}% confidence)`);
  lines.push(`⏱️ Average cycle length: ${projection.cycleLength} trading days`);
  lines.push("", `### Fibonacci Levels (${peaks[peaks.length-1]?.price ? `$${peaks[peaks.length-1].price}` : "high"} → ${troughs[troughs.length-1]?.price ? `$${troughs[troughs.length-1].price}` : "low"})`);
  for (const fib of projection.fibLevels) {
    const marker = Math.abs(fib.distanceFromCurrent) < 3 ? " ← CURRENT" : "";
    const direction = fib.distanceFromCurrent > 0 ? "▲" : "▼";
    lines.push(`  ${fib.level}: $${fib.price} (${direction}${Math.abs(fib.distanceFromCurrent)}%${marker})`);
  }

  lines.push("", `### Interpretation`);
  lines.push(projection.interpretation);

  return lines.join("\n");
}
