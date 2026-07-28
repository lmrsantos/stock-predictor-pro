// ipo-risk-engine.ts
// Deterministic risk scoring for pre-IPO companies.
// Claude's job is to find raw facts via web search.
// This module's job is to score those facts consistently.
// No AI judgment in the scoring logic — pure arithmetic.

// ---------------------------------------------------------------------------
// Raw facts — what Claude extracts from web search
// ---------------------------------------------------------------------------

export interface IpoRawFacts {
  name: string;
  sector: string;
  brief: string;                    // 2-3 sentence company description
  ipoTimelineNote: string;          // e.g. "S-1 filed June 2026"
  stage: IpoStage;
  platforms: { name: string; url: string }[];
  minInvestment: string;
  accreditedRequired: boolean;
  horizon: IpoHorizon;
  sources: string[];                // URLs Claude used

  // Raw fact inputs for scoring — Claude finds these, scoring is deterministic
  revenueStatus: RevenueStatus;
  annualRevenueB: number | null;    // billions USD, null if unknown
  isProfitable: boolean | null;     // null if unknown
  lastValuationB: number | null;    // billions USD from last funding round
  revenueMultiple: number | null;   // valuation / annualRevenue, null if no revenue
  hasNetworkEffects: boolean;
  hasGovernmentContracts: boolean;
  facesGiantCompetitor: boolean;    // e.g. competing directly with NVIDIA, Google
  filingStatus: FilingStatus;
  secondaryMarketActive: boolean;
  estimatedExitYears: number;       // best estimate of years to liquidity event
}

export type IpoStage   = 'filed' | 'secondary' | 'pre' | 'rumored';
export type IpoHorizon = 'imminent' | 'near' | 'medium' | 'long';
export type RevenueStatus = 'profitable' | 'revenue_not_profitable' | 'pre_revenue';
export type FilingStatus  = 'filed_public' | 'filed_confidential' | 'signals_strong' |
                            'intent_stated' | 'rumored' | 'unknown';

// ---------------------------------------------------------------------------
// Scored output — what the UI consumes
// ---------------------------------------------------------------------------

export type RiskTier = 'lower' | 'medium' | 'high' | 'very_high';

export interface DimensionScore {
  dimension: string;
  score: number;        // 1–3
  maxScore: number;     // always 3
  weight: number;
  weightedScore: number;
  rationale: string;    // one sentence explaining the score
}

export interface IpoRiskScore {
  // Inputs
  facts: IpoRawFacts;

  // Dimension breakdown
  dimensions: {
    revenueReality: DimensionScore;
    valuationFundamentals: DimensionScore;
    competitiveMoat: DimensionScore;
    exitCertainty: DimensionScore;
    illiquidityRisk: DimensionScore;
  };

  // Aggregate
  rawScore: number;          // sum of weighted scores
  maxPossibleScore: number;  // sum of max weighted scores
  normalizedScore: number;   // 0–100
  riskTier: RiskTier;
  riskLabel: string;         // human-readable

  // Full entry for UI
  ourView: string;           // assembled from dimension rationales
}

// ---------------------------------------------------------------------------
// Weights — adjust here to tune the model, never in scoring logic
// ---------------------------------------------------------------------------

const WEIGHTS = {
  revenueReality:         1.5,
  valuationFundamentals:  1.5,
  competitiveMoat:        1.0,
  exitCertainty:          1.5,
  illiquidityRisk:        1.0,
} as const;

const MAX_WEIGHTED = Object.values(WEIGHTS).reduce((s, w) => s + w * 3, 0);

// ---------------------------------------------------------------------------
// Dimension scorers — pure functions, no AI, no randomness
// ---------------------------------------------------------------------------

function scoreRevenueReality(f: IpoRawFacts): DimensionScore {
  let score: number;
  let rationale: string;

  if (f.revenueStatus === 'profitable') {
    score = 3;
    rationale = f.annualRevenueB
      ? `Profitable with $${f.annualRevenueB.toFixed(1)}B annual revenue.`
      : 'Profitable — strongest revenue signal.';
  } else if (f.revenueStatus === 'revenue_not_profitable') {
    score = 2;
    rationale = f.annualRevenueB
      ? `$${f.annualRevenueB.toFixed(1)}B revenue but not yet profitable.`
      : 'Revenue exists but profitability not confirmed.';
  } else {
    score = 1;
    rationale = 'Pre-revenue or revenue unconfirmed — highest fundamental risk.';
  }

  const weight = WEIGHTS.revenueReality;
  return { dimension: 'Revenue reality', score, maxScore: 3, weight,
           weightedScore: score * weight, rationale };
}

function scoreValuationFundamentals(f: IpoRawFacts): DimensionScore {
  let score: number;
  let rationale: string;

  if (f.revenueMultiple === null || f.lastValuationB === null) {
    score = 1;
    rationale = 'No revenue multiple calculable — valuation has no fundamental anchor.';
  } else if (f.revenueMultiple <= 15) {
    score = 3;
    rationale = `${f.revenueMultiple.toFixed(0)}x revenue multiple — reasonable for growth stage.`;
  } else if (f.revenueMultiple <= 40) {
    score = 2;
    rationale = `${f.revenueMultiple.toFixed(0)}x revenue multiple — stretched but defensible if growth holds.`;
  } else {
    score = 1;
    rationale = `${f.revenueMultiple.toFixed(0)}x revenue multiple — highly speculative, leaves no margin of safety.`;
  }

  const weight = WEIGHTS.valuationFundamentals;
  return { dimension: 'Valuation vs fundamentals', score, maxScore: 3, weight,
           weightedScore: score * weight, rationale };
}

function scoreCompetitiveMoat(f: IpoRawFacts): DimensionScore {
  let score: number;
  let rationale: string;

  if (f.hasGovernmentContracts && f.hasNetworkEffects) {
    score = 3;
    rationale = 'Government contracts plus network effects — dual moat, hard to displace.';
  } else if (f.hasGovernmentContracts || f.hasNetworkEffects) {
    score = f.facesGiantCompetitor ? 2 : 3;
    rationale = f.hasGovernmentContracts
      ? `Government contracts provide revenue stability${f.facesGiantCompetitor ? ', but faces large competitor' : ''}.`
      : `Network effects present${f.facesGiantCompetitor ? ', but faces large competitor' : ' — meaningful switching costs'}.`;
  } else if (f.facesGiantCompetitor) {
    score = 1;
    rationale = 'No clear moat and competing directly against an established giant — highest competitive risk.';
  } else {
    score = 2;
    rationale = 'Differentiated product but moat not yet proven at scale.';
  }

  const weight = WEIGHTS.competitiveMoat;
  return { dimension: 'Competitive moat', score, maxScore: 3, weight,
           weightedScore: score * weight, rationale };
}

function scoreExitCertainty(f: IpoRawFacts): DimensionScore {
  let score: number;
  let rationale: string;

  switch (f.filingStatus) {
    case 'filed_public':
      score = 3;
      rationale = 'Public S-1 filed — highest exit certainty, roadshow imminent.';
      break;
    case 'filed_confidential':
      score = 3;
      rationale = 'Confidential S-1 filed — strong exit signal, public filing expected soon.';
      break;
    case 'signals_strong':
      score = 2;
      rationale = 'Strong IPO signals (bankers engaged, pre-IPO rounds closed) — likely 12–18 months.';
      break;
    case 'intent_stated':
      score = 2;
      rationale = 'Management has stated IPO intent but no filing. Timeline uncertain.';
      break;
    case 'rumored':
      score = 1;
      rationale = 'IPO rumored but no confirmation. Could be years away or never.';
      break;
    default:
      score = 1;
      rationale = 'No exit signal — liquidity timeline completely unknown.';
  }

  const weight = WEIGHTS.exitCertainty;
  return { dimension: 'Exit certainty', score, maxScore: 3, weight,
           weightedScore: score * weight, rationale };
}

function scoreIlliquidityRisk(f: IpoRawFacts): DimensionScore {
  let score: number;
  let rationale: string;

  if (f.estimatedExitYears <= 1 && f.secondaryMarketActive) {
    score = 3;
    rationale = 'Near-term exit with active secondary market — lowest illiquidity risk.';
  } else if (f.estimatedExitYears <= 2 || f.secondaryMarketActive) {
    score = 2;
    rationale = f.secondaryMarketActive
      ? 'Active secondary market provides partial liquidity before IPO.'
      : `~${f.estimatedExitYears} year exit horizon — plan for capital to be locked.`;
  } else {
    score = 1;
    rationale = `${f.estimatedExitYears}+ year horizon with limited secondary liquidity — treat as illiquid.`;
  }

  const weight = WEIGHTS.illiquidityRisk;
  return { dimension: 'Illiquidity risk', score, maxScore: 3, weight,
           weightedScore: score * weight, rationale };
}

// ---------------------------------------------------------------------------
// Risk tier thresholds (normalized 0–100)
// ---------------------------------------------------------------------------

function toRiskTier(normalized: number): { tier: RiskTier; label: string } {
  if (normalized >= 72) return { tier: 'lower',    label: 'Lower risk' };
  if (normalized >= 50) return { tier: 'medium',   label: 'Medium risk' };
  if (normalized >= 30) return { tier: 'high',     label: 'High risk' };
  return                       { tier: 'very_high', label: 'Very high / speculative' };
}

// ---------------------------------------------------------------------------
// Main scorer
// ---------------------------------------------------------------------------

export function scoreIpo(facts: IpoRawFacts): IpoRiskScore {
  const d = {
    revenueReality:        scoreRevenueReality(facts),
    valuationFundamentals: scoreValuationFundamentals(facts),
    competitiveMoat:       scoreCompetitiveMoat(facts),
    exitCertainty:         scoreExitCertainty(facts),
    illiquidityRisk:       scoreIlliquidityRisk(facts),
  };

  const rawScore = Object.values(d).reduce((s, dim) => s + dim.weightedScore, 0);
  const normalizedScore = Math.round((rawScore / MAX_WEIGHTED) * 100);
  const { tier, label } = toRiskTier(normalizedScore);

  // Assemble our view from dimension rationales
  const ourView = [
    d.revenueReality.rationale,
    d.valuationFundamentals.rationale,
    d.competitiveMoat.rationale,
    d.exitCertainty.rationale,
    d.illiquidityRisk.rationale,
  ].join(' ');

  return { facts, dimensions: d, rawScore,
           maxPossibleScore: MAX_WEIGHTED, normalizedScore,
           riskTier: tier, riskLabel: label, ourView };
}

// ---------------------------------------------------------------------------
// Batch scorer
// ---------------------------------------------------------------------------

export function scoreIpoUniverse(factsList: IpoRawFacts[]): IpoRiskScore[] {
  return factsList
    .map(scoreIpo)
    .sort((a, b) => b.normalizedScore - a.normalizedScore);
}

// ---------------------------------------------------------------------------
// Claude prompt builder
// Constructs the exact prompt sent to Claude API with web search.
// Keeping prompt logic here (not in the edge function) means it's
// testable and version-controlled alongside the scoring model.
// ---------------------------------------------------------------------------

export const CLAUDE_SYSTEM_PROMPT = `You are a financial research agent for QuantForecast, 
a quantitative finance platform. Your job is to research pre-IPO companies and extract 
structured facts. You do NOT assess risk — a deterministic scoring engine does that. 
Your job is fact extraction only.

Be conservative: if you cannot confirm a fact from a reliable source, use null.
Never invent revenue figures, valuations, or filing statuses.
Always include the source URLs you used.
Your final answer must be machine-readable JSON only: start with [ and end with ].
Do not include markdown fences, commentary, explanations, citations outside fields, or prose.`;

export function buildClaudePrompt(horizon: IpoHorizon, customQuery?: string): string {
  const horizonInstructions: Record<IpoHorizon, string> = {
    imminent: `Focus on companies with S-1 filed (public or confidential) in the last 
12 months, or roadshow underway. These should be companies likely to price within 6 months. 
Expected stage values: "filed". FilingStatus: "filed_public" or "filed_confidential".`,

    near: `Focus on companies with strong IPO signals — bankers engaged, pre-IPO rounds 
closed, management has stated intent. Likely to file within 6–18 months. 
Expected stage values: "secondary" or "filed". FilingStatus: "signals_strong" or "intent_stated".`,

    medium: `Focus on well-funded late-stage private companies with active secondary markets 
but no imminent filing. 1–3 year exit horizon. 
Expected stage values: "secondary". FilingStatus: "intent_stated" or "rumored".`,

    long: `Focus on growth-stage private companies, early-stage funds, and Reg CF 
opportunities. 3+ year horizon. Include fund vehicles (DXYZ, Fundrise) that give 
exposure without accreditation requirements. 
Expected stage values: "pre" or "rumored".`,
  };

  return `Search the web for the current pre-IPO investment landscape as of today.

HORIZON: ${horizon.toUpperCase()}
${horizonInstructions[horizon]}

${customQuery ? `USER ADDITIONAL FOCUS: ${customQuery}\n` : ''}

Return a JSON array of 10 companies. For each company, return EXACTLY this structure:

{
  "name": "Company name",
  "sector": "One of: Semiconductors, Software, Mega-cap Tech, Banks, Biotech & Pharma, Energy, Consumer Staples, Consumer Discretionary, Industrials & Defense, Utilities, Real Estate, Quantum Computing, Aerospace & Space, Fintech, AI Infrastructure, Multi-sector",
  "brief": "2-3 sentence description of what the company does and why it matters",
  "ipoTimelineNote": "One sentence on filing/IPO status",
  "stage": "filed | secondary | pre | rumored",
  "platforms": [{"name": "platform name", "url": "https://..."}],
  "minInvestment": "$X,XXX",
  "accreditedRequired": true | false,
  "horizon": "${horizon}",
  "sources": ["url1", "url2"],
  "revenueStatus": "profitable | revenue_not_profitable | pre_revenue",
  "annualRevenueB": number or null,
  "isProfitable": true | false | null,
  "lastValuationB": number or null,
  "revenueMultiple": number or null,
  "hasNetworkEffects": true | false,
  "hasGovernmentContracts": true | false,
  "facesGiantCompetitor": true | false,
  "filingStatus": "filed_public | filed_confidential | signals_strong | intent_stated | rumored | unknown",
  "secondaryMarketActive": true | false,
  "estimatedExitYears": number
}

RULES:
- Use null for any numeric field you cannot confirm from a source.
- filingStatus must reflect actual SEC filings, not speculation.
- platforms must be real platforms where this company's shares are actually listed today.
- Keep each text field concise.
- Use at most 3 source URLs per company.
- Return ONLY valid JSON array. No preamble, no explanation, no markdown.`;
}

// ---------------------------------------------------------------------------
// JSON validator — runs before writing to Supabase
// ---------------------------------------------------------------------------

export function validateClaudeResponse(raw: string): IpoRawFacts[] {
  let parsed: unknown;
  const clean = raw.replace(/^[\s\S]*?(?=```|\[)/, '').trim();

  // Collect candidate JSON strings in order of reliability.
  const candidates: string[] = [];

  // 1. Fenced ```json ... ``` block (most reliable when Claude adds prose).
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) candidates.push(fenceMatch[1].trim());

  const stripped = raw.replace(/```(?:json)?|```/g, '').trim();

  // 2. First quote-aware balanced top-level [ ... ] array.
  const findArray = (s: string): string | null => {
    let depth = 0, start = -1;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];

      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;

      if (c === '[') { if (depth === 0) start = i; depth++; }
      else if (c === ']') { depth--; if (depth === 0 && start !== -1) return s.slice(start, i + 1); }
    }
    return null;
  };
  const arr = findArray(stripped);
  if (arr) candidates.push(arr);

  // 3. Raw text with fences stripped, for cases where Claude obeys exactly.
  candidates.push(stripped);

  for (const c of candidates) {
    try {
      const attempt = JSON.parse(c);
      if (Array.isArray(attempt)) { parsed = attempt; break; }
    } catch (error) {
      console.error('IPO JSON candidate parse failed:', error instanceof Error ? error.message : String(error));
    }
  }

  if (!parsed) {
    console.error('Claude JSON parse failed. Preview:', clean.slice(0, 800));
    throw new Error('Claude returned invalid JSON');
  }

  if (!Array.isArray(parsed)) throw new Error('Expected JSON array');

  const required: (keyof IpoRawFacts)[] = [
    'name', 'sector', 'brief', 'stage', 'horizon',
    'revenueStatus', 'filingStatus', 'secondaryMarketActive',
    'estimatedExitYears', 'accreditedRequired',
  ];

  const validStages: IpoStage[] = ['filed', 'secondary', 'pre', 'rumored'];
  const validRevenue: RevenueStatus[] = ['profitable', 'revenue_not_profitable', 'pre_revenue'];
  const validFiling: FilingStatus[] = [
    'filed_public', 'filed_confidential', 'signals_strong',
    'intent_stated', 'rumored', 'unknown',
  ];

  return (parsed as Record<string, unknown>[]).filter((item, i) => {
    for (const field of required) {
      if (item[field] === undefined) {
        console.warn(`Row ${i} (${item.name}) missing field: ${field} — skipped`);
        return false;
      }
    }
    if (!validStages.includes(item.stage as IpoStage)) {
      console.warn(`Row ${i} invalid stage: ${item.stage} — skipped`); return false;
    }
    if (!validRevenue.includes(item.revenueStatus as RevenueStatus)) {
      console.warn(`Row ${i} invalid revenueStatus — skipped`); return false;
    }
    if (!validFiling.includes(item.filingStatus as FilingStatus)) {
      console.warn(`Row ${i} invalid filingStatus — skipped`); return false;
    }
    return true;
  }) as unknown as IpoRawFacts[];
}
