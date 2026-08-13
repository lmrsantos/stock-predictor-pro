// cross-sector-linkages.ts
// Cross-sector lead-lag analysis for QuantForecast.
// Browser-side library (same pattern as cycle-analysis.ts / BacktestModal AE scoring).
//
// Pipeline:
//   1. buildSectorComposites()  — equal-weighted daily-return composites per sector,
//                                 with leave-one-out variants for feature injection
//   2. runLinkageTests()        — Granger-style lag regressions over the curated
//                                 directed-pair map, split-half validated,
//                                 Benjamini-Hochberg corrected
//   3. buildTickerFeatures()    — lagged leader returns for a given ticker,
//                                 using only validated linkages (autoencoder inputs)
//
// Design rules encoded here:
//   - Only pairs in LINKAGE_MAP are ever tested (no all-pairs scan).
//   - Lags 1..MAX_LAG trading days only (1y history => weak power beyond ~10).
//   - A linkage is "validated" only if significant post-BH on the FULL window
//     AND same-sign, nominally significant in BOTH halves.
//   - Leave-one-out composites prevent self-contamination for concentrated
//     sectors (Quantum Computing, Aerospace & Space especially).

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Sector names now cover the FULL curated universe (43 baskets / 371 symbols),
// re-exported from sector-universes.ts so there is a single source of truth.
export type { SectorName } from "@/lib/sector-universes";
import {
  SECTOR_NAMES as ALL_SECTOR_NAMES,
  CURATED_SECTOR_UNIVERSES,
  type SectorName,
} from "@/lib/sector-universes";

export const SECTOR_NAMES: SectorName[] = [...ALL_SECTOR_NAMES].sort((a, b) =>
  a.localeCompare(b),
);


export type MacroSeriesName = "OIL" | "GOLD" | "US10Y" | "XLY_XLP_RATIO";

export const MACRO_SERIES_NAMES: MacroSeriesName[] = ["GOLD", "OIL", "US10Y", "XLY_XLP_RATIO"];

export type LeaderName = SectorName | MacroSeriesName;

export interface PriceBar {
  symbol: string;
  date: string; // "YYYY-MM-DD"
  close: number;
}

export interface DirectedPair {
  leader: LeaderName;
  follower: SectorName;
  channel: string;          // economic rationale (documentation + QuantAgent context)
  regimeSignFlip?: boolean; // e.g. Energy -> Industrials: sign depends on demand vs supply regime
  exploratory?: boolean;    // true = all-pairs scan, no pre-registered channel
}

export interface ReturnSeries {
  dates: string[];
  values: number[]; // daily log returns aligned to dates
}

export interface LinkageResult {
  leader: LeaderName;
  follower: SectorName;
  bestLag: number;          // trading days, leader leads follower
  coefficient: number;      // OLS coef of lagged leader return at bestLag (full window)
  sign: 1 | -1;
  pValue: number;           // full-window p at bestLag
  pAdjusted: number;        // BH-adjusted across all pair tests
  rSquaredDelta: number;    // incremental R^2 vs AR-only baseline
  firstHalf: { coefficient: number; pValue: number };
  secondHalf: { coefficient: number; pValue: number };
  validated: boolean;
  channel: string;
  regimeSignFlip: boolean;
  exploratory: boolean;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const MAX_LAG = 10;        // trading days; 1y history caps honest lag depth
export const AR_ORDER = 2;        // follower's own-lag baseline (controls autocorrelation)
export const BH_ALPHA = 0.05;     // false discovery rate target
export const HALF_ALPHA = 0.10;   // looser nominal threshold within each half (126 obs)
export const MIN_OBS = 150;       // minimum aligned observations to test a pair at all

// The curated linkage map. Every tested relationship must appear here with a
// written economic channel. Add pairs only with a rationale, never from a scan.
export const LINKAGE_MAP: DirectedPair[] = [
  // --- Tech supply chain ---
  { leader: "Semiconductors", follower: "Software",
    channel: "Semi orders lead tech capex cycle; software reprices after" },
  { leader: "Semiconductors", follower: "Mega-cap Tech",
    channel: "Earliest cyclical read on AI/compute demand" },
  { leader: "Mega-cap Tech", follower: "Semiconductors",
    channel: "Hyperscaler capex announcements drive semi demand (reverse direction)" },
  { leader: "Mega-cap Tech", follower: "Software",
    channel: "Index-weight gravity and platform spending" },
  { leader: "Semiconductors", follower: "Quantum Computing",
    channel: "Quantum names are high-beta satellites of semi/AI sentiment" },

  // --- Risk appetite / financial conditions ---
  { leader: "Banks", follower: "Consumer Discretionary",
    channel: "Credit conditions lead consumer risk appetite" },
  { leader: "Banks", follower: "Real Estate",
    channel: "Lending conditions transmit to property fastest" },
  { leader: "Banks", follower: "Industrials & Defense",
    channel: "Financial conditions lead cyclical capex" },
  { leader: "Banks", follower: "Semiconductors",
    channel: "Risk-off shows in banks before high-beta tech" },

  // --- Energy / input costs ---
  { leader: "Energy", follower: "Industrials & Defense",
    channel: "Capex channel (demand regime) vs input cost (supply regime)",
    regimeSignFlip: true },
  { leader: "Energy", follower: "Consumer Discretionary",
    channel: "Fuel costs squeeze discretionary spending", regimeSignFlip: true },

  // --- Defense complex ---
  { leader: "Industrials & Defense", follower: "Aerospace & Space",
    channel: "Defense budget and contract flow reach primes before pure-space names" },

  // --- Macro series -> sectors ---
  { leader: "US10Y", follower: "Utilities",
    channel: "Bond-proxy duration sensitivity (inverse expected)" },
  { leader: "US10Y", follower: "Real Estate",
    channel: "Cap-rate / financing sensitivity (inverse expected)" },
  { leader: "US10Y", follower: "Banks",
    channel: "Curve steepening aids NIM (positive expected)" },
  { leader: "US10Y", follower: "Biotech & Pharma",
    channel: "Long-duration cashflows of unprofitable biotech (inverse expected)" },
  { leader: "OIL", follower: "Energy",
    channel: "Commodity leads equities within the complex" },
  { leader: "OIL", follower: "Industrials & Defense",
    channel: "Input cost / capex channel", regimeSignFlip: true },
  { leader: "GOLD", follower: "Utilities",
    channel: "Fear / real-rate positioning; defensives follow gold strength" },
  { leader: "GOLD", follower: "Consumer Staples",
    channel: "Defensive rotation follows gold-signalled risk aversion" },

  // --- Regime gauge -> broad (feeds regime classifier, not per-ticker) ---
  { leader: "XLY_XLP_RATIO", follower: "Semiconductors",
    channel: "Risk-appetite ratio leads high-beta sectors" },
  { leader: "XLY_XLP_RATIO", follower: "Quantum Computing",
    channel: "Risk-appetite ratio leads the most speculative cohort" },
];

// ---------------------------------------------------------------------------
// Full-universe (all-pairs) map
// ---------------------------------------------------------------------------

/** Documented channel for a pair, if the curated map has one. */
const CURATED_CHANNEL = new Map<string, DirectedPair>(
  LINKAGE_MAP.map((p) => [`${p.leader}→${p.follower}`, p]),
);

/**
 * Membership containment: |A ∩ B| / min(|A|,|B|).
 * A subsector nested inside its parent basket (e.g. "Semis: Memory" inside
 * "Semiconductors") scores near 1 — testing those against each other is
 * self-contamination, not a linkage, so those pairs are excluded.
 */
export const MAX_MEMBERSHIP_OVERLAP = 0.6;

export function membershipOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let hits = 0;
  for (const s of a) if (setB.has(s)) hits++;
  return hits / Math.min(a.length, b.length);
}

/**
 * Build the exhaustive directed-pair map across the ENTIRE curated universe:
 *   - every ordered sector → sector pair (both directions tested separately)
 *   - every macro series → every sector
 * Pairs whose membership overlaps beyond MAX_MEMBERSHIP_OVERLAP are dropped.
 * Curated pairs keep their written economic channel; everything else is flagged
 * exploratory, so the UI can separate "we expected this" from "the data
 * surfaced this". Multiple-testing burden is handled by BH across all tests.
 */
export function buildAllPairsMap(
  membership: Record<string, string[]> = CURATED_SECTOR_UNIVERSES,
  sectors: SectorName[] = SECTOR_NAMES,
): DirectedPair[] {
  const pairs: DirectedPair[] = [];

  for (const leader of sectors) {
    for (const follower of sectors) {
      if (leader === follower) continue;
      const overlap = membershipOverlap(
        membership[leader] ?? [],
        membership[follower] ?? [],
      );
      if (overlap > MAX_MEMBERSHIP_OVERLAP) continue;
      const curated = CURATED_CHANNEL.get(`${leader}→${follower}`);
      pairs.push(
        curated ?? {
          leader,
          follower,
          channel: `Exploratory: ${leader} → ${follower}, no pre-registered channel`,
          exploratory: true,
        },
      );
    }
  }

  for (const leader of MACRO_SERIES_NAMES) {
    for (const follower of sectors) {
      const curated = CURATED_CHANNEL.get(`${leader}→${follower}`);
      pairs.push(
        curated ?? {
          leader,
          follower,
          channel: `Exploratory: ${leader} → ${follower}, no pre-registered channel`,
          exploratory: true,
        },
      );
    }
  }

  return pairs;
}

/** The full map over all 43 baskets + 4 macro series. */
export const FULL_LINKAGE_MAP: DirectedPair[] = buildAllPairsMap();


// ---------------------------------------------------------------------------
// Composites
// ---------------------------------------------------------------------------

/** Daily log returns from a close series (dates ascending). */
export function toLogReturns(dates: string[], closes: number[]): ReturnSeries {
  const outDates: string[] = [];
  const outVals: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > 0 && closes[i - 1] > 0) {
      outDates.push(dates[i]);
      outVals.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  return { dates: outDates, values: outVals };
}

/**
 * Build per-sector equal-weighted return composites.
 * Returns:
 *   composites: sector -> composite return series (all members)
 *   looComposites: sector -> (ticker -> composite excluding that ticker)
 *
 * bars: all price rows for the curated universe (any order).
 * sectorMembership: sector -> array of symbols.
 */
export function buildSectorComposites(
  bars: PriceBar[],
  sectorMembership: Record<SectorName, string[]>,
): {
  composites: Partial<Record<SectorName, ReturnSeries>>;
  looComposites: Partial<Record<SectorName, Record<string, ReturnSeries>>>;
} {
  // Group closes by symbol, sorted by date.
  const bySymbol = new Map<string, { dates: string[]; closes: number[] }>();
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  for (const b of sorted) {
    let e = bySymbol.get(b.symbol);
    if (!e) { e = { dates: [], closes: [] }; bySymbol.set(b.symbol, e); }
    e.dates.push(b.date);
    e.closes.push(b.close);
  }

  // Per-symbol return maps: date -> return
  const retMaps = new Map<string, Map<string, number>>();
  for (const [sym, { dates, closes }] of bySymbol) {
    const rs = toLogReturns(dates, closes);
    const m = new Map<string, number>();
    rs.dates.forEach((d, i) => m.set(d, rs.values[i]));
    retMaps.set(sym, m);
  }

  const composites: Partial<Record<SectorName, ReturnSeries>> = {};
  const looComposites: Partial<Record<SectorName, Record<string, ReturnSeries>>> = {};

  for (const sector of Object.keys(sectorMembership) as SectorName[]) {
    const members = sectorMembership[sector].filter((s) => retMaps.has(s));
    if (members.length === 0) continue;

    // Union of all dates where at least half the members have a return.
    const dateCount = new Map<string, number>();
    for (const s of members) {
      for (const d of retMaps.get(s)!.keys()) {
        dateCount.set(d, (dateCount.get(d) ?? 0) + 1);
      }
    }
    const dates = [...dateCount.entries()]
      .filter(([, c]) => c >= Math.ceil(members.length / 2))
      .map(([d]) => d)
      .sort();

    const meanOn = (date: string, exclude?: string): number => {
      let sum = 0, n = 0;
      for (const s of members) {
        if (s === exclude) continue;
        const v = retMaps.get(s)!.get(date);
        if (v !== undefined && Number.isFinite(v)) { sum += v; n++; }
      }
      return n > 0 ? sum / n : NaN;
    };

    const full: ReturnSeries = { dates: [], values: [] };
    for (const d of dates) {
      const v = meanOn(d);
      if (Number.isFinite(v)) { full.dates.push(d); full.values.push(v); }
    }
    composites[sector] = full;

    const loo: Record<string, ReturnSeries> = {};
    for (const s of members) {
      const series: ReturnSeries = { dates: [], values: [] };
      for (const d of dates) {
        const v = meanOn(d, s);
        if (Number.isFinite(v)) { series.dates.push(d); series.values.push(v); }
      }
      loo[s] = series;
    }
    looComposites[sector] = loo;
  }

  return { composites, looComposites };
}

// ---------------------------------------------------------------------------
// OLS + lag regression (Granger-style)
// ---------------------------------------------------------------------------

interface OlsFit {
  coefs: number[];      // includes intercept at index 0
  se: number[];
  tStats: number[];
  pValues: number[];    // two-sided, normal approximation (n >> k here)
  rSquared: number;
  n: number;
}

/** Ordinary least squares via normal equations with tiny ridge for stability. */
function ols(y: number[], X: number[][]): OlsFit | null {
  const n = y.length;
  const k = X[0].length;
  if (n <= k + 2) return null;

  // XtX and Xty
  const XtX: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty: number[] = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = a; b < k; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }
  for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a];
  for (let a = 0; a < k; a++) XtX[a][a] += 1e-10; // ridge epsilon

  const XtXinv = invertMatrix(XtX);
  if (!XtXinv) return null;

  const coefs = XtXinv.map((row) => row.reduce((s, v, j) => s + v * Xty[j], 0));

  // Residuals
  let ssr = 0, sst = 0;
  const yMean = y.reduce((s, v) => s + v, 0) / n;
  for (let i = 0; i < n; i++) {
    let yhat = 0;
    for (let a = 0; a < k; a++) yhat += X[i][a] * coefs[a];
    const r = y[i] - yhat;
    ssr += r * r;
    sst += (y[i] - yMean) ** 2;
  }
  const sigma2 = ssr / (n - k);
  const se = XtXinv.map((row, a) => Math.sqrt(Math.max(sigma2 * row[a], 0)));
  const tStats = coefs.map((c, a) => (se[a] > 0 ? c / se[a] : 0));
  const pValues = tStats.map((t) => 2 * (1 - normalCdf(Math.abs(t))));
  const rSquared = sst > 0 ? 1 - ssr / sst : 0;

  return { coefs, se, tStats, pValues, rSquared, n };
}

function invertMatrix(m: number[][]): number[][] | null {
  const k = m.length;
  const a = m.map((row, i) => [
    ...row,
    ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let col = 0; col < k; col++) {
    let pivot = col;
    for (let r = col + 1; r < k; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    }
    if (Math.abs(a[pivot][col]) < 1e-14) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const pv = a[col][col];
    for (let j = 0; j < 2 * k; j++) a[col][j] /= pv;
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (f === 0) continue;
      for (let j = 0; j < 2 * k; j++) a[r][j] -= f * a[col][j];
    }
  }
  return a.map((row) => row.slice(k));
}

function normalCdf(z: number): number {
  // Abramowitz & Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  let p =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 +
      t * (-1.821255978 + t * 1.330274429))));
  if (z > 0) p = 1 - p;
  return p;
}

/** Inner-join two return series on date. */
export function alignSeries(a: ReturnSeries, b: ReturnSeries): {
  dates: string[]; a: number[]; b: number[];
} {
  const bMap = new Map<string, number>();
  b.dates.forEach((d, i) => bMap.set(d, b.values[i]));
  const dates: string[] = [], av: number[] = [], bv: number[] = [];
  a.dates.forEach((d, i) => {
    const v = bMap.get(d);
    if (v !== undefined) { dates.push(d); av.push(a.values[i]); bv.push(v); }
  });
  return { dates, a: av, b: bv };
}

interface LagTestOutcome {
  bestLag: number;
  coefficient: number;
  pValue: number;
  rSquaredDelta: number;
}

/**
 * For follower y and leader x: regress
 *   y_t ~ intercept + y_{t-1..AR_ORDER} + x_{t-lag}
 * for each lag in 1..MAX_LAG; report the lag with the strongest incremental fit.
 * Controlling for the follower's own lags is what makes this Granger-style
 * rather than raw lag correlation.
 */
function lagTest(y: number[], x: number[]): LagTestOutcome | null {
  const n = y.length;
  const start = Math.max(AR_ORDER, MAX_LAG);
  if (n - start < 60) return null;

  // Baseline AR-only R^2 (same sample for fair comparison)
  const baseY: number[] = [], baseX: number[][] = [];
  for (let t = start; t < n; t++) {
    const row = [1];
    for (let p = 1; p <= AR_ORDER; p++) row.push(y[t - p]);
    baseY.push(y[t]);
    baseX.push(row);
  }
  const baseFit = ols(baseY, baseX);
  if (!baseFit) return null;

  let best: LagTestOutcome | null = null;
  for (let lag = 1; lag <= MAX_LAG; lag++) {
    const X: number[][] = baseX.map((row, i) => [...row, x[start + i - lag]]);
    const fit = ols(baseY, X);
    if (!fit) continue;
    const idx = fit.coefs.length - 1;
    const outcome: LagTestOutcome = {
      bestLag: lag,
      coefficient: fit.coefs[idx],
      pValue: fit.pValues[idx],
      rSquaredDelta: Math.max(fit.rSquared - baseFit.rSquared, 0),
    };
    if (!best || outcome.pValue < best.pValue) best = outcome;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Benjamini-Hochberg
// ---------------------------------------------------------------------------

export function benjaminiHochberg(pValues: number[]): number[] {
  const m = pValues.length;
  const indexed = pValues.map((p, i) => ({ p, i }))
    .sort((a, b) => a.p - b.p);
  const adjusted = new Array(m).fill(1);
  let prev = 1;
  for (let rank = m; rank >= 1; rank--) {
    const { p, i } = indexed[rank - 1];
    const adj = Math.min((p * m) / rank, prev);
    adjusted[i] = adj;
    prev = adj;
  }
  return adjusted;
}

// ---------------------------------------------------------------------------
// Main test runner
// ---------------------------------------------------------------------------

/**
 * Run the full linkage test suite.
 * leaderSeries must contain a ReturnSeries for every LeaderName referenced in
 * LINKAGE_MAP (sector composites from buildSectorComposites + macro series
 * converted via toLogReturns; XLY_XLP_RATIO = discretionary composite minus
 * staples composite, computed by the caller or via helper below).
 */
export function runLinkageTests(
  leaderSeries: Partial<Record<LeaderName, ReturnSeries>>,
  followerComposites: Partial<Record<SectorName, ReturnSeries>>,
  map: DirectedPair[] = LINKAGE_MAP,
): LinkageResult[] {
  interface Row { pair: DirectedPair; full: LagTestOutcome;
    h1: LagTestOutcome | null; h2: LagTestOutcome | null; }
  const rows: Row[] = [];

  for (const pair of map) {
    const leader = leaderSeries[pair.leader];
    const follower = followerComposites[pair.follower];
    if (!leader || !follower) continue;

    const joined = alignSeries(follower, leader); // a = follower(y), b = leader(x)
    if (joined.dates.length < MIN_OBS) continue;

    const full = lagTest(joined.a, joined.b);
    if (!full) continue;

    const mid = Math.floor(joined.a.length / 2);
    const h1 = lagTest(joined.a.slice(0, mid), joined.b.slice(0, mid));
    const h2 = lagTest(joined.a.slice(mid), joined.b.slice(mid));

    rows.push({ pair, full, h1, h2 });
  }

  const pAdj = benjaminiHochberg(rows.map((r) => r.full.pValue));

  return rows.map((r, i) => {
    const sign: 1 | -1 = r.full.coefficient >= 0 ? 1 : -1;
    const halvesAgree =
      !!r.h1 && !!r.h2 &&
      Math.sign(r.h1.coefficient) === Math.sign(r.h2.coefficient) &&
      Math.sign(r.h1.coefficient) === Math.sign(r.full.coefficient) &&
      r.h1.pValue < HALF_ALPHA && r.h2.pValue < HALF_ALPHA;

    return {
      leader: r.pair.leader,
      follower: r.pair.follower,
      bestLag: r.full.bestLag,
      coefficient: r.full.coefficient,
      sign,
      pValue: r.full.pValue,
      pAdjusted: pAdj[i],
      rSquaredDelta: r.full.rSquaredDelta,
      firstHalf: r.h1
        ? { coefficient: r.h1.coefficient, pValue: r.h1.pValue }
        : { coefficient: 0, pValue: 1 },
      secondHalf: r.h2
        ? { coefficient: r.h2.coefficient, pValue: r.h2.pValue }
        : { coefficient: 0, pValue: 1 },
      validated: pAdj[i] < BH_ALPHA && halvesAgree,
      channel: r.pair.channel,
      regimeSignFlip: r.pair.regimeSignFlip ?? false,
      exploratory: r.pair.exploratory ?? false,
    };
  });
}

/** Convenience: discretionary-minus-staples spread as the risk-appetite gauge. */
export function buildRiskAppetiteRatio(
  composites: Partial<Record<SectorName, ReturnSeries>>,
): ReturnSeries | null {
  const disc = composites["Consumer Discretionary"];
  const stap = composites["Consumer Staples"];
  if (!disc || !stap) return null;
  const j = alignSeries(disc, stap);
  return { dates: j.dates, values: j.a.map((v, i) => v - j.b[i]) };
}

// ---------------------------------------------------------------------------
// Feature construction for the autoencoder
// ---------------------------------------------------------------------------

export interface TickerLinkageFeature {
  name: string;      // e.g. "lead_Semiconductors_lag3"
  values: number[];  // aligned to featureDates
}

/**
 * For a given ticker, produce lagged leader-return features from VALIDATED
 * linkages targeting the ticker's sector. Uses the leave-one-out composite
 * for same-sector leaders where applicable.
 *
 * tickerReturnDates: the date index the AE feature matrix uses for this ticker.
 */
export function buildTickerFeatures(
  ticker: string,
  tickerSector: SectorName,
  tickerReturnDates: string[],
  validated: LinkageResult[],
  leaderSeries: Partial<Record<LeaderName, ReturnSeries>>,
  looComposites: Partial<Record<SectorName, Record<string, ReturnSeries>>>,
): TickerLinkageFeature[] {
  const features: TickerLinkageFeature[] = [];

  for (const link of validated) {
    if (!link.validated || link.follower !== tickerSector) continue;

    // Resolve leader series, honoring leave-one-out if the ticker somehow
    // appears in the leader sector too (mega-cap overlap case).
    let series: ReturnSeries | undefined;
    const asSector = link.leader as SectorName;
    if (looComposites[asSector]?.[ticker]) {
      series = looComposites[asSector]![ticker];
    } else {
      series = leaderSeries[link.leader];
    }
    if (!series) continue;

    const map = new Map<string, number>();
    series.dates.forEach((d, i) => map.set(d, series!.values[i]));
    const sortedLeaderDates = series.dates; // already ascending

    // For each ticker date, find the leader return `bestLag` trading days back
    // (walk the leader's own calendar to respect trading-day lags).
    const dateIndex = new Map<string, number>();
    sortedLeaderDates.forEach((d, i) => dateIndex.set(d, i));

    const values = tickerReturnDates.map((d) => {
      const idx = dateIndex.get(d);
      if (idx === undefined || idx - link.bestLag < 0) return 0;
      return series!.values[idx - link.bestLag];
    });

    features.push({
      name: `lead_${String(link.leader).replace(/[^A-Za-z0-9]/g, "")}_lag${link.bestLag}`,
      values,
    });
  }

  return features;
}

// ---------------------------------------------------------------------------
// QuantAgent context export
// ---------------------------------------------------------------------------

/** Compact JSON summary of validated linkages for the QuantAgent system prompt. */
export function linkagesToAgentContext(results: LinkageResult[]): string {
  const validated = results.filter((r) => r.validated);
  const candidates = results.filter(
    (r) => !r.validated && r.pAdjusted < 0.20,
  );
  return JSON.stringify({
    asOf: new Date().toISOString().slice(0, 10),
    validatedLinkages: validated.map((r) => ({
      leader: r.leader, follower: r.follower, lagDays: r.bestLag,
      direction: r.sign > 0 ? "positive" : "inverse",
      strength: Number(r.rSquaredDelta.toFixed(4)),
      channel: r.channel,
      regimeDependent: r.regimeSignFlip,
    })),
    weakCandidates: candidates.map((r) => ({
      leader: r.leader, follower: r.follower, lagDays: r.bestLag,
      note: "not statistically validated; monitor as history accumulates",
    })),
  });
}
