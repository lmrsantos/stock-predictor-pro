// lib/checklist-schema.ts
// ─────────────────────────────────────────────────────────────────────────────
// Declarative structure of the Pre-Investment Checklist.
//
// Three item types, rendered differently and never interchangeable:
//   AUTO      — platform-filled fact. Read-only. Shows value + source + date.
//               Never a checkbox: the user cannot "tick" a fact.
//   RESEARCH  — what the user found. Free text. Blank stays visibly blank.
//   JUDGMENT  — the user's own decision. Never pre-filled, never suggested.
//
// The checklist NEVER produces a verdict, score, or recommendation.
// ─────────────────────────────────────────────────────────────────────────────

export type ItemType = "auto" | "research" | "judgment";

/** Input control for RESEARCH / JUDGMENT items. */
export type InputKind = "text" | "long" | "yesno";

export interface ChecklistItem {
  id: string;
  type: ItemType;
  label: string;
  /** Format hint only. NEVER a suggested number or value. */
  placeholder?: string;
  /** Static explanatory note rendered under the field. */
  note?: string;
  kind?: InputKind;
  /** AUTO items only: emphasise the row (e.g. share count change). */
  emphasise?: boolean;
}

export interface ChecklistSection {
  id: string;
  title: string;
  intro?: string;
  items: ChecklistItem[];
  /** Section 7 renders the engine's honest reading verbatim. */
  special?: "model_reading" | "evidence_counts";
}

const yesno = (id: string, label: string): ChecklistItem =>
  ({ id, type: "judgment", label, kind: "yesno" });

export const CHECKLIST_SECTIONS: ChecklistSection[] = [
  {
    id: "s0",
    title: "0 — Before you research",
    items: [
      { id: "s0_why", type: "judgment", kind: "long", label: "Why am I looking at this stock today?", placeholder: "In your own words" },
      yesno("s0_tip", "Did this come from a tip, headline, or social media?"),
      yesno("s0_decided", "Have I already decided to buy and am now looking for reasons?"),
      yesno("s0_revenge", "Am I replacing a loss I just took?"),
    ],
  },
  {
    id: "s1",
    title: "1 — The story",
    items: [
      { id: "a_identity", type: "auto", label: "Company name, sector, industry" },
      { id: "s1_what", type: "research", kind: "long", label: "What the company does, one sentence", placeholder: "One sentence, no jargon" },
      { id: "s1_revenue", type: "research", kind: "long", label: "Primary revenue source", placeholder: "Product, service, or geography" },
      { id: "s1_drivers", type: "research", kind: "long", label: "Two or three growth drivers, next 12–24 months", placeholder: "One per line" },
      { id: "a_next_earnings", type: "auto", label: "Next earnings date" },
      { id: "a_last_quarter", type: "auto", label: "Most recent quarter result" },
    ],
  },
  {
    id: "s2",
    title: "2 — Fundamentals & financial health",
    items: [
      { id: "a_revenue_growth", type: "auto", label: "Revenue growth YoY" },
      { id: "a_margins", type: "auto", label: "Gross / operating / net margin" },
      { id: "a_returns", type: "auto", label: "ROE, ROIC" },
      { id: "a_fcf", type: "auto", label: "Free cash flow" },
      { id: "a_debt_equity", type: "auto", label: "Debt / equity, with sector median" },
      { id: "a_current_ratio", type: "auto", label: "Current ratio" },
      { id: "a_share_count", type: "auto", label: "Share count change 1y — buyback vs dilution", emphasise: true },
      { id: "a_credit_ratings", type: "auto", label: "Credit ratings by agency, with as-of date and filing link" },
      { id: "s2_redflags", type: "research", kind: "long", label: "Red flags in the last 10-K or 10-Q", placeholder: "What you actually read, and where" },
      { id: "s2_concentration", type: "research", kind: "long", label: "Customer concentration (10-K Item 1A)", placeholder: "Largest customers as % of revenue" },
    ],
  },
  {
    id: "s3",
    title: "3 — Valuation",
    items: [
      { id: "a_pe", type: "auto", label: "P/E trailing and forward, with sector median" },
      { id: "a_ev_ebitda", type: "auto", label: "EV/EBITDA, with sector median" },
      { id: "a_ps_pb", type: "auto", label: "Price/sales, price/book" },
      { id: "a_52w", type: "auto", label: "52-week range and current position within it" },
      { id: "a_1y_change", type: "auto", label: "1-year price change" },
      { id: "s3_premium", type: "judgment", kind: "long", label: "Am I buying value, growth, or quality at a premium?", placeholder: "Your own reasoning" },
    ],
  },
  {
    id: "s4",
    title: "4 — Market structure & liquidity",
    items: [
      { id: "a_liquidity", type: "auto", label: "Average volume, market cap, beta" },
      { id: "a_short_interest", type: "auto", label: "Short interest as % of float" },
      { id: "s4_shelf", type: "research", kind: "text", label: "Any current S-3 shelf registration on EDGAR", placeholder: "Filing date and size, or “none found”" },
      { id: "s4_insider", type: "research", kind: "long", label: "Recent insider activity (Form 4)", placeholder: "Who, direction, size, date" },
    ],
  },
  {
    id: "s5",
    title: "5 — Sector & competition",
    items: [
      { id: "a_sector", type: "auto", label: "Sector, sub-sector" },
      { id: "a_sector_20d", type: "auto", label: "Sector composite 20-day return" },
      { id: "s5_competitors", type: "research", kind: "long", label: "Top two or three competitors and how this compares", placeholder: "Names, then the comparison" },
      { id: "s5_etfs", type: "research", kind: "text", label: "Relevant sector ETFs", placeholder: "Tickers" },
    ],
  },
  {
    id: "s6",
    title: "6 — Macro environment",
    items: [
      { id: "a_regime", type: "auto", label: "Current regime badge and contributing indicators" },
      { id: "a_macro_levels", type: "auto", label: "10Y yield, oil, gold — current levels" },
      { id: "a_linkages", type: "auto", label: "Validated cross-sector linkages where this sector is the follower" },
      { id: "s6_policy", type: "research", kind: "long", label: "Policy or geopolitical risk specific to this sector", placeholder: "What you found, and the source" },
    ],
  },
  {
    id: "s7",
    title: "7 — QuantForecast model signals",
    intro: "Quoted verbatim from the engine. Nothing here is softened or re-worded.",
    special: "model_reading",
    items: [
      { id: "a_direction_reliability", type: "auto", label: "Direction reliability" },
      { id: "a_expected_move", type: "auto", label: "Expected move, 1σ over 30 days" },
      { id: "a_model_fit", type: "auto", label: "Model fit score" },
      { id: "a_winner", type: "auto", label: "Decisive winner or ensemble mean" },
      { id: "a_forecastability", type: "auto", label: "Forecastability profile: volatility bucket, listing bucket" },
      { id: "a_setups", type: "auto", label: "Matching setups" },
      { id: "a_setup_detail", type: "auto", label: "Per setup: hit rate, baseline, excess, sample size, track-record gate" },
    ],
  },
  {
    id: "s8",
    title: "8 — Risk",
    items: [
      { id: "s8_wrong", type: "judgment", kind: "long", label: "What would prove me wrong?", placeholder: "A fact, not a price" },
      { id: "a_sigma_dollars", type: "auto", label: "30-day 1σ range in dollars" },
      { id: "a_multiple_downside", type: "auto", label: "Downside if the valuation multiple returned to its sector median, holding earnings constant" },
      {
        id: "s8_stop", type: "judgment", kind: "text", label: "Stop level or time stop",
        placeholder: "Price level, or number of days",
        note: "A stop inside the 1σ band will be triggered by ordinary noise roughly a third of the time.",
      },
      { id: "s8_max_loss", type: "judgment", kind: "text", label: "Maximum dollar loss I accept", placeholder: "A dollar amount" },
      yesno("s8_needed", "Is this money I need within 12 months?"),
    ],
  },
  {
    id: "s9",
    title: "9 — Position sizing & fit",
    items: [
      { id: "s9_size", type: "judgment", kind: "text", label: "Position size as % of portfolio", placeholder: "A percentage" },
      { id: "s9_correlated", type: "judgment", kind: "long", label: "Do I already hold correlated names?", placeholder: "Tickers, and why they are correlated" },
      { id: "s9_sector_exposure", type: "judgment", kind: "text", label: "Total sector exposure after this position", placeholder: "A percentage" },
      { id: "s9_scaling", type: "judgment", kind: "long", label: "Scaling plan", placeholder: "Tranches and the conditions for each" },
    ],
  },
  {
    id: "s10",
    title: "10 — Entry & exit plan",
    items: [
      { id: "s10_entry", type: "judgment", kind: "long", label: "Entry trigger", placeholder: "The condition that starts the position" },
      { id: "s10_sell", type: "judgment", kind: "long", label: "What would make me sell — thesis invalidation, not price", placeholder: "A change in the business" },
      { id: "s10_target", type: "judgment", kind: "long", label: "Price target and the reasoning behind it", placeholder: "Level, then the reasoning" },
      { id: "s10_hold", type: "judgment", kind: "text", label: "Expected holding period", placeholder: "Days, weeks, months, years" },
      yesno("s10_written", "Written down before entering?"),
    ],
  },
  {
    id: "s11",
    title: "11 — Evidence summary",
    intro: "Counts only. There is no score and no verdict here.",
    special: "evidence_counts",
    items: [],
  },
  {
    id: "s12",
    title: "12 — Final questions",
    items: [
      yesno("s12_drop10", "If this dropped 10% tomorrow, would I still want to own it?"),
      { id: "s12_drop25", type: "judgment", kind: "long", label: "If it dropped 25%, would I have a plan?", placeholder: "The plan, in words" },
      { id: "s12_business", type: "judgment", kind: "long", label: "Am I buying the business, or the recent move?", placeholder: "Your own answer" },
      yesno("s12_without_models", "Would I still buy this if the models said nothing at all?"),
    ],
  },
];

export const ALL_ITEMS: ChecklistItem[] = CHECKLIST_SECTIONS.flatMap(s => s.items);

export const RESEARCH_ITEM_IDS = ALL_ITEMS.filter(i => i.type === "research").map(i => i.id);
export const JUDGMENT_ITEM_IDS = ALL_ITEMS.filter(i => i.type === "judgment").map(i => i.id);
export const AUTO_ITEM_IDS     = ALL_ITEMS.filter(i => i.type === "auto").map(i => i.id);

/** RESEARCH items carry an explicit, persistent "not checked" state. */
export const NOT_CHECKED = "__not_checked__";

export type UserEntries = Record<string, string>;

export function isBlank(v: string | undefined): boolean {
  return v == null || v.trim() === "";
}

export function countsFor(entries: UserEntries) {
  const researchBlank = RESEARCH_ITEM_IDS.filter(
    id => isBlank(entries[id]) || entries[id] === NOT_CHECKED,
  ).length;
  const judgmentBlank = JUDGMENT_ITEM_IDS.filter(id => isBlank(entries[id])).length;
  return { researchBlank, judgmentBlank };
}
