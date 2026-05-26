// src/lib/portfolio-engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Portfolio Advisor Engine
// Regime-aware asset allocator combining:
//   - Macro regime classification (1970s+1999 hybrid, mid-1998, etc.)
//   - Personal investor profile (horizon, risk, income, liquidity)
//   - Quantitative signals (AE model, geo tension, oil price)
//   - Cross-asset allocation across ALL instrument types
// ─────────────────────────────────────────────────────────────────────────────

// ─── Investor Profile ─────────────────────────────────────────────────────────

export interface InvestorProfile {
  horizon:       "short" | "medium" | "long";        // <1yr, 1-5yr, 5yr+
  riskBehavior:  "sell" | "hold" | "buy";            // if portfolio drops 20%
  incomeNeeded:  boolean;                            // monthly income required
  taxAdvantaged: boolean;                            // IRA/401k vs taxable
  canLockFunds:  boolean;                            // ok with CDs/illiquid
  exclusions:    string[];                           // sectors to avoid
  amount:        number | null;                      // investment amount
  existingCash:  boolean;                            // has existing positions
}

// ─── Macro Regime ─────────────────────────────────────────────────────────────

export type MacroRegime =
  | "hybrid_1970s_1999"     // YOUR THESIS: oil shock + tech bubble simultaneously
  | "mid_1998"              // late cycle growth, still has runway
  | "late_1996"             // early cycle, full risk-on
  | "early_2000"            // bubble peak, defensive
  | "crisis_2008"           // credit crisis, maximum defensive
  | "recovery_2020"         // sharp crash + fast recovery
  | "neutral";              // no clear analog

export interface RegimeAssessment {
  regime:      MacroRegime;
  confidence:  number;       // 0-100
  label:       string;
  description: string;
  equityBias:  number;       // 0-100% suggested equity allocation
  signals:     string[];     // what triggered this regime
  risks:       string[];     // what could change it
  nextTrigger: string;       // most important signal to watch
}

// ─── Asset Classes ────────────────────────────────────────────────────────────

export interface Instrument {
  ticker:      string;
  name:        string;
  type:        "etf" | "stock" | "cd" | "cash" | "bond";
  assetClass:  string;
  yield?:      number;       // annual yield %
  liquidity:   "daily" | "locked" | "instant";
  riskLevel:   1 | 2 | 3 | 4;
  fdic?:       boolean;
  minAmount?:  number;
  rationale:   string;
}

export interface AllocationBucket {
  name:        string;
  emoji:       string;
  pct:         number;       // % of portfolio
  amount:      number | null;
  color:       string;
  instruments: { instrument: Instrument; pct: number; amount: number | null }[];
  rationale:   string;
}

export interface PortfolioRecommendation {
  regime:      RegimeAssessment;
  profile:     InvestorProfile;
  buckets:     AllocationBucket[];
  totalPct:    number;
  reEntryTriggers: string[];
  avoidList:   string[];
  summary:     string;
  generatedAt: string;
}

// ─── Instrument Database ─────────────────────────────────────────────────────

export const INSTRUMENTS: Record<string, Instrument> = {
  // ── T-bills / Cash equivalents ────────────────────────────────────────────
  BIL: {
    ticker: "BIL", name: "iShares 1-3 Month Treasury ETF",
    type: "etf", assetClass: "Cash Equivalent",
    yield: 4.8, liquidity: "daily", riskLevel: 1,
    rationale: "Highest-quality liquid cash equivalent. Zero duration risk. Tracks 3-month T-bill rate. Sells same day.",
  },
  SGOV: {
    ticker: "SGOV", name: "iShares 0-3 Month Treasury ETF",
    type: "etf", assetClass: "Cash Equivalent",
    yield: 4.8, liquidity: "daily", riskLevel: 1,
    rationale: "Overnight government bonds. Essentially cash with 4.8% yield. No lock-in.",
  },
  SHV: {
    ticker: "SHV", name: "iShares Short Treasury ETF",
    type: "etf", assetClass: "Cash Equivalent",
    yield: 4.7, liquidity: "daily", riskLevel: 1,
    rationale: "Short-term Treasury ETF. Minimal duration risk, government guaranteed.",
  },
  CD_12M: {
    ticker: "CD_12M", name: "12-Month CD (Best Rate: 5.00% APY)",
    type: "cd", assetClass: "Certificate of Deposit",
    yield: 5.0, liquidity: "locked", riskLevel: 1, fdic: true, minAmount: 10,
    rationale: "A+ Federal Credit Union: 5.00% APY, 12-month term, $10 minimum, FDIC insured. Best rate available May 2026.",
  },
  CD_6M: {
    ticker: "CD_6M", name: "6-Month CD (Best Rate: 4.15% APY)",
    type: "cd", assetClass: "Certificate of Deposit",
    yield: 4.15, liquidity: "locked", riskLevel: 1, fdic: true, minAmount: 1000,
    rationale: "United Fidelity Bank: 4.15% APY, 6-month term. Good if you want to reassess in 6 months.",
  },
  CD_3M: {
    ticker: "CD_3M", name: "3-Month CD (Best Rate: 4.30% APY)",
    type: "cd", assetClass: "Certificate of Deposit",
    yield: 4.30, liquidity: "locked", riskLevel: 1, fdic: true, minAmount: 1000,
    rationale: "First National Bank of America: 4.30% APY, 3-month term. Short lock-in with guaranteed return.",
  },

  // ── Bonds ─────────────────────────────────────────────────────────────────
  VGSH: {
    ticker: "VGSH", name: "Vanguard Short-Term Treasury ETF",
    type: "etf", assetClass: "Short-Term Bonds",
    yield: 4.2, liquidity: "daily", riskLevel: 1,
    rationale: "1-3 year Treasury bonds. Minimal duration risk vs TLT. Safe in rising rate environment.",
  },
  TIPS: {
    ticker: "TIPS", name: "iShares TIPS Bond ETF",
    type: "etf", assetClass: "Inflation-Protected Bonds",
    yield: 3.5, liquidity: "daily", riskLevel: 1,
    rationale: "Treasury Inflation-Protected Securities. Principal adjusts with CPI. Best bond in stagflation scenario.",
  },
  IEF: {
    ticker: "IEF", name: "iShares 7-10 Year Treasury ETF",
    type: "etf", assetClass: "Medium-Term Bonds",
    yield: 4.1, liquidity: "daily", riskLevel: 2,
    rationale: "7-10yr Treasuries. Good when rates peak and start falling. AVOID when yields rising.",
  },
  TLT: {
    ticker: "TLT", name: "iShares 20+ Year Treasury ETF",
    type: "etf", assetClass: "Long-Term Bonds",
    yield: 4.5, liquidity: "daily", riskLevel: 3,
    rationale: "Long-duration bonds. Big gains when rates fall sharply. Risky when yields rise.",
  },
  LQD: {
    ticker: "LQD", name: "iShares Investment Grade Corporate Bond ETF",
    type: "etf", assetClass: "Corporate Bonds",
    yield: 5.2, liquidity: "daily", riskLevel: 2,
    rationale: "Investment grade corporate bonds. Higher yield than Treasuries with moderate credit risk.",
  },
  AGG: {
    ticker: "AGG", name: "iShares Core US Aggregate Bond ETF",
    type: "etf", assetClass: "Broad Bonds",
    yield: 4.0, liquidity: "daily", riskLevel: 2,
    rationale: "Broad bond market exposure. Good core fixed income holding for moderate profiles.",
  },

  // ── Gold & Real Assets ─────────────────────────────────────────────────────
  GLD: {
    ticker: "GLD", name: "SPDR Gold Shares ETF",
    type: "etf", assetClass: "Gold",
    liquidity: "daily", riskLevel: 2,
    rationale: "Physical gold backed ETF. Best hedge for 1970s analog (geopolitical + inflation). Gold at ATH $4,510 confirms thesis.",
  },
  IAU: {
    ticker: "IAU", name: "iShares Gold Trust ETF",
    type: "etf", assetClass: "Gold",
    liquidity: "daily", riskLevel: 2,
    rationale: "Same as GLD but lower expense ratio (0.25% vs 0.40%). Preferred for long-term gold holding.",
  },
  SLV: {
    ticker: "SLV", name: "iShares Silver Trust ETF",
    type: "etf", assetClass: "Silver",
    liquidity: "daily", riskLevel: 3,
    rationale: "Silver has industrial + monetary demand. More volatile than gold but higher upside in inflation.",
  },
  VNQ: {
    ticker: "VNQ", name: "Vanguard Real Estate ETF",
    type: "etf", assetClass: "Real Estate",
    yield: 4.1, liquidity: "daily", riskLevel: 3,
    rationale: "Diversified REITs. Real asset inflation hedge + income. Sensitive to interest rates.",
  },

  // ── Energy / Oil ──────────────────────────────────────────────────────────
  XLE: {
    ticker: "XLE", name: "Energy Select Sector SPDR ETF",
    type: "etf", assetClass: "Energy",
    yield: 3.2, liquidity: "daily", riskLevel: 3,
    rationale: "Broad US energy sector. Direct 1970s analog play. Oil at $103 = energy producers win.",
  },
  XOM: {
    ticker: "XOM", name: "Exxon Mobil Corporation",
    type: "stock", assetClass: "Energy",
    yield: 3.4, liquidity: "daily", riskLevel: 3,
    rationale: "Largest US oil company. Strong dividend. Direct beneficiary of Iran conflict oil premium.",
  },
  CVX: {
    ticker: "CVX", name: "Chevron Corporation",
    type: "stock", assetClass: "Energy",
    yield: 4.2, liquidity: "daily", riskLevel: 3,
    rationale: "Second largest US oil. Higher dividend than XOM. Balanced upstream/downstream exposure.",
  },

  // ── Income / Dividends ────────────────────────────────────────────────────
  SCHD: {
    ticker: "SCHD", name: "Schwab US Dividend Equity ETF",
    type: "etf", assetClass: "Dividend Stocks",
    yield: 3.8, liquidity: "daily", riskLevel: 3,
    rationale: "High-quality dividend growth ETF. 3.8% yield + price appreciation. Core income holding.",
  },
  VYM: {
    ticker: "VYM", name: "Vanguard High Dividend Yield ETF",
    type: "etf", assetClass: "Dividend Stocks",
    yield: 3.2, liquidity: "daily", riskLevel: 3,
    rationale: "Broad high dividend exposure. Value-tilt provides some downside protection.",
  },
  JEPI: {
    ticker: "JEPI", name: "JPMorgan Equity Premium Income ETF",
    type: "etf", assetClass: "Covered Call Income",
    yield: 7.5, liquidity: "daily", riskLevel: 3,
    rationale: "7.5% monthly income via covered calls on S&P 500. Caps upside but generates income in sideways market.",
  },

  // ── Defensive Equities ────────────────────────────────────────────────────
  WMT: {
    ticker: "WMT", name: "Walmart Inc.",
    type: "stock", assetClass: "Consumer Staples",
    yield: 1.0, liquidity: "daily", riskLevel: 3,
    rationale: "Recession-proof retailer. Historically outperforms in downturns as consumers trade down.",
  },
  PG: {
    ticker: "PG", name: "Procter & Gamble Co.",
    type: "stock", assetClass: "Consumer Staples",
    yield: 2.4, liquidity: "daily", riskLevel: 2,
    rationale: "Consumer staples giant. 67 consecutive years of dividend increases. Safe haven in volatility.",
  },
  KO: {
    ticker: "KO", name: "Coca-Cola Company",
    type: "stock", assetClass: "Consumer Staples",
    yield: 3.0, liquidity: "daily", riskLevel: 2,
    rationale: "Buffett's favorite defensive holding. Pricing power + global brand = inflation resistant.",
  },

  // ── Volatility Hedge (sophisticated) ──────────────────────────────────────
  DBMF: {
    ticker: "DBMF", name: "iMGP DBi Managed Futures ETF",
    type: "etf", assetClass: "Managed Futures",
    liquidity: "daily", riskLevel: 3,
    rationale: "Trend-following managed futures. Historically profits in both crashes and inflation. Uncorrelated to stocks.",
  },
};

// ─── Regime Classifier ────────────────────────────────────────────────────────

export function classifyRegime(
  oilPrice: number,
  goldPrice: number,
  capeRatio: number,
  geoTensionScore: number,
  bondYieldRising: boolean,
): RegimeAssessment {

  const signals: string[] = [];
  const risks: string[] = [];

  // ── 1970s+1999 Hybrid Detection (YOUR THESIS) ─────────────────────────────
  const is1970s = oilPrice > 90 && geoTensionScore > 60;
  const is1999  = capeRatio > 30 && goldPrice > 3000;
  const isHybrid = is1970s && is1999;
  const isBondStress = bondYieldRising && capeRatio > 28;

  if (isHybrid && isBondStress) {
    if (oilPrice > 90) signals.push(`Oil at $${oilPrice} (1970s energy crisis analog)`);
    if (geoTensionScore > 60) signals.push(`Geopolitical tension ${geoTensionScore}/100 (multipolar fragmentation)`);
    if (capeRatio > 30) signals.push(`Shiller CAPE at ${capeRatio}x (1999 tech bubble analog)`);
    if (goldPrice > 3000) signals.push(`Gold at $${goldPrice.toLocaleString()} (simultaneous safe haven demand)`);
    if (bondYieldRising) signals.push("Bonds AND stocks falling simultaneously (most dangerous signal)");

    risks.push("Scenario A: Geopolitics wins → oil crushes tech margins → 1974-style crash");
    risks.push("Scenario B: AI productivity wins → both tech and gold continue higher");
    risks.push("Scenario C: Both break simultaneously → -40-50% broad market");

    return {
      regime: "hybrid_1970s_1999",
      confidence: 85,
      label: "🌋 1970s + 1999 Hybrid",
      description: "The most underappreciated macro regime. Oil shock AND technology bubble simultaneously active. Most analysts are using a single analog — they're missing the convergence risk. Capital preservation mode with strategic real asset exposure.",
      equityBias: 10,
      signals,
      risks,
      nextTrigger: "NVIDIA earnings — beat confirms 1999 analog still active. Miss triggers Scenario C.",
    };
  }

  // ── Early 2000 (bubble peak) ──────────────────────────────────────────────
  if (capeRatio > 40 && !is1970s) {
    signals.push(`CAPE ${capeRatio}x — 2nd highest in 154 years`);
    return {
      regime: "early_2000",
      confidence: 75,
      label: "⚠️ Bubble Peak Risk",
      description: "Valuations at historical extremes. Similar to early 2000. Rotate defensive.",
      equityBias: 15,
      signals, risks,
      nextTrigger: "Fed policy shift or earnings miss from mega-cap tech.",
    };
  }

  // ── Mid-1998 (late cycle growth) ──────────────────────────────────────────
  if (capeRatio > 28 && capeRatio <= 38 && !is1970s && !bondYieldRising) {
    signals.push(`CAPE ${capeRatio}x — elevated but not extreme`);
    signals.push("Bond yields stable — financial conditions manageable");
    return {
      regime: "mid_1998",
      confidence: 65,
      label: "📈 Late Cycle Growth",
      description: "Elevated valuations but growth momentum intact. Similar to mid-1998. Stay invested in quality but reduce risk.",
      equityBias: 50,
      signals, risks,
      nextTrigger: "Yield curve inversion or credit spread widening.",
    };
  }

  // ── 2008 Crisis ───────────────────────────────────────────────────────────
  if (bondYieldRising && capeRatio < 20 && geoTensionScore > 70) {
    return {
      regime: "crisis_2008",
      confidence: 70,
      label: "🚨 Credit Crisis",
      description: "Maximum defensive. Capital preservation above all.",
      equityBias: 5,
      signals, risks,
      nextTrigger: "Fed emergency intervention or credit spread compression.",
    };
  }

  // ── Neutral ───────────────────────────────────────────────────────────────
  return {
    regime: "neutral",
    confidence: 40,
    label: "⚖️ Mixed Signals",
    description: "No clear analog. Balanced approach with defensive tilt.",
    equityBias: 35,
    signals: ["Mixed macro signals — no dominant analog"],
    risks: ["Unexpected policy shift", "Geopolitical escalation"],
    nextTrigger: "Watch oil price and Fed meeting for regime clarity.",
  };
}

// ─── Portfolio Allocation Engine ──────────────────────────────────────────────

export function buildAllocation(
  regime: RegimeAssessment,
  profile: InvestorProfile,
): AllocationBucket[] {
  const amount = profile.amount;
  const pct = (p: number) => p;
  const amt = (p: number) => amount ? Math.round(amount * p / 100) : null;

  // ── Adjust equity bias based on profile ──────────────────────────────────
  let equityPct = regime.equityBias;
  if (profile.riskBehavior === "sell")   equityPct = Math.max(0,  equityPct - 15);
  if (profile.riskBehavior === "buy")    equityPct = Math.min(40, equityPct + 10);
  if (profile.horizon === "short")       equityPct = Math.max(0,  equityPct - 20);
  if (profile.horizon === "long")        equityPct = Math.min(50, equityPct + 15);
  if (profile.incomeNeeded)             equityPct = Math.max(5,  equityPct - 5);

  const defensivePct = 100 - equityPct;

  // ── Build buckets based on regime ────────────────────────────────────────
  const buckets: AllocationBucket[] = [];

  if (regime.regime === "hybrid_1970s_1999") {
    // Capital preservation
    const cashPct = profile.canLockFunds ? 20 : 30;
    const cdPct   = profile.canLockFunds ? 20 : 0;
    const billPct = 30 - (profile.canLockFunds ? 0 : 10);

    buckets.push({
      name: "Capital Preservation",
      emoji: "🛡️",
      pct: pct(cashPct + cdPct + billPct),
      amount: amt(cashPct + cdPct + billPct),
      color: "text-green-400",
      rationale: "In a hybrid 1970s+1999 regime, capital preservation is the priority. T-bills and CDs yield 4.8-5.0% with zero risk.",
      instruments: [
        { instrument: INSTRUMENTS.BIL,    pct: pct(billPct), amount: amt(billPct) },
        ...(profile.canLockFunds ? [
          { instrument: INSTRUMENTS.CD_12M, pct: pct(cdPct),   amount: amt(cdPct) },
        ] : []),
        { instrument: INSTRUMENTS.SGOV,   pct: pct(cashPct), amount: amt(cashPct) },
      ],
    });

    // Inflation / geopolitical hedge
    const goldPct   = 20;
    const energyPct = 10;
    const tipsPct   = profile.horizon !== "short" ? 5 : 0;
    buckets.push({
      name: "Inflation & Geopolitical Hedge",
      emoji: "🪙",
      pct: pct(goldPct + energyPct + tipsPct),
      amount: amt(goldPct + energyPct + tipsPct),
      color: "text-yellow-400",
      rationale: "Gold at $4,510 ATH confirms 1970s analog. Oil at $103 means energy producers win. TIPS protect against sticky inflation.",
      instruments: [
        { instrument: INSTRUMENTS.IAU,  pct: pct(goldPct),   amount: amt(goldPct) },
        { instrument: INSTRUMENTS.XLE,  pct: pct(energyPct), amount: amt(energyPct) },
        ...(tipsPct > 0 ? [{ instrument: INSTRUMENTS.TIPS, pct: pct(tipsPct), amount: amt(tipsPct) }] : []),
      ],
    });

    // Income (if needed)
    if (profile.incomeNeeded) {
      const incomePct = 15;
      buckets.push({
        name: "Income Generation",
        emoji: "💰",
        pct: pct(incomePct),
        amount: amt(incomePct),
        color: "text-blue-400",
        rationale: "JEPI generates 7.5% monthly income via covered calls. SCHD provides dividend growth. Combined: strong income with equity exposure.",
        instruments: [
          { instrument: INSTRUMENTS.JEPI, pct: pct(8),  amount: amt(8) },
          { instrument: INSTRUMENTS.SCHD, pct: pct(7),  amount: amt(7) },
        ],
      });
    }

    // Dry powder
    const dryPct = 10;
    buckets.push({
      name: "Dry Powder",
      emoji: "⚡",
      pct: pct(dryPct),
      amount: amt(dryPct),
      color: "text-sky-400",
      rationale: "Cash reserved for deployment when NVIDIA earnings clarify the regime. Don't invest this until you have a clear signal.",
      instruments: [
        { instrument: INSTRUMENTS.BIL, pct: pct(dryPct), amount: amt(dryPct) },
      ],
    });

    // Equities (minimal)
    if (equityPct > 0) {
      buckets.push({
        name: "Defensive Equities",
        emoji: "📊",
        pct: pct(equityPct),
        amount: amt(equityPct),
        color: "text-purple-400",
        rationale: "Minimal equity exposure in recession-proof names. Consumer staples survived every crash since 1929.",
        instruments: [
          { instrument: INSTRUMENTS.PG,  pct: pct(Math.floor(equityPct/3)),   amount: amt(Math.floor(equityPct/3)) },
          { instrument: INSTRUMENTS.KO,  pct: pct(Math.floor(equityPct/3)),   amount: amt(Math.floor(equityPct/3)) },
          { instrument: INSTRUMENTS.WMT, pct: pct(equityPct - 2*Math.floor(equityPct/3)), amount: amt(equityPct - 2*Math.floor(equityPct/3)) },
        ],
      });
    }

  } else if (regime.regime === "mid_1998") {
    // Balanced growth portfolio
    buckets.push({
      name: "Growth Equities",
      emoji: "📈",
      pct: pct(equityPct),
      amount: amt(equityPct),
      color: "text-purple-400",
      rationale: "Late cycle growth — quality tech and sector leaders still have runway.",
      instruments: [
        { instrument: INSTRUMENTS.SCHD, pct: pct(Math.round(equityPct * 0.4)), amount: amt(Math.round(equityPct * 0.4)) },
        { instrument: INSTRUMENTS.VYM,  pct: pct(Math.round(equityPct * 0.3)), amount: amt(Math.round(equityPct * 0.3)) },
        { instrument: INSTRUMENTS.XLE,  pct: pct(Math.round(equityPct * 0.3)), amount: amt(Math.round(equityPct * 0.3)) },
      ],
    });
    buckets.push({
      name: "Fixed Income",
      emoji: "🏦",
      pct: pct(Math.round(defensivePct * 0.5)),
      amount: amt(Math.round(defensivePct * 0.5)),
      color: "text-green-400",
      rationale: "Balanced bond exposure — short duration to manage rate risk.",
      instruments: [
        { instrument: INSTRUMENTS.VGSH, pct: pct(Math.round(defensivePct * 0.3)), amount: amt(Math.round(defensivePct * 0.3)) },
        { instrument: INSTRUMENTS.BIL,  pct: pct(Math.round(defensivePct * 0.2)), amount: amt(Math.round(defensivePct * 0.2)) },
      ],
    });
    buckets.push({
      name: "Real Assets",
      emoji: "🪙",
      pct: pct(Math.round(defensivePct * 0.5)),
      amount: amt(Math.round(defensivePct * 0.5)),
      color: "text-yellow-400",
      rationale: "Gold and real estate as portfolio diversifiers.",
      instruments: [
        { instrument: INSTRUMENTS.IAU, pct: pct(Math.round(defensivePct * 0.3)), amount: amt(Math.round(defensivePct * 0.3)) },
        { instrument: INSTRUMENTS.VNQ, pct: pct(Math.round(defensivePct * 0.2)), amount: amt(Math.round(defensivePct * 0.2)) },
      ],
    });

  } else {
    // Neutral — balanced default
    buckets.push({
      name: "Balanced Core",
      emoji: "⚖️",
      pct: pct(40),
      amount: amt(40),
      color: "text-blue-400",
      rationale: "Balanced core allocation for uncertain regime.",
      instruments: [
        { instrument: INSTRUMENTS.BIL,  pct: pct(20), amount: amt(20) },
        { instrument: INSTRUMENTS.IAU,  pct: pct(10), amount: amt(10) },
        { instrument: INSTRUMENTS.SCHD, pct: pct(10), amount: amt(10) },
      ],
    });
    buckets.push({
      name: "Income",
      emoji: "💰",
      pct: pct(30),
      amount: amt(30),
      color: "text-green-400",
      rationale: "Income-generating instruments for stability.",
      instruments: [
        { instrument: INSTRUMENTS.CD_12M, pct: pct(20), amount: amt(20) },
        { instrument: INSTRUMENTS.JEPI,   pct: pct(10), amount: amt(10) },
      ],
    });
    buckets.push({
      name: "Real Assets",
      emoji: "🪙",
      pct: pct(30),
      amount: amt(30),
      color: "text-yellow-400",
      rationale: "Real assets for inflation protection.",
      instruments: [
        { instrument: INSTRUMENTS.IAU, pct: pct(15), amount: amt(15) },
        { instrument: INSTRUMENTS.XLE, pct: pct(15), amount: amt(15) },
      ],
    });
  }

  return buckets;
}

// ─── Re-entry triggers ────────────────────────────────────────────────────────

export function getReEntryTriggers(regime: RegimeAssessment): string[] {
  const base = [
    "NVIDIA Q1 FY2027 earnings beat (May 28, 2026) → add 15% tech allocation",
    "Oil drops below $90 → reduce energy, add growth tech",
    "10-year Treasury yield peaks and turns down → add IEF/TLT",
    "Shiller CAPE drops below 30 → increase equity allocation to 30%",
    "Geopolitical tension score drops below 50 → risk-on rotation",
  ];

  if (regime.regime === "hybrid_1970s_1999") {
    return [
      "🔑 PRIMARY: NVIDIA earnings — beat + raised guidance → 1999 analog dominant, add NVDA/RKLB/IONQ",
      "🛢️ Oil below $90 → 1970s analog fading, reduce XLE, increase tech",
      "📉 10yr yield peaks → add IEF then TLT as rates start falling",
      "📊 CAPE drops below 32 → begin equity re-entry in quality names",
      "🌍 Iran resolution → oil normalizes, geopolitical premium fades",
      ...base.slice(4),
    ];
  }
  return base;
}

export function getAvoidList(regime: RegimeAssessment, profile: InvestorProfile): string[] {
  const avoid: string[] = [];
  if (regime.regime === "hybrid_1970s_1999") {
    avoid.push("TLT / IEF — long-duration bonds (yields still rising, prices falling)");
    avoid.push("High-multiple tech (NVDA P/E 57x, IONQ no earnings) — wait for earnings clarity");
    avoid.push("Leveraged ETFs (TQQQ, UPRO) — decay kills in volatile sideways market");
    avoid.push("HYG / JNK — high yield bonds (credit risk rises in stagflation)");
    avoid.push("Crypto — high beta, no safe haven properties despite narrative");
  }
  if (profile.horizon === "short") {
    avoid.push("VNQ — REITs sensitive to rates, need 2-3yr horizon");
    avoid.push("5-year CDs — lock-in risk if you need funds");
  }
  if (!profile.taxAdvantaged) {
    avoid.push("High-turnover funds — generate taxable events in non-IRA accounts");
  }
  return avoid;
}
