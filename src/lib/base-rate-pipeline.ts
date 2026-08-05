// src/lib/base-rate-pipeline.ts
// ─────────────────────────────────────────────────────────────────────────────
// Browser-side computation pipeline for conditioned base rates.
//
// Runs entirely in the browser on price data already available for the curated
// universe (same source as Sector Backtest — the `sector-backtest` edge
// function). No new edge function, no server-side statistics.
//
// Result is cached in memory for the session; recompute only when the
// underlying price data refreshes (call runBaseRatePipeline({ force: true })).
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import {
  CURATED_SECTOR_UNIVERSES, SECTOR_NAMES, primarySectorOf, type SectorName,
} from "@/lib/sector-universes";
import {
  buildSectorComposites, type PriceBar, type ReturnSeries,
} from "@/lib/cross-sector-linkages";
import {
  deriveVolCuts, resolveConditionedBaseRate, compareAcrossVolBuckets,
  type ConditionedBaseRate, type ConditioningProfile, type Occurrence,
  type VolBucket, type BucketComparison,
} from "@/lib/conditioned-base-rates";
import {
  SETUPS, detectOccurrencesForUniverse, detectCurrentSetups,
  sampleBaselineReturns, universeVolatilities, profileForSymbol,
  type SymbolSeries, type DetectorContext, type DetectionConfig,
} from "@/lib/setup-detector";

// ─── Config ───────────────────────────────────────────────────────────────────

/** Forward evaluation horizon, trading days. */
export const HORIZON_DAYS = 20;
/** MUST be >= HORIZON_DAYS — overlapping forward windows make sample sizes
 *  look larger than the effective independent sample actually is. */
export const COOLDOWN_BARS = 25;

if (COOLDOWN_BARS < HORIZON_DAYS) {
  throw new Error("cooldownBars must be >= horizonDays");
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BaseRatePipeline {
  universe: SymbolSeries[];
  seriesBySymbol: Record<string, SymbolSeries>;
  ctxBySymbol: Record<string, DetectorContext>;
  volCuts: { calmMax: number; normalMax: number };
  cfg: DetectionConfig;
  /** setup name -> every occurrence across the universe */
  occurrences: Record<string, Occurrence[]>;
  /** Unconditional forward returns over the same population and period. */
  baseline: number[];
  computedAt: string;
  symbolsFetched: number;
  sectorsFailed: string[];
}

export interface MatchedBaseRate {
  name: string;
  rationale: string;
  rate: ConditionedBaseRate;
}

export interface SymbolBaseRates {
  symbol: string;
  profile: ConditioningProfile;
  matches: MatchedBaseRate[];
  /** Highest-excess match, or null when nothing matches. */
  best: MatchedBaseRate | null;
  /** True when at least one matching setup passes the conservative gate. */
  anyConservative: boolean;
}

export interface PipelineProgress {
  stage: "prices" | "compute" | "done";
  message: string;
  done?: number;
  total?: number;
}

// ─── Price fetch (same source as Sector Backtest) ──────────────────────────────

async function fetchSector(sector: SectorName) {
  const { data, error } = await supabase.functions.invoke("sector-backtest", {
    body: { sector, source: "curated", maxTickers: 50 },
  });
  if (error) throw new Error(`${sector}: ${error.message}`);
  if (data?.error) throw new Error(`${sector}: ${data.error}`);
  return data as {
    sector: string;
    prices: Record<string, { dates: string[]; closes: number[] }>;
  };
}

function yearsSince(dateStr: string): number {
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (Date.now() - t) / (365.25 * 24 * 3600 * 1000));
}

/** Build a SymbolSeries from a raw close series. listingYears comes from the
 *  earliest available price date. */
export function makeSymbolSeries(
  symbol: string,
  dates: string[],
  closes: number[],
  sector?: string | null,
): SymbolSeries {
  const cleanDates: string[] = [];
  const cleanCloses: number[] = [];
  for (let i = 0; i < dates.length; i++) {
    const c = closes[i];
    if (!Number.isFinite(c) || c <= 0) continue;
    cleanDates.push(dates[i]);
    cleanCloses.push(c);
  }
  return {
    symbol,
    dates: cleanDates,
    closes: cleanCloses,
    listingYears: cleanDates.length ? yearsSince(cleanDates[0]) : 0,
    sector: sector || primarySectorOf(symbol) || "Unclassified",
  };
}

/** Align a sector composite return series to a symbol's dates. */
function alignComposite(series: SymbolSeries, composite: ReturnSeries | undefined): number[] | null {
  if (!composite) return null;
  const map = new Map<string, number>();
  for (let i = 0; i < composite.dates.length; i++) {
    map.set(composite.dates[i], composite.values[i]);
  }
  const out = series.dates.map(d => map.get(d) ?? 0);
  return out.some(v => v !== 0) ? out : null;
}

// ─── Session cache ────────────────────────────────────────────────────────────

let cached: BaseRatePipeline | null = null;
let inFlight: Promise<BaseRatePipeline> | null = null;

export function peekBaseRatePipeline(): BaseRatePipeline | null {
  return cached;
}

export async function runBaseRatePipeline(
  opts: { force?: boolean; onProgress?: (p: PipelineProgress) => void } = {},
): Promise<BaseRatePipeline> {
  if (cached && !opts.force) return cached;
  if (inFlight && !opts.force) return inFlight;

  inFlight = (async () => {
    const { onProgress } = opts;
    const bars: PriceBar[] = [];
    const sectorsFailed: string[] = [];
    const raw = new Map<string, { dates: string[]; closes: number[] }>();

    // 1 — prices for the curated universe
    const CONC = 3;
    for (let i = 0; i < SECTOR_NAMES.length; i += CONC) {
      const batch = SECTOR_NAMES.slice(i, i + CONC);
      onProgress?.({
        stage: "prices",
        message: `Fetching prices — ${batch.join(", ")}`,
        done: i, total: SECTOR_NAMES.length,
      });
      const settled = await Promise.allSettled(batch.map(s => fetchSector(s)));
      for (let j = 0; j < batch.length; j++) {
        const r = settled[j];
        if (r.status !== "fulfilled") { sectorsFailed.push(batch[j]); continue; }
        for (const [sym, series] of Object.entries(r.value.prices)) {
          if (!raw.has(sym)) raw.set(sym, series);
          for (let k = 0; k < series.dates.length; k++) {
            bars.push({ symbol: sym, date: series.dates[k], close: series.closes[k] });
          }
        }
      }
    }

    onProgress?.({ stage: "compute", message: "Detecting setups and measuring base rates…" });

    const universe: SymbolSeries[] = [];
    const seriesBySymbol: Record<string, SymbolSeries> = {};
    for (const [sym, s] of raw) {
      const built = makeSymbolSeries(sym, s.dates, s.closes);
      if (built.closes.length < 60) continue;
      universe.push(built);
      seriesBySymbol[sym] = built;
    }

    // 2 — volatility cuts from the universe itself
    const volCuts = deriveVolCuts(universeVolatilities(universe));

    // 3 — detection config (cooldown >= horizon)
    const cfg: DetectionConfig = {
      horizonDays: HORIZON_DAYS,
      cooldownBars: COOLDOWN_BARS,
      volCuts,
    };

    // 4 — sector composite context per symbol
    const { composites } = buildSectorComposites(
      bars, CURATED_SECTOR_UNIVERSES as Record<SectorName, string[]>,
    );
    const ctxBySymbol: Record<string, DetectorContext> = {};
    for (const s of universe) {
      ctxBySymbol[s.symbol] = {
        sectorCompositeReturns: alignComposite(
          s, composites[s.sector as SectorName] as ReturnSeries | undefined,
        ),
      };
    }

    const occurrences = detectOccurrencesForUniverse(universe, ctxBySymbol, cfg);

    // 5 — unconditional baseline over the same population and period
    const baseline = sampleBaselineReturns(universe, cfg);

    onProgress?.({ stage: "done", message: "Base rates ready" });

    const result: BaseRatePipeline = {
      universe,
      seriesBySymbol,
      ctxBySymbol,
      volCuts,
      cfg,
      occurrences,
      baseline,
      computedAt: new Date().toISOString(),
      symbolsFetched: universe.length,
      sectorsFailed,
    };
    cached = result;
    return result;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

// ─── Per-symbol resolution ────────────────────────────────────────────────────

/**
 * Resolve the conditioning profile and conditioned base rates for a symbol.
 * `series` may be supplied for symbols outside the curated universe; otherwise
 * the pipeline's own series is used.
 */
export function baseRatesForSymbol(
  pipeline: BaseRatePipeline,
  symbol: string,
  series?: SymbolSeries | null,
): SymbolBaseRates | null {
  const s = series ?? pipeline.seriesBySymbol[symbol] ?? null;
  if (!s || s.closes.length < 60) return null;

  const ctx = pipeline.ctxBySymbol[symbol] ?? { sectorCompositeReturns: null };
  const profile = profileForSymbol(s, pipeline.volCuts);
  const current = detectCurrentSetups(s, ctx);

  const matches: MatchedBaseRate[] = current.map(c => ({
    name: c.name,
    rationale: c.rationale,
    rate: resolveConditionedBaseRate(
      c.name, profile, pipeline.occurrences[c.name] ?? [], symbol, pipeline.baseline,
    ),
  }));

  const best = matches.reduce<MatchedBaseRate | null>((acc, m) => {
    if (!acc) return m;
    return (m.rate.excessHitRatePp ?? -Infinity) > (acc.rate.excessHitRatePp ?? -Infinity) ? m : acc;
  }, null);

  return {
    symbol,
    profile,
    matches,
    best,
    anyConservative: matches.some(m => m.rate.meetsConservativeCriteria),
  };
}

// ─── Methodology helpers ──────────────────────────────────────────────────────

export interface SetupBucketRow extends BucketComparison {
  /** Unconditional hit rate for the same volatility bucket. */
  baselineHitRate: number | null;
  baselineN: number;
}

/** Hit rate by volatility bucket for one setup, each alongside its own
 *  same-bucket unconditional baseline. */
export function setupBucketTable(
  pipeline: BaseRatePipeline,
  setupName: string,
): SetupBucketRow[] {
  const occs = pipeline.occurrences[setupName] ?? [];
  return compareAcrossVolBuckets(occs).map(row => {
    const baseReturns = sampleBaselineReturns(
      pipeline.universe, pipeline.cfg, { volBucket: row.bucket as VolBucket },
    );
    const wins = baseReturns.filter(r => r > 0).length;
    return {
      ...row,
      baselineHitRate: baseReturns.length ? wins / baseReturns.length : null,
      baselineN: baseReturns.length,
    };
  });
}

export { SETUPS };
