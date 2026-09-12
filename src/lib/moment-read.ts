// lib/moment-read.ts
// ─────────────────────────────────────────────────────────────────────────────
// Deterministic plain-English "read" for Quant Moment. Never an AI call.
// Banned words are never emitted: buy, sell, should, will, expect,
// t-statistic, ATR, regime, base rate, significance.
// ─────────────────────────────────────────────────────────────────────────────

export interface MomentReadInput {
  ticker: string;
  directionHitRate: number;
  windowCount: number;
  direction: "up" | "down";
  noTrend: boolean;
  support: number;
  resistance: number;
}

const money = (v: number) =>
  `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function buildRead(input: MomentReadInput): string[] {
  const { ticker, directionHitRate, windowCount, direction, noTrend } = input;
  const n = Math.round(directionHitRate * windowCount);

  let first: string;
  if (directionHitRate <= 0.55) {
    first =
      `The models can't tell which way ${ticker} goes from here — ` +
      `they got direction right in only ${n} of ${windowCount} tests.`;
  } else {
    first =
      `The models lean mildly ${direction === "up" ? "positive" : "negative"} on ${ticker}, ` +
      `right in ${n} of ${windowCount} tests — better than a coin flip, but not by much.`;
  }
  if (noTrend) first += " There's no measurable trend in the price right now.";

  const second =
    `Price has support around ${money(input.support)} and meets resistance near ${money(input.resistance)}.`;

  return [first, second];
}
