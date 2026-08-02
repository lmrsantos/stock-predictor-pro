// src/lib/historical-analogs.ts
// ─────────────────────────────────────────────────────────────────────────────
// Historical analog engine
//
// Instead of hard-coding a single "1970s + 1999 hybrid" thesis, this module
// holds a library of well-documented market episodes, each described by a
// normalized macro *fingerprint*. The current macro reading is turned into the
// same fingerprint and compared against every episode with a weighted
// similarity metric. The top matches (and their blend) drive the regime label,
// the equity bias, the risks and the re-entry signals.
//
// All values are approximate, publicly documented averages for the episode
// window. They are used for pattern matching only — not as precise history.
// ─────────────────────────────────────────────────────────────────────────────

export type AnalogFamily =
  | "inflation-shock"
  | "bubble-valuation"
  | "credit-crisis"
  | "policy-tightening"
  | "growth-scare"
  | "expansion";

export interface AnalogFingerprint {
  inflation:     number; // CPI YoY %
  realRate:      number; // 10y yield − CPI YoY
  curve:         number; // 10y − 2y spread
  oilStress:     number; // 0–1, real-terms energy stress
  valuation:     number; // Shiller CAPE
  vol:           number; // VIX (or VIX-equivalent realized vol)
  geoTension:    number; // 0–100 geopolitical stress
  goldStrength:  number; // 0–1 safe-haven bid on gold
  concentration: number; // 0–1 index concentration in few names
  creditStress:  number; // 0–1 credit-spread / funding stress
}

export interface HistoricalEpisode {
  id:          string;
  years:       string;
  name:        string;
  family:      AnalogFamily;
  fingerprint: AnalogFingerprint;
  equityBias:  number;  // 0–100 equity weight that historically fit the regime
  outcome:     string;  // what happened next
  playbook:    string;  // what historically worked
  keyRisk:     string;
  reEntry:     string;  // signal that historically marked the turn
}

// ─── Episode library ─────────────────────────────────────────────────────────

export const EPISODES: HistoricalEpisode[] = [
  {
    id: "1929", years: "1929–32", name: "1929 Crash & Debt Deflation",
    family: "credit-crisis",
    fingerprint: { inflation: -2, realRate: 6, curve: 0.3, oilStress: 0.2, valuation: 30, vol: 45, geoTension: 45, goldStrength: 0.8, concentration: 0.7, creditStress: 0.95 },
    equityBias: 10,
    outcome: "Peak-to-trough −86% over three years; deflation ate nominal earnings.",
    playbook: "Cash and government bonds dominated; gold repriced after devaluation.",
    keyRisk: "Debt deflation — falling prices raise the real burden of leverage.",
    reEntry: "Credit stress easing and bank funding normalizing, not price alone.",
  },
  {
    id: "1937", years: "1937–38", name: "1937 Policy Error",
    family: "policy-tightening",
    fingerprint: { inflation: 3.6, realRate: -0.8, curve: 1.0, oilStress: 0.3, valuation: 19, vol: 30, geoTension: 60, goldStrength: 0.6, concentration: 0.5, creditStress: 0.6 },
    equityBias: 25,
    outcome: "−49% in 12 months after premature tightening into a fragile recovery.",
    playbook: "Duration and quality; cyclicals lagged badly.",
    keyRisk: "Tightening fiscal and monetary policy at the same time.",
    reEntry: "Policy reversal — the tightening being explicitly abandoned.",
  },
  {
    id: "1966", years: "1966–68", name: "1966 Credit Crunch / Late Boom",
    family: "policy-tightening",
    fingerprint: { inflation: 3.4, realRate: 1.6, curve: 0.1, oilStress: 0.3, valuation: 22, vol: 20, geoTension: 65, goldStrength: 0.5, concentration: 0.5, creditStress: 0.5 },
    equityBias: 40,
    outcome: "Start of a 16-year nominal range; real returns eroded by inflation.",
    playbook: "Real assets and pricing-power equities beat the index.",
    keyRisk: "Inflation grinding higher while multiples slowly compress.",
    reEntry: "Real yields turning positive and staying there.",
  },
  {
    id: "1973", years: "1973–74", name: "1973 Oil Shock & Stagflation",
    family: "inflation-shock",
    fingerprint: { inflation: 9.5, realRate: -2.0, curve: -0.4, oilStress: 0.95, valuation: 18, vol: 30, geoTension: 85, goldStrength: 0.9, concentration: 0.6, creditStress: 0.6 },
    equityBias: 15,
    outcome: "−48% over 21 months as an energy shock crushed margins.",
    playbook: "Energy, gold and short bills; long duration and growth were punished.",
    keyRisk: "Supply-driven inflation that monetary policy cannot fix quickly.",
    reEntry: "Oil rolling over and inflation decelerating for two consecutive quarters.",
  },
  {
    id: "1979", years: "1979–82", name: "1979 Volcker Disinflation",
    family: "inflation-shock",
    fingerprint: { inflation: 12, realRate: 2.5, curve: -2.0, oilStress: 0.9, valuation: 9, vol: 25, geoTension: 80, goldStrength: 0.95, concentration: 0.4, creditStress: 0.7 },
    equityBias: 30,
    outcome: "Double-dip recession, then the greatest bond and equity bull market on record.",
    playbook: "Locking long rates near the peak; gold peaked early in the episode.",
    keyRisk: "Deep policy-induced recession before the payoff.",
    reEntry: "The Fed pivoting once inflation expectations broke.",
  },
  {
    id: "1987", years: "1987", name: "1987 Volatility Crash",
    family: "growth-scare",
    fingerprint: { inflation: 4.0, realRate: 5.0, curve: 1.2, oilStress: 0.4, valuation: 18, vol: 60, geoTension: 50, goldStrength: 0.6, concentration: 0.5, creditStress: 0.4 },
    equityBias: 55,
    outcome: "−34% in weeks, fully recovered within two years — fundamentals intact.",
    playbook: "Buying the dislocation worked; the economy never rolled over.",
    keyRisk: "Mechanical, liquidity-driven selling overshooting.",
    reEntry: "Volatility mean-reverting with credit spreads staying calm.",
  },
  {
    id: "1990", years: "1990–91", name: "1990 Gulf War Oil Spike",
    family: "inflation-shock",
    fingerprint: { inflation: 5.4, realRate: 2.8, curve: 0.2, oilStress: 0.8, valuation: 16, vol: 30, geoTension: 90, goldStrength: 0.7, concentration: 0.4, creditStress: 0.6 },
    equityBias: 40,
    outcome: "−20% drawdown, then a fast recovery once the oil premium unwound.",
    playbook: "Energy for the spike, then rotating out as the risk premium decayed.",
    keyRisk: "Confusing a war-risk premium with a structural supply shock.",
    reEntry: "Oil giving back the geopolitical premium within 5–10 sessions.",
  },
  {
    id: "1994", years: "1994", name: "1994 Bond Massacre",
    family: "policy-tightening",
    fingerprint: { inflation: 2.7, realRate: 4.5, curve: 1.5, oilStress: 0.3, valuation: 21, vol: 16, geoTension: 40, goldStrength: 0.4, concentration: 0.4, creditStress: 0.4 },
    equityBias: 55,
    outcome: "Flat equities, worst bond year in decades; 1995 then melted up.",
    playbook: "Short duration, cash equivalents, and patience.",
    keyRisk: "Rate shock transmitted through leverage, not through earnings.",
    reEntry: "Yields peaking as the hiking cycle ended.",
  },
  {
    id: "1998", years: "1998", name: "1998 LTCM / Late-Cycle Growth",
    family: "expansion",
    fingerprint: { inflation: 1.6, realRate: 3.5, curve: 0.4, oilStress: 0.2, valuation: 33, vol: 26, geoTension: 55, goldStrength: 0.4, concentration: 0.6, creditStress: 0.6 },
    equityBias: 60,
    outcome: "Sharp scare, aggressive easing, then a 12-month melt-up.",
    playbook: "Quality growth after the policy response; the trend had one more leg.",
    keyRisk: "Mistaking a funding scare for the end of the cycle.",
    reEntry: "Liquidity support arriving while growth data holds.",
  },
  {
    id: "1999", years: "1999–2000", name: "1999 Dot-com Peak",
    family: "bubble-valuation",
    fingerprint: { inflation: 3.0, realRate: 3.0, curve: -0.3, oilStress: 0.5, valuation: 43, vol: 25, geoTension: 45, goldStrength: 0.3, concentration: 0.85, creditStress: 0.4 },
    equityBias: 20,
    outcome: "−49% on the S&P, −78% on the Nasdaq over 2.5 years.",
    playbook: "Value, staples and bonds; index concentration unwound violently.",
    keyRisk: "Narrow leadership — the index is the story of a handful of names.",
    reEntry: "Capitulation in the leaders plus a real-rate cut cycle.",
  },
  {
    id: "2008", years: "2007–09", name: "2008 Global Financial Crisis",
    family: "credit-crisis",
    fingerprint: { inflation: 3.8, realRate: 0.2, curve: 0.5, oilStress: 0.85, valuation: 25, vol: 55, geoTension: 55, goldStrength: 0.7, concentration: 0.5, creditStress: 0.95 },
    equityBias: 10,
    outcome: "−57% peak-to-trough; funding markets, not valuation, drove the damage.",
    playbook: "Treasuries and cash; credit spreads led equities both down and up.",
    keyRisk: "Collateral and funding spirals inside the banking system.",
    reEntry: "Credit spreads compressing ahead of the equity low.",
  },
  {
    id: "2011", years: "2011", name: "2011 Sovereign Stress",
    family: "credit-crisis",
    fingerprint: { inflation: 3.2, realRate: -1.0, curve: 2.2, oilStress: 0.7, valuation: 21, vol: 40, geoTension: 75, goldStrength: 0.9, concentration: 0.4, creditStress: 0.7 },
    equityBias: 35,
    outcome: "−19% drawdown, resolved by central-bank backstops.",
    playbook: "Gold and Treasuries worked; the recovery was policy-driven.",
    keyRisk: "Sovereign, not private, balance sheets under stress.",
    reEntry: "An explicit central-bank backstop announcement.",
  },
  {
    id: "2015", years: "2015–16", name: "2015 Industrial Growth Scare",
    family: "growth-scare",
    fingerprint: { inflation: 0.5, realRate: 1.6, curve: 1.3, oilStress: 0.1, valuation: 25, vol: 24, geoTension: 50, goldStrength: 0.4, concentration: 0.55, creditStress: 0.5 },
    equityBias: 55,
    outcome: "Two 12–14% drawdowns and no recession; the cycle extended.",
    playbook: "Adding on weakness in quality cyclicals paid off.",
    keyRisk: "Deflationary commodity bust bleeding into credit.",
    reEntry: "Manufacturing surveys inflecting higher.",
  },
  {
    id: "2018", years: "2018", name: "2018 QT Tantrum",
    family: "policy-tightening",
    fingerprint: { inflation: 2.4, realRate: 0.5, curve: 0.2, oilStress: 0.5, valuation: 31, vol: 25, geoTension: 60, goldStrength: 0.4, concentration: 0.65, creditStress: 0.45 },
    equityBias: 50,
    outcome: "−20% Q4 drawdown reversed by a policy pivot in January.",
    playbook: "Duration late in the drawdown; the pivot was the trade.",
    keyRisk: "Tightening into slowing global growth.",
    reEntry: "The central bank explicitly pausing.",
  },
  {
    id: "2020", years: "2020", name: "2020 Exogenous Shock & Reflation",
    family: "growth-scare",
    fingerprint: { inflation: 1.2, realRate: -0.5, curve: 0.5, oilStress: 0.05, valuation: 30, vol: 65, geoTension: 60, goldStrength: 0.85, concentration: 0.8, creditStress: 0.8 },
    equityBias: 50,
    outcome: "−34% in 33 days, then the fastest recovery on record on massive stimulus.",
    playbook: "Long duration growth and gold; policy response outweighed the shock.",
    keyRisk: "Assuming policy will always arrive that fast.",
    reEntry: "Unlimited liquidity support plus vol collapsing from extremes.",
  },
  {
    id: "2022", years: "2022", name: "2022 Inflation & Rate Shock",
    family: "inflation-shock",
    fingerprint: { inflation: 8.0, realRate: -4.5, curve: -0.5, oilStress: 0.8, valuation: 34, vol: 28, geoTension: 85, goldStrength: 0.6, concentration: 0.8, creditStress: 0.5 },
    equityBias: 30,
    outcome: "Stocks −25% and bonds −17% together — the classic 60/40 failure year.",
    playbook: "Cash, T-bills, energy and managed futures; diversification failed.",
    keyRisk: "Positive stock/bond correlation removing the usual hedge.",
    reEntry: "Core inflation decelerating three months running.",
  },
  {
    id: "2024", years: "2023–24", name: "2023 Narrow AI-Led Rally",
    family: "bubble-valuation",
    fingerprint: { inflation: 3.2, realRate: 1.0, curve: -0.6, oilStress: 0.5, valuation: 34, vol: 15, geoTension: 70, goldStrength: 0.8, concentration: 0.9, creditStress: 0.3 },
    equityBias: 55,
    outcome: "Strong index returns concentrated in a handful of mega-caps.",
    playbook: "Owning the leaders worked, but breadth stayed the key risk.",
    keyRisk: "Extreme concentration — index risk is single-theme risk.",
    reEntry: "Broadening breadth confirming the move beyond the leaders.",
  },
  {
    id: "1996", years: "1995–96", name: "Mid-Cycle Expansion",
    family: "expansion",
    fingerprint: { inflation: 2.8, realRate: 3.5, curve: 0.8, oilStress: 0.3, valuation: 24, vol: 14, geoTension: 35, goldStrength: 0.3, concentration: 0.45, creditStress: 0.25 },
    equityBias: 75,
    outcome: "Multi-year expansion with rising earnings and stable policy.",
    playbook: "Staying invested; drawdowns were shallow and short.",
    keyRisk: "Complacency into the late-cycle transition.",
    reEntry: "Not applicable — the regime itself is constructive.",
  },
];

// ─── Present-day macro reading ───────────────────────────────────────────────

export interface MacroReading {
  oilPrice:      number;
  goldPrice:     number;
  capeRatio:     number;
  geoTension:    number;         // 0–100
  us10y?:        number | null;
  cpiYoY?:       number | null;
  fedFunds?:     number | null;
  curve10y2y?:   number | null;
  vix?:          number | null;
  gold30dChange?: number | null; // %
  oil30dChange?: number | null;  // %
  concentration?: number | null; // 0–1 if known
  creditStress?: number | null;  // 0–1 if known
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function fingerprintFromReading(m: MacroReading): AnalogFingerprint {
  const cpi = m.cpiYoY ?? 3;
  const us10y = m.us10y ?? 4.3;
  // Real oil stress: $60 → 0, $130+ → 1, boosted by a fast 30d move.
  const oilLevel = clamp01((m.oilPrice - 60) / 70);
  const oilMomentum = clamp01((m.oil30dChange ?? 0) / 25);
  const goldMomentum = clamp01((m.gold30dChange ?? 0) / 15);
  return {
    inflation:     cpi,
    realRate:      us10y - cpi,
    curve:         m.curve10y2y ?? 0.1,
    oilStress:     clamp01(0.7 * oilLevel + 0.3 * oilMomentum),
    valuation:     m.capeRatio,
    vol:           m.vix ?? 18,
    geoTension:    m.geoTension,
    // Gold above $2,500 is treated as a strong structural safe-haven bid.
    goldStrength:  clamp01(0.6 * clamp01((m.goldPrice - 1800) / 1800) + 0.4 * goldMomentum),
    concentration: m.concentration ?? 0.85, // present-day default: very narrow leadership
    creditStress:  m.creditStress ?? clamp01(((m.vix ?? 18) - 14) / 40),
  };
}

// ─── Similarity ──────────────────────────────────────────────────────────────

// Scale = the difference that counts as "one unit of dissimilarity".
const SCALE: Record<keyof AnalogFingerprint, number> = {
  inflation: 4, realRate: 3.5, curve: 1.5, oilStress: 0.45,
  valuation: 10, vol: 20, geoTension: 30, goldStrength: 0.45,
  concentration: 0.35, creditStress: 0.4,
};

const WEIGHT: Record<keyof AnalogFingerprint, number> = {
  inflation: 1.3, realRate: 1.1, curve: 0.7, oilStress: 1.1,
  valuation: 1.4, vol: 0.8, geoTension: 0.9, goldStrength: 0.8,
  concentration: 1.2, creditStress: 1.0,
};

export interface AnalogMatch {
  episode:    HistoricalEpisode;
  similarity: number;                    // 0–100
  drivers:    { dim: string; note: string }[]; // dimensions that matched closely
}

export function rankAnalogs(m: MacroReading): AnalogMatch[] {
  const now = fingerprintFromReading(m);
  const keys = Object.keys(SCALE) as (keyof AnalogFingerprint)[];

  const matches = EPISODES.map((ep) => {
    let wsum = 0;
    let dsum = 0;
    const per: { dim: keyof AnalogFingerprint; norm: number }[] = [];
    for (const k of keys) {
      const norm = Math.abs(now[k] - ep.fingerprint[k]) / SCALE[k];
      per.push({ dim: k, norm });
      dsum += WEIGHT[k] * norm * norm;
      wsum += WEIGHT[k];
    }
    const rms = Math.sqrt(dsum / wsum);
    const similarity = Math.round(100 * Math.exp(-0.8 * rms));
    const drivers = per
      .filter((p) => p.norm < 0.5)
      .sort((a, b) => a.norm - b.norm)
      .slice(0, 3)
      .map((p) => ({ dim: p.dim, note: describeDim(p.dim, now[p.dim], ep) }));
    return { episode: ep, similarity, drivers };
  });

  return matches.sort((a, b) => b.similarity - a.similarity);
}

function describeDim(dim: keyof AnalogFingerprint, value: number, ep: HistoricalEpisode): string {
  const v = (n: number, d = 1) => n.toFixed(d);
  switch (dim) {
    case "inflation":     return `Inflation ${v(value)}% vs ${v(ep.fingerprint.inflation)}% in ${ep.years}`;
    case "realRate":      return `Real 10y ${v(value)}% vs ${v(ep.fingerprint.realRate)}%`;
    case "curve":         return `10y–2y ${v(value, 2)} vs ${v(ep.fingerprint.curve, 2)}`;
    case "oilStress":     return `Energy stress ${v(value, 2)} vs ${v(ep.fingerprint.oilStress, 2)}`;
    case "valuation":     return `CAPE ${v(value, 0)}x vs ~${v(ep.fingerprint.valuation, 0)}x`;
    case "vol":           return `Volatility ${v(value, 0)} vs ~${v(ep.fingerprint.vol, 0)}`;
    case "geoTension":    return `Geopolitical stress ${v(value, 0)}/100 vs ~${v(ep.fingerprint.geoTension, 0)}`;
    case "goldStrength":  return `Safe-haven gold bid ${v(value, 2)} vs ${v(ep.fingerprint.goldStrength, 2)}`;
    case "concentration": return `Index concentration ${v(value, 2)} vs ${v(ep.fingerprint.concentration, 2)}`;
    case "creditStress":  return `Credit/funding stress ${v(value, 2)} vs ${v(ep.fingerprint.creditStress, 2)}`;
  }
}
