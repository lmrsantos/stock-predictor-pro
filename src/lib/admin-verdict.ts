// lib/admin-verdict.ts
// ─────────────────────────────────────────────────────────────────────────────
// ADMIN-ONLY. A deterministic Buy / Stay / Sell reading derived from the same
// evidence the checklist already gathered. No AI, no randomness — every point
// is traceable to a named rule so the reasoning can be audited.
//
// This is intentionally NOT exposed to normal users: the checklist itself never
// produces a verdict.
// ─────────────────────────────────────────────────────────────────────────────

import type { AutoSnapshot, SnapshotInput } from "@/lib/checklist-snapshot";

export type Verdict = "BUY" | "STAY" | "SELL";

export interface VerdictReason {
  label: string;
  points: number;
}

export interface AdminVerdict {
  verdict: Verdict;
  score: number;
  confidence: "low" | "moderate" | "high";
  reasons: VerdictReason[];
  headline: string;
}

function sma(closes: number[], n: number): number | null {
  if (closes.length < n) return null;
  const s = closes.slice(-n);
  return s.reduce((a, b) => a + b, 0) / n;
}

function pctOverBars(closes: number[], bars: number): number | null {
  if (closes.length < bars + 1) return null;
  const a = closes[closes.length - 1 - bars];
  const b = closes[closes.length - 1];
  return a > 0 ? ((b - a) / a) * 100 : null;
}

export function computeAdminVerdict(
  snapshot: AutoSnapshot,
  input?: SnapshotInput,
): AdminVerdict {
  const reasons: VerdictReason[] = [];
  const add = (label: string, points: number) => {
    if (points !== 0) reasons.push({ label, points });
  };

  const closes = input?.closes ?? [];
  const forecast = input?.forecast ?? null;
  const baseRates = input?.baseRates ?? null;

  // ── 1. Model direction, only when the rolling-window record earns a vote ────
  const v = forecast?.validation ?? null;
  const dirHit = v?.directionHitRate ?? 0;
  const band = forecast?.magnitudeSignal?.expectedMovePct ?? null;
  const fcPct = forecast?.forecastPct ?? null;
  const directionCredible = dirHit > 0.55 && (v?.windowCount ?? 0) >= 3;

  if (directionCredible && fcPct != null) {
    const actionable = band == null || Math.abs(fcPct) > band;
    if (!actionable) {
      add(`Projected ${fcPct.toFixed(1)}% is inside the ±${band?.toFixed(1)}% expected-move band — no edge`, 0);
    } else if (forecast?.modelDisagreement) {
      add(`Models split (${forecast.upCount} up / ${forecast.downCount} down) — direction discounted`, fcPct > 0 ? 1 : -1);
    } else {
      add(`Direction credible (${(dirHit * 100).toFixed(0)}% hit rate over ${v?.windowCount} windows), projecting ${fcPct.toFixed(1)}%`, fcPct > 0 ? 2 : -2);
    }
  } else {
    add(`Model direction not credible (${(dirHit * 100).toFixed(0)}% hit rate) — models excluded from this call`, 0);
  }

  // ── 2. Regime ──────────────────────────────────────────────────────────────
  const regime = (forecast?.regime as { regime?: string } | undefined)?.regime;
  if (regime) {
    const r = String(regime).toLowerCase();
    if (r.includes("bull") || r.includes("uptrend")) add(`Regime: ${regime}`, 1);
    else if (r.includes("bear") || r.includes("downtrend")) add(`Regime: ${regime}`, -1);
    else add(`Regime: ${regime} (neutral)`, 0);
  }

  // ── 3. Market structure vs the 50-day mean ─────────────────────────────────
  const last = closes.length ? closes[closes.length - 1] : null;
  const ma50 = sma(closes, 50);
  const ma200 = sma(closes, 200);
  if (last != null && ma50 != null) {
    const d = ((last / ma50) - 1) * 100;
    if (d > 12) add(`Price ${d.toFixed(0)}% above its 50-day mean — extended`, -1);
    else if (d > 0) add(`Price ${d.toFixed(0)}% above its 50-day mean`, 1);
    else if (d < -12) add(`Price ${Math.abs(d).toFixed(0)}% below its 50-day mean — washed out`, 1);
    else add(`Price ${Math.abs(d).toFixed(0)}% below its 50-day mean`, -1);
  }
  if (last != null && ma200 != null) {
    add(last > ma200 ? "Above the 200-day mean (primary trend up)" : "Below the 200-day mean (primary trend down)", last > ma200 ? 1 : -1);
  }

  // ── 4. Recent-move risk ────────────────────────────────────────────────────
  const ch1y = pctOverBars(closes, 252);
  if (ch1y != null && ch1y > 40) add(`Up ${ch1y.toFixed(0)}% over a year — entry risk elevated`, -1);
  if (ch1y != null && ch1y < -30) add(`Down ${Math.abs(ch1y).toFixed(0)}% over a year — either value or a broken story`, 0);

  // ── 5. Base-rate evidence ──────────────────────────────────────────────────
  const passing = (baseRates?.matches ?? []).filter(
    m => m.rate?.meetsConservativeCriteria && (m.rate?.excessHitRatePp ?? 0) > 0,
  );
  if (passing.length) {
    add(`${passing.length} setup(s) pass the track-record gate with positive excess hit rate: ${passing.map(m => m.name).join(", ")}`, 2);
  } else if ((baseRates?.matches ?? []).length === 0) {
    add("No historical setup matches — no base-rate support", -1);
  } else {
    add("Setups match but none clear the track-record gate", 0);
  }

  // ── 6. Fundamental / valuation concerns already flagged deterministically ───
  const c = snapshot.concerns.length;
  if (c >= 5) add(`${c} deterministic concerns flagged in the snapshot`, -3);
  else if (c >= 3) add(`${c} deterministic concerns flagged in the snapshot`, -2);
  else if (c >= 1) add(`${c} deterministic concern(s) flagged in the snapshot`, -1);
  else add("No deterministic concerns flagged", 1);

  const score = reasons.reduce((a, r) => a + r.points, 0);
  const verdict: Verdict = score >= 3 ? "BUY" : score <= -3 ? "SELL" : "STAY";

  const evidenceDepth = snapshot.autoFilledCount;
  const confidence: AdminVerdict["confidence"] =
    evidenceDepth >= 25 && directionCredible ? "high"
    : evidenceDepth >= 15 ? "moderate"
    : "low";

  const headline =
    verdict === "BUY"
      ? `Evidence leans to accumulating ${snapshot.ticker} (score ${score >= 0 ? "+" : ""}${score}).`
      : verdict === "SELL"
      ? `Evidence leans to reducing or exiting ${snapshot.ticker} (score ${score}).`
      : `Evidence is not decisive for ${snapshot.ticker} — stay / hold current position (score ${score >= 0 ? "+" : ""}${score}).`;

  return { verdict, score, confidence, reasons, headline };
}
