// lib/checklist-snapshot.ts
// ─────────────────────────────────────────────────────────────────────────────
// Builds the auto_snapshot for a Pre-Investment Checklist.
//
// Rules enforced here:
//   • Every AUTO value carries its source and its as-of date.
//   • Values that the platform does not have are reported as unavailable, in
//     plain words. They are never estimated, inferred, or filled by an AI.
//   • Concerns come from the deterministic rules in CONCERN_RULES only. No
//     aggregation, no score, no verdict.
//   • Section 7 text is quoted verbatim from the forecast engine.
//
// This module reads existing data only. It does not touch the backtest math,
// the base-rate engine, the linkage tests, or the fundamentals fetcher.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { readCachedLinkages } from "@/lib/run-linkages";
import { computeRegimeBadge, type MacroIndicatorMap } from "@/lib/regime-signal";
import { SECTOR_ETF_PROXY } from "@/lib/sector-etf-mapping";
import type { SectorName } from "@/lib/sector-universes";
import type { ForecastResult } from "@/lib/backtest";
import type { SymbolBaseRates } from "@/lib/base-rate-pipeline";

export interface AutoValue {
  value: string;
  source: string;
  /** ISO date or human date string of the underlying data. */
  asOf: string;
  available: boolean;
}

export interface AutoSnapshot {
  version: 1;
  ticker: string;
  capturedAt: string;
  values: Record<string, AutoValue>;
  concerns: string[];
  /** Verbatim honest reading rendered under section 7. */
  modelReading: string;
  autoFilledCount: number;
}

export interface SnapshotInput {
  symbol: string;
  sector?: string;
  companyName?: string;
  dates: string[];
  closes: number[];
  forecast: ForecastResult | null;
  baseRates: SymbolBaseRates | null;
}

const UNAVAILABLE_NOTE = "Not available from the data sources this app currently ingests.";

const na = (source: string): AutoValue =>
  ({ value: UNAVAILABLE_NOTE, source, asOf: "—", available: false });

const val = (value: string, source: string, asOf: string): AutoValue =>
  ({ value, source, asOf, available: true });

const money = (v: number) =>
  `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const signedPct = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;

function median(xs: number[]): number | null {
  const s = xs.filter(x => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function pctChangeOverBars(closes: number[], bars: number): number | null {
  if (closes.length < bars + 1) return null;
  const a = closes[closes.length - 1 - bars];
  const b = closes[closes.length - 1];
  return a > 0 ? ((b - a) / a) * 100 : null;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function buildAutoSnapshot(input: SnapshotInput): Promise<AutoSnapshot> {
  const { symbol, sector, companyName, dates, closes, forecast, baseRates } = input;
  const values: Record<string, AutoValue> = {};
  const concerns: string[] = [];
  const capturedAt = new Date().toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const lastPriceDate = dates.length ? dates[dates.length - 1] : today;
  const currentPrice = forecast?.currentPrice ?? (closes.length ? closes[closes.length - 1] : null);

  // ── Fundamentals cache ─────────────────────────────────────────────────────
  const { data: fund } = await supabase
    .from("stock_fundamentals")
    .select("*")
    .eq("ticker", symbol.toUpperCase())
    .maybeSingle();

  const fundAsOf = fund?.updated_at ? String(fund.updated_at).slice(0, 10) : today;
  const FUND_SRC = "Cached fundamentals (stock_fundamentals)";
  const effSector = fund?.sector ?? sector ?? null;

  // ── Sector medians from the same cache ─────────────────────────────────────
  let sectorPe: number | null = null;
  let sectorFwdPe: number | null = null;
  let sectorPeerCount = 0;
  if (effSector) {
    const { data: peers } = await supabase
      .from("stock_fundamentals")
      .select("ticker, pe_ratio, forward_pe")
      .eq("sector", effSector);
    const rows = (peers ?? []).filter(p => p.ticker !== symbol.toUpperCase());
    sectorPeerCount = rows.length;
    sectorPe    = median(rows.map(p => Number(p.pe_ratio)).filter(v => Number.isFinite(v) && v > 0));
    sectorFwdPe = median(rows.map(p => Number(p.forward_pe)).filter(v => Number.isFinite(v) && v > 0));
  }

  // ── SECTION 1 ──────────────────────────────────────────────────────────────
  values.a_identity = val(
    [fund?.company_name ?? companyName ?? symbol, effSector ?? "sector unknown", fund?.industry ?? "industry unknown"].join(" · "),
    FUND_SRC, fundAsOf,
  );
  values.a_next_earnings = na("Earnings calendar is not ingested by this app");
  values.a_last_quarter  = na("Quarterly results are not ingested by this app");

  // ── SECTION 2 ──────────────────────────────────────────────────────────────
  values.a_revenue_growth  = na(FUND_SRC + " — income statement not ingested");
  values.a_margins         = na(FUND_SRC + " — income statement not ingested");
  values.a_returns         = na(FUND_SRC + " — return metrics not ingested");
  values.a_fcf             = na(FUND_SRC + " — cash-flow statement not ingested");
  values.a_debt_equity     = na(FUND_SRC + " — balance sheet not ingested");
  values.a_current_ratio   = na(FUND_SRC + " — balance sheet not ingested");
  values.a_share_count     = na(FUND_SRC + " — share count history not ingested");
  values.a_credit_ratings  = na("Credit-rating agency data is not ingested by this app");

  // ── SECTION 3 ──────────────────────────────────────────────────────────────
  const pe = Number(fund?.pe_ratio);
  const fpe = Number(fund?.forward_pe);
  if (Number.isFinite(pe) || Number.isFinite(fpe)) {
    const parts: string[] = [];
    parts.push(Number.isFinite(pe) ? `Trailing P/E ${pe.toFixed(1)}` : "Trailing P/E not available");
    parts.push(Number.isFinite(fpe) ? `forward P/E ${fpe.toFixed(1)}` : "forward P/E not available");
    parts.push(sectorPe != null
      ? `sector median trailing ${sectorPe.toFixed(1)} (${sectorPeerCount} peers in cache)`
      : "no sector median available");
    if (sectorFwdPe != null) parts.push(`sector median forward ${sectorFwdPe.toFixed(1)}`);
    values.a_pe = val(parts.join(" · "), FUND_SRC, fundAsOf);
  } else {
    values.a_pe = na(FUND_SRC);
  }

  values.a_ev_ebitda = na(FUND_SRC + " — enterprise value and EBITDA not ingested");

  values.a_ps_pb = na(FUND_SRC + " — revenue and book value per share not ingested");

  const hi = Number(fund?.fifty_two_week_high);
  const lo = Number(fund?.fifty_two_week_low);
  if (Number.isFinite(hi) && Number.isFinite(lo) && hi > lo && currentPrice != null) {
    const posPct = ((currentPrice - lo) / (hi - lo)) * 100;
    values.a_52w = val(
      `${money(lo)} – ${money(hi)} · current ${money(currentPrice)} sits at ${posPct.toFixed(0)}% of the range`,
      FUND_SRC, fundAsOf,
    );
  } else {
    values.a_52w = na(FUND_SRC);
  }

  const change1y = pctChangeOverBars(closes, 252);
  values.a_1y_change = change1y == null
    ? na("Daily closes (stock_prices) — fewer than 252 bars available")
    : val(signedPct(change1y), "Daily closes (stock_prices)", lastPriceDate);

  // ── SECTION 4 ──────────────────────────────────────────────────────────────
  const mc = Number(fund?.market_cap);
  values.a_liquidity = Number.isFinite(mc) && mc > 0
    ? val(
        `Market cap $${(mc / 1e9).toFixed(2)}B · average volume not ingested · beta not ingested`,
        FUND_SRC, fundAsOf,
      )
    : na(FUND_SRC);
  values.a_short_interest = na("Short-interest data is not ingested by this app");

  // ── SECTION 5 ──────────────────────────────────────────────────────────────
  values.a_sector = effSector
    ? val(`${effSector}${fund?.industry ? ` · ${fund.industry}` : ""}`, FUND_SRC, fundAsOf)
    : na(FUND_SRC);

  const proxy = effSector ? SECTOR_ETF_PROXY[effSector as SectorName] : null;
  if (proxy) {
    const { data: etfRows } = await supabase
      .from("stock_prices")
      .select("date, close")
      .eq("ticker", proxy.symbol)
      .order("date", { ascending: false })
      .limit(40);
    const series = (etfRows ?? []).slice().reverse().map(r => Number(r.close));
    const ret20 = pctChangeOverBars(series, 20);
    values.a_sector_20d = ret20 == null
      ? na(`Sector proxy ${proxy.symbol} — not enough cached history`)
      : val(`${proxy.label}: ${signedPct(ret20)} over the last 20 trading days`,
             "Sector ETF proxy closes (stock_prices)",
             String(etfRows?.[0]?.date ?? lastPriceDate));
  } else {
    values.a_sector_20d = na("No single-ETF proxy is mapped for this sector");
  }

  // ── SECTION 6 ──────────────────────────────────────────────────────────────
  const { data: macroRows } = await supabase
    .from("macro_indicators")
    .select("indicator_key, value, previous_value, change_30d, as_of_date, updated_at");
  const macroMap: MacroIndicatorMap = {};
  (macroRows ?? []).forEach(r => { macroMap[r.indicator_key] = r as MacroIndicatorMap[string]; });
  const macroAsOf = macroRows?.length
    ? String(macroRows.map(r => r.as_of_date ?? "").sort().pop() || today).slice(0, 10)
    : today;

  if (macroRows?.length) {
    const badge = computeRegimeBadge(macroMap);
    const contrib = badge.contributions.length
      ? badge.contributions.map(c => `${c.label} (+${c.points})`).join("; ")
      : "no stress contributions";
    values.a_regime = val(`${badge.label} · score ${badge.score} · ${contrib}`,
      "Macro regime signal (macro_indicators)", macroAsOf);

    const tnx  = macroMap.us10y?.value;
    const wti  = macroMap.wti?.value;
    const gold = macroMap.gold?.value;
    values.a_macro_levels = val(
      [
        tnx  != null ? `10Y ${tnx.toFixed(2)}%` : "10Y not available",
        wti  != null ? `WTI $${wti.toFixed(2)}` : "oil not available",
        gold != null ? `Gold $${gold.toFixed(0)}` : "gold not available",
      ].join(" · "),
      "Macro indicators (macro_indicators)", macroAsOf,
    );
  } else {
    values.a_regime = na("Macro indicators (macro_indicators)");
    values.a_macro_levels = na("Macro indicators (macro_indicators)");
  }

  const cache = readCachedLinkages();
  const followed = (cache?.results ?? []).filter(r => r.validated && r.follower === effSector);
  values.a_linkages = cache
    ? val(
        followed.length
          ? followed.map(l =>
              `${l.leader} leads by ${l.bestLag} day${l.bestLag === 1 ? "" : "s"}, ${l.sign > 0 ? "same" : "opposite"} direction (adj p ${l.pAdjusted.toFixed(3)})`,
            ).join("; ")
          : "No validated cross-sector linkage currently has this sector as the follower.",
        "Cross-sector linkage tests (cached)", String(cache.updatedAt).slice(0, 10),
      )
    : na("Cross-sector linkage cache is empty — run the linkage engine first");

  // ── SECTION 7 — verbatim from the engine ───────────────────────────────────
  const v = forecast?.validation ?? null;
  const dirHitRate = v?.directionHitRate ?? 0;
  const dirHits = v ? Math.round(v.directionHitRate * v.windowCount) : 0;
  const ENG_SRC = "QuantForecast engine (rolling-window validation)";

  if (forecast && v) {
    values.a_direction_reliability = val(
      `Direction correct in ${dirHits} of ${v.windowCount} rolling windows (${(dirHitRate * 100).toFixed(0)}%)`,
      ENG_SRC, lastPriceDate,
    );
    const band = forecast.magnitudeSignal.expectedMovePct;
    values.a_expected_move = val(
      `±${band.toFixed(1)}% 1σ over 30 days · point forecast ${signedPct(forecast.forecastPct)}`,
      ENG_SRC, lastPriceDate,
    );
    values.a_model_fit = val(`${forecast.confidenceScore}/100`, ENG_SRC, lastPriceDate);
    values.a_winner = val(
      v.decisive && v.winnerLabel
        ? `Decisive winner: ${v.winnerLabel}`
        : "No single model validated — ensemble mean used",
      ENG_SRC, lastPriceDate,
    );
    if (currentPrice != null) {
      const low = currentPrice * (1 - band / 100);
      const high = currentPrice * (1 + band / 100);
      values.a_sigma_dollars = val(
        `${money(low)} – ${money(high)} (from ${money(currentPrice)})`,
        ENG_SRC, lastPriceDate,
      );
    } else {
      values.a_sigma_dollars = na(ENG_SRC);
    }
  } else {
    values.a_direction_reliability = na(ENG_SRC);
    values.a_expected_move = na(ENG_SRC);
    values.a_model_fit = na(ENG_SRC);
    values.a_winner = na(ENG_SRC);
    values.a_sigma_dollars = na(ENG_SRC);
  }

  const BR_SRC = "Conditioned base rates (cross-sectional, session cache)";
  if (baseRates) {
    const p = baseRates.profile;
    values.a_forecastability = val(
      `Volatility bucket ${p.volBucket} · listing bucket ${p.listingBucket ?? "unknown"} · ${p.forecastabilityNote}`,
      BR_SRC, lastPriceDate,
    );
    values.a_setups = val(
      baseRates.matches.length
        ? baseRates.matches.map(m => m.name).join("; ")
        : "none",
      BR_SRC, lastPriceDate,
    );
    values.a_setup_detail = baseRates.matches.length
      ? val(
          baseRates.matches.map(m => {
            const r = m.rate;
            const s = r.stats;
            if (!s) return `${m.name}: ${r.sourceNote}`;
            const baseline = r.baselineStats ? `${(r.baselineStats.hitRate * 100).toFixed(0)}%` : "n/a";
            const excess = r.excessHitRatePp == null ? "n/a" : `${r.excessHitRatePp >= 0 ? "+" : ""}${r.excessHitRatePp.toFixed(1)}pp`;
            return `${m.name}: hit rate ${(s.hitRate * 100).toFixed(0)}% vs baseline ${baseline}, excess ${excess}, n=${s.n}, track-record gate ${r.meetsConservativeCriteria ? "passed" : "not passed"}`;
          }).join(" | "),
          BR_SRC, lastPriceDate,
        )
      : val("No matching setup, so there is nothing to report.", BR_SRC, lastPriceDate);
  } else {
    values.a_forecastability = na(BR_SRC);
    values.a_setups = na(BR_SRC);
    values.a_setup_detail = na(BR_SRC);
  }

  const noSetupMatch = !baseRates || baseRates.matches.length === 0;
  const modelReading = (dirHitRate <= 0.55 || noSetupMatch)
    ? "The models contribute nothing to this decision. Any conclusion rests on fundamentals, valuation, and your own judgement."
    : "Models provide a measured signal. Read it alongside the expected-move band — a forecast smaller than the band is not actionable.";

  // ── SECTION 8 — multiple-reversion downside ────────────────────────────────
  if (Number.isFinite(pe) && pe > 0 && sectorPe != null && currentPrice != null) {
    const downside = (sectorPe / pe - 1) * 100;
    values.a_multiple_downside = val(
      `At the sector median trailing P/E of ${sectorPe.toFixed(1)} and unchanged earnings, the price implied is ${money(currentPrice * (sectorPe / pe))} (${signedPct(downside)}).`,
      FUND_SRC, fundAsOf,
    );
  } else {
    values.a_multiple_downside = na(FUND_SRC + " — needs a trailing P/E and a sector median");
  }

  // ── Concerns — deterministic rules only ────────────────────────────────────
  if (Number.isFinite(pe) && pe > 0 && sectorPe != null && pe > sectorPe * 1.2) {
    concerns.push(`Trailing P/E of ${pe.toFixed(1)} is ${(((pe / sectorPe) - 1) * 100).toFixed(0)}% above the sector median of ${sectorPe.toFixed(1)}.`);
  }
  if (Number.isFinite(fpe) && fpe > 0 && sectorFwdPe != null && fpe > sectorFwdPe * 1.2) {
    concerns.push(`Forward P/E of ${fpe.toFixed(1)} is ${(((fpe / sectorFwdPe) - 1) * 100).toFixed(0)}% above the sector median of ${sectorFwdPe.toFixed(1)}.`);
  }
  if (dirHitRate <= 0.55) {
    concerns.push(`Model direction hit rate is ${(dirHitRate * 100).toFixed(0)}% across ${v?.windowCount ?? 0} rolling windows, at or below the 55% threshold where direction carries no information.`);
  }
  if (noSetupMatch) {
    concerns.push("No historical setup matches this symbol right now, so there is no base-rate evidence to lean on.");
  }
  if (change1y != null && change1y > 40) {
    concerns.push(`The price is up ${change1y.toFixed(0)}% over the last year, more than the 40% level at which recent-move risk becomes material.`);
  }
  // Rules kept for when the data lands: dilution, debt/equity vs sector median,
  // negative revenue growth, sub-investment-grade rating. Each fires only on
  // real values, never on an estimate.

  const autoFilledCount = Object.values(values).filter(x => x.available).length;

  return { version: 1, ticker: symbol.toUpperCase(), capturedAt, values, concerns, modelReading, autoFilledCount };
}

export function emptySnapshot(ticker: string): AutoSnapshot {
  return {
    version: 1, ticker: ticker.toUpperCase(), capturedAt: new Date().toISOString(),
    values: {}, concerns: [],
    modelReading:
      "The models contribute nothing to this decision. Any conclusion rests on fundamentals, valuation, and your own judgement.",
    autoFilledCount: 0,
  };
}
