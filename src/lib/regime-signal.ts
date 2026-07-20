// Pure regime classification from macro indicators.

export type MacroIndicatorMap = Record<string, {
  value: number | null;
  previous_value?: number | null;
  change_30d?: number | null;
  as_of_date?: string | null;
  updated_at?: string;
}>;

export type RegimeTone = "risk-on" | "caution" | "risk-off";

export type RegimeContribution = {
  key: string;
  label: string;
  points: number;
};

export type RegimeBadge = {
  label: string;
  tone: RegimeTone;
  score: number;
  contributions: RegimeContribution[];
};

export function computeRegimeBadge(ind: MacroIndicatorMap): RegimeBadge {
  const contributions: RegimeContribution[] = [];
  let score = 0;

  const curve = ind.curve_10y2y?.value;
  if (curve != null && curve < 0) {
    score += 2;
    contributions.push({ key: "curve_10y2y", label: `Curve inverted (${curve.toFixed(2)})`, points: 2 });
  }

  const vix = ind.vix?.value;
  if (vix != null) {
    if (vix > 25) {
      score += 2;
      contributions.push({ key: "vix", label: `VIX ${vix.toFixed(1)}`, points: 2 });
    } else if (vix > 20) {
      score += 1;
      contributions.push({ key: "vix", label: `VIX ${vix.toFixed(1)}`, points: 1 });
    }
  }

  const gold30 = ind.gold?.change_30d;
  if (gold30 != null && gold30 > 5) {
    score += 1;
    contributions.push({ key: "gold", label: `Gold +${gold30.toFixed(1)}% (30d)`, points: 1 });
  }

  const wti30 = ind.wti?.change_30d;
  if (wti30 != null && wti30 > 10) {
    score += 1;
    contributions.push({ key: "wti", label: `WTI +${wti30.toFixed(1)}% (30d)`, points: 1 });
  }

  const cpi = ind.cpi_yoy?.value;
  if (cpi != null && cpi > 4) {
    score += 1;
    contributions.push({ key: "cpi_yoy", label: `CPI YoY ${cpi.toFixed(1)}%`, points: 1 });
  }

  let label: string;
  let tone: RegimeTone;
  if (score >= 4) { label = "Risk-off / defensive"; tone = "risk-off"; }
  else if (score >= 2) { label = "Late-cycle / caution"; tone = "caution"; }
  else { label = "Risk-on / expansion"; tone = "risk-on"; }

  return { label, tone, score, contributions };
}
