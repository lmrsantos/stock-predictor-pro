// lib/thematic-intelligence.ts
// ─────────────────────────────────────────────────────────────────────────────
// Thematic Intelligence Layer
//
// Encodes the "ripple effect" logic the user described:
//   Government/narrative signal → sector momentum → stock price
//
// Each theme has:
//   - Active catalysts (what's driving it right now)
//   - Ripple chain (first → second → third order beneficiaries)
//   - Conviction level (high/medium/low based on evidence)
//   - Key signals to watch (what would confirm or deny the theme)
//
// Used by QuantAgent to provide thematic context alongside price analysis.
// Updated periodically — not hardcoded scores, but structured knowledge.
// ─────────────────────────────────────────────────────────────────────────────

export interface ThemeRipple {
  order: 1 | 2 | 3;               // 1st = direct, 2nd = downstream, 3rd = indirect
  tickers: string[];
  rationale: string;
}

export interface MacroTheme {
  id: string;
  name: string;
  conviction: "HIGH" | "MEDIUM" | "LOW";
  emoji: string;
  summary: string;                 // 1-2 sentence description
  catalysts: string[];             // what's actively driving this theme
  rippleChain: ThemeRipple[];      // ordered beneficiaries
  risks: string[];                 // what could kill this theme
  timeHorizon: "weeks" | "months" | "years";
  lastUpdated: string;             // ISO date
}

// ─── Active themes registry ───────────────────────────────────────────────────
// Source: Morgan Stanley, Goldman Sachs, market data — May 2026

export const ACTIVE_THEMES: MacroTheme[] = [

  // ── Theme 1: AI Infrastructure Build-Out ──────────────────────────────────
  {
    id: "ai-infrastructure",
    name: "AI Infrastructure Build-Out",
    conviction: "HIGH",
    emoji: "🤖",
    summary: "Explosive AI adoption (tokens up 250% since January 2026) is driving unprecedented demand for compute, data centers, and power. Hyperscalers are spending at record levels.",
    catalysts: [
      "Global AI token usage up 250% since January 2026",
      "Meta building world's largest data center (lower Manhattan footprint)",
      "Compute demand exceeding supply — defining investment story of 2026",
      "AMD, ARM reporting AI data center demand beats",
      "NVIDIA maintaining dominant GPU market position",
    ],
    rippleChain: [
      {
        order: 1,
        tickers: ["NVDA", "AMD", "AVGO", "AMAT", "MU", "QCOM"],
        rationale: "Direct AI compute beneficiaries — chips, GPUs, memory",
      },
      {
        order: 2,
        tickers: ["NEE", "CEG", "VST", "EQIX", "DLR", "AMT"],
        rationale: "Data centers need massive power and physical infrastructure",
      },
      {
        order: 3,
        tickers: ["CPER", "XLI", "CAT", "PWR", "HUBB"],
        rationale: "Copper, industrial equipment, electrical infrastructure for data centers",
      },
    ],
    risks: [
      "AI adoption plateau — usage growth slows",
      "Regulatory intervention on AI",
      "Supply glut if capex overshoots demand",
    ],
    timeHorizon: "years",
    lastUpdated: "2026-05-10",
  },

  // ── Theme 2: Space Economy & Defense ──────────────────────────────────────
  {
    id: "space-defense",
    name: "Space Economy & Defense",
    conviction: "HIGH",
    emoji: "🚀",
    summary: "Golden Dome missile defense, SpaceX IPO anticipation, and record defense budgets are creating a structural bull market in space and defense. RKLB's +34% single day proves the theme is live.",
    catalysts: [
      "Trump's Golden Dome missile defense project — multi-billion dollar program",
      "NATO allies committed to 5% GDP defense spending by 2035",
      "SpaceX IPO anticipation lifting entire sector",
      "RKLB backlog doubled to $2.2B — defense contracts surging",
      "US defense budget FY2026 at record authorization levels",
      "Hypersonic test flight contracts accelerating",
    ],
    rippleChain: [
      {
        order: 1,
        tickers: ["RKLB", "LUNR", "ASTS", "RDW", "MNTS"],
        rationale: "Pure-play space companies — direct Golden Dome and SpaceX beneficiaries",
      },
      {
        order: 2,
        tickers: ["LMT", "RTX", "NOC", "KTOS", "AXON", "PLTR"],
        rationale: "Defense primes and tech — missile systems, drones, AI for defense",
      },
      {
        order: 3,
        tickers: ["HWM", "TDG", "CW", "HII", "GD"],
        rationale: "Defense supply chain — components, shipbuilding, systems integration",
      },
    ],
    risks: [
      "Golden Dome delayed or defunded by Congress",
      "SpaceX IPO postponed — removes sector catalyst",
      "Launch failure from any major player dents sentiment",
      "Budget reconciliation cuts defense spending",
    ],
    timeHorizon: "years",
    lastUpdated: "2026-05-10",
  },

  // ── Theme 3: Semiconductor Reshoring (CHIPS Act) ───────────────────────────
  {
    id: "semiconductor-reshoring",
    name: "Semiconductor Reshoring",
    conviction: "HIGH",
    emoji: "🔬",
    summary: "CHIPS Act funding deployment + AI demand + geopolitical pressure to reduce China dependency is creating a multi-year capex super-cycle in US semiconductor manufacturing.",
    catalysts: [
      "CHIPS Act funding actively being deployed to INTC, TSMC US, Samsung US",
      "Government announced investment in INTEL specifically",
      "Geopolitical decoupling from China accelerating",
      "AI demand creating structural chip shortage in specialized segments",
      "ARM reporting record revenues tied to AI data center demand",
    ],
    rippleChain: [
      {
        order: 1,
        tickers: ["INTC", "AMAT", "KLAC", "LRCX", "SNPS", "CDNS"],
        rationale: "Direct CHIPS Act recipients and equipment suppliers",
      },
      {
        order: 2,
        tickers: ["ON", "WOLF", "SWKS", "MPWR", "MCHP"],
        rationale: "Specialty semis benefiting from reshoring and AI adjacent demand",
      },
      {
        order: 3,
        tickers: ["XLI", "CAT", "EMR", "ROK"],
        rationale: "Industrial equipment for fab construction",
      },
    ],
    risks: [
      "CHIPS Act funding delayed or redirected",
      "TSMC/Samsung outcompete US fabs on cost",
      "AI chip demand cools",
    ],
    timeHorizon: "years",
    lastUpdated: "2026-05-10",
  },

  // ── Theme 4: Energy Transition + AI Power Demand ───────────────────────────
  {
    id: "energy-power",
    name: "Energy & Power Infrastructure",
    conviction: "HIGH",
    emoji: "⚡",
    summary: "AI data centers + electrification + energy security are repricing power assets. Goldman Sachs and Morgan Stanley both flagging energy as a defining 2026 theme.",
    catalysts: [
      "AI data center electricity demand up highest rate in 15 years (+2% in 2026)",
      "Government investing in energy infrastructure alongside semiconductors",
      "Natural gas becoming dominant utility-scale energy source",
      "Nuclear power renaissance — CEG, VST benefiting",
      "Iran conflict keeping oil elevated short-term ($95+ Brent)",
      "Frantic race for power — developers scrambling to meet AI load",
    ],
    rippleChain: [
      {
        order: 1,
        tickers: ["NEE", "CEG", "VST", "NRG", "AES"],
        rationale: "Power generators — direct AI electricity demand beneficiaries",
      },
      {
        order: 2,
        tickers: ["XEL", "ETR", "EXC", "PPL", "DTE"],
        rationale: "Regulated utilities — stable power delivery to data centers",
      },
      {
        order: 3,
        tickers: ["PWR", "HUBB", "ETN", "AMSC"],
        rationale: "Grid infrastructure, transformers, electrical equipment",
      },
    ],
    risks: [
      "AI adoption slows — power demand normalizes",
      "Renewable buildout faster than expected — compresses power prices",
      "Iran conflict resolution — oil price normalization",
    ],
    timeHorizon: "years",
    lastUpdated: "2026-05-10",
  },

  // ── Theme 5: Biotech M&A Wave ──────────────────────────────────────────────
  {
    id: "biotech-ma",
    name: "Biotech M&A Wave",
    conviction: "MEDIUM",
    emoji: "💊",
    summary: "Large pharma facing patent cliffs need acquisitions. Biotech M&A in 2025 surpassed all of 2024. Momentum continues into 2026 with deregulation tailwinds.",
    catalysts: [
      "Large pharma patent cliff — $200B+ in revenues at risk by 2030",
      "Biotech M&A 2025 surpassed entire 2024 total",
      "Trump deregulation reducing FDA approval timelines",
      "AI drug discovery accelerating pipeline value",
      "Avalo $375M financing + positive Phase 2 LOTUS data",
    ],
    rippleChain: [
      {
        order: 1,
        tickers: ["MRNA", "BIIB", "SGEN", "ALNY", "VRTX", "REGN"],
        rationale: "Mid-cap biotechs with clinical catalysts — most likely acquisition targets",
      },
      {
        order: 2,
        tickers: ["LLY", "ABBV", "JNJ", "MRK", "PFE", "AMGN"],
        rationale: "Large pharma acquirers with capital and patent cliff pressure",
      },
      {
        order: 3,
        tickers: ["ISRG", "DXCM", "ILMN"],
        rationale: "Medical tech benefiting from healthcare spending and AI diagnostics",
      },
    ],
    risks: [
      "Drug pricing legislation dampens deal economics",
      "Clinical trial failures in high-profile programs",
      "Interest rates remain high — leveraged buyouts constrained",
    ],
    timeHorizon: "months",
    lastUpdated: "2026-05-10",
  },

  // ── Theme 6: Multipolar World / Geopolitical Tension ──────────────────────
  {
    id: "multipolar-geopolitics",
    name: "Multipolar World & Economic Security",
    conviction: "MEDIUM",
    emoji: "🌍",
    summary: "Iran conflict, US-China decoupling, and NATO spending commitments are repricing geopolitical risk. Countries prioritizing self-sufficiency in energy, tech, and defense.",
    catalysts: [
      "Strait of Hormuz disruption — 9.1M barrels/day shut in (April 2026)",
      "Brent crude at $103/barrel, expected to peak at $115 Q2 2026",
      "NATO 5% GDP defense target by 2035",
      "US-China tech decoupling accelerating across chips, AI, space",
      "European defense spending revival",
    ],
    rippleChain: [
      {
        order: 1,
        tickers: ["XLE", "USO", "CVX", "XOM", "COP"],
        rationale: "Energy producers benefiting from supply disruption and elevated prices",
      },
      {
        order: 2,
        tickers: ["GLD", "IAU", "SLV"],
        rationale: "Safe haven assets — gold surging on geopolitical risk",
      },
      {
        order: 3,
        tickers: ["LMT", "RTX", "NOC", "BA"],
        rationale: "Defense primes benefiting from global rearmament",
      },
    ],
    risks: [
      "Iran conflict resolution — oil prices normalize",
      "US-China trade deal — decoupling reverses",
      "Recession concerns override geopolitical premium",
    ],
    timeHorizon: "months",
    lastUpdated: "2026-05-10",
  },
];

// ─── Theme detection for a given ticker ──────────────────────────────────────

export interface TickerThemeMatch {
  theme: MacroTheme;
  rippleOrder: 1 | 2 | 3;
  isDirectBeneficiary: boolean;    // order 1
  isSecondaryBeneficiary: boolean; // order 2
  convictionBoost: number;         // 0-30 points to add to confidence score
}

export function detectThemes(ticker: string): TickerThemeMatch[] {
  const matches: TickerThemeMatch[] = [];
  const upper = ticker.toUpperCase();

  for (const theme of ACTIVE_THEMES) {
    for (const ripple of theme.rippleChain) {
      if (ripple.tickers.includes(upper)) {
        const convictionBoost =
          theme.conviction === "HIGH"
            ? ripple.order === 1 ? 25 : ripple.order === 2 ? 15 : 8
            : theme.conviction === "MEDIUM"
            ? ripple.order === 1 ? 15 : ripple.order === 2 ? 8 : 4
            : ripple.order === 1 ? 8 : 4;

        matches.push({
          theme,
          rippleOrder: ripple.order,
          isDirectBeneficiary: ripple.order === 1,
          isSecondaryBeneficiary: ripple.order === 2,
          convictionBoost,
        });
        break; // only match once per theme
      }
    }
  }

  return matches.sort((a, b) => b.convictionBoost - a.convictionBoost);
}

// ─── Build thematic context string for QuantAgent ─────────────────────────────

export function buildThematicContext(ticker: string): string {
  const matches = detectThemes(ticker);

  if (matches.length === 0) {
    return `No active macro themes directly apply to ${ticker}. Analyze on fundamentals and price action alone.`;
  }

  const lines: string[] = [
    `## Active Macro Themes for ${ticker}`,
    "",
  ];

  for (const match of matches) {
    const { theme, rippleOrder, convictionBoost } = match;
    const orderLabel = rippleOrder === 1 ? "DIRECT beneficiary" : rippleOrder === 2 ? "SECONDARY beneficiary" : "INDIRECT beneficiary";
    const ripple = theme.rippleChain.find(r => r.order === rippleOrder)!;

    lines.push(`### ${theme.emoji} ${theme.name} [${theme.conviction} conviction]`);
    lines.push(`- **Position in ripple chain:** ${orderLabel} (order ${rippleOrder} of 3)`);
    lines.push(`- **Why ${ticker} benefits:** ${ripple.rationale}`);
    lines.push(`- **Active catalysts driving this theme:**`);
    theme.catalysts.slice(0, 3).forEach(c => lines.push(`  - ${c}`));
    lines.push(`- **Key risks to watch:** ${theme.risks[0]}`);
    lines.push(`- **Confidence boost from this theme:** +${convictionBoost} points`);
    lines.push(`- **Time horizon:** ${theme.timeHorizon}`);
    lines.push("");
  }

  const totalBoost = matches.reduce((s, m) => s + m.convictionBoost, 0);
  lines.push(`**Total thematic confidence adjustment: +${Math.min(totalBoost, 40)} points**`);
  lines.push("");
  lines.push("Use this thematic context alongside the quantitative model to give a complete picture.");
  lines.push("Always search for the latest news to verify these themes are still active.");

  return lines.join("\n");
}

// ─── Thematic confidence boost for backtest scoring ──────────────────────────
// Call this to add thematic intelligence to the confidence score

export function getThematicBoost(ticker: string): number {
  const matches = detectThemes(ticker);
  const rawBoost = matches.reduce((s, m) => s + m.convictionBoost, 0);
  return Math.min(rawBoost, 40); // cap at 40 points
}

// ─── Summary for display in UI ────────────────────────────────────────────────

export function getThemeSummary(ticker: string): {
  hasThemes: boolean;
  primaryTheme: string | null;
  themeCount: number;
  boost: number;
  badges: string[];
} {
  const matches = detectThemes(ticker);

  if (matches.length === 0) {
    return { hasThemes: false, primaryTheme: null, themeCount: 0, boost: 0, badges: [] };
  }

  const badges = matches.map(m => {
    const order = m.rippleOrder === 1 ? "🎯" : m.rippleOrder === 2 ? "📡" : "🔗";
    return `${order} ${m.theme.emoji} ${m.theme.name}`;
  });

  return {
    hasThemes: true,
    primaryTheme: matches[0].theme.name,
    themeCount: matches.length,
    boost: getThematicBoost(ticker),
    badges,
  };
}
