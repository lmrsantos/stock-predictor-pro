// components/BaseRateSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Conditioned historical base rates for one symbol.
//
// Display rules enforced here:
//   • An absolute hit rate is NEVER shown without its baseline next to it.
//   • When symbolOccurrences < 10 the "too few to mean anything" warning is
//     always rendered — it cannot be collapsed or hidden.
//   • The emphasized number is the excess over baseline, not the level.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { InfoTooltip } from "@/components/InfoTooltip";
import {
  runBaseRatePipeline, baseRatesForSymbol, makeSymbolSeries,
  type SymbolBaseRates, type MatchedBaseRate,
} from "@/lib/base-rate-pipeline";

interface BaseRateSectionProps {
  symbol: string;
  sector?: string;
  /** Price history for the symbol (used when it is outside the curated universe). */
  dates: string[];
  closes: number[];
}

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const signedPp = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}pp`;

const EXCESS_TOOLTIP = {
  title: "Excess over baseline",
  what: "The setup's hit rate minus the unconditional hit rate for comparable names over the same period.",
  howToRead: "Setups that require an uptrend score around 55% even with no predictive power, because of path selection. Only the excess over baseline carries information.",
};

function Tile({
  label, value, sub, emphasized, tone,
}: {
  label: string; value: string; sub?: string; emphasized?: boolean;
  tone?: "green" | "neutral";
}) {
  return (
    <div className={`rounded-lg border p-2.5 ${
      emphasized
        ? tone === "green"
          ? "border-green-500/40 bg-green-500/10"
          : "border-border bg-muted/40"
        : "border-border/60 bg-card/30"
    }`}>
      <div className="flex items-center text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
        {label}
        {emphasized && <InfoTooltip {...EXCESS_TOOLTIP} />}
      </div>
      <p className={`text-sm font-mono font-bold mt-0.5 ${
        emphasized && tone === "green" ? "text-green-600 dark:text-green-400" : "text-foreground"
      }`}>
        {value}
      </p>
      {sub && <p className="text-[9px] font-mono text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function SetupCard({ match }: { match: MatchedBaseRate }) {
  const r = match.rate;
  const s = r.stats;
  const base = r.baselineStats;
  const excess = r.excessHitRatePp;
  const green = (excess ?? 0) >= 5;

  return (
    <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
      <div>
        <p className="text-[12px] font-mono font-bold text-foreground">{match.name}</p>
        <p className="text-[10px] font-mono text-muted-foreground leading-relaxed line-clamp-2 mt-0.5">
          {match.rationale}
        </p>
      </div>

      {!s ? (
        <p className="text-[11px] font-mono text-amber-500">{r.sourceNote}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Tile
              label="Hit rate"
              value={base ? `${pct(s.hitRate, 0)} vs ${pct(base.hitRate, 0)} baseline` : "—"}
              sub={`CI ${pct(s.hitRateCI95[0], 0)}–${pct(s.hitRateCI95[1], 0)}`}
            />
            <Tile
              label="vs baseline"
              value={excess == null ? "n/a" : signedPp(excess)}
              sub={base ? `baseline ${pct(base.hitRate, 0)}` : "no baseline"}
              emphasized
              tone={green ? "green" : "neutral"}
            />
            <Tile
              label="Median return"
              value={pct(s.medianReturn)}
              sub={base ? `baseline ${pct(base.medianReturn)}` : undefined}
            />
            <Tile label="Occurrences" value={String(s.n)} sub="comparable names" />
          </div>

          <p className="text-[10px] font-mono text-foreground/80">
            Worst decile {pct(s.p10)} · loss over 10% in {pct(s.probLossOver10, 0)} of cases
          </p>
        </>
      )}

      <p className="text-[10px] font-mono text-muted-foreground leading-relaxed">{r.sourceNote}</p>

      <p className="text-[10px] font-mono text-muted-foreground leading-relaxed">
        This symbol: {r.symbolOccurrences} occurrence{r.symbolOccurrences === 1 ? "" : "s"}
        {r.symbolOccurrences < 10 && (
          <span className="text-amber-500">
            {" "}— far too few to mean anything on its own. The numbers above come from comparable names.
          </span>
        )}
      </p>

      <div className="space-y-1">
        <span className={`inline-block text-[9px] font-mono font-semibold px-2 py-0.5 rounded ${
          r.meetsConservativeCriteria
            ? "bg-green-500/15 text-green-600 dark:text-green-400"
            : "bg-muted text-muted-foreground"
        }`}>
          {r.meetsConservativeCriteria ? "Passes conservative criteria" : "Does not pass"}
        </span>
        <p className="text-[10px] font-mono text-muted-foreground leading-relaxed">
          {r.conservativeVerdict}
        </p>
      </div>
    </div>
  );
}

export function BaseRateSection({ symbol, sector, dates, closes }: BaseRateSectionProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [data, setData]       = useState<SymbolBaseRates | null>(null);

  useEffect(() => {
    if (!symbol || closes.length < 60) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const pipeline = await runBaseRatePipeline();
        const series = makeSymbolSeries(symbol, dates, closes, sector);
        const res = baseRatesForSymbol(pipeline, symbol, series);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [symbol, sector, dates, closes]);

  return (
    <section className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Historical base rates
        </p>
        <Link to="/methodology" target="_blank" rel="noopener noreferrer"
          className="text-[10px] font-mono text-primary hover:underline shrink-0">
          How is this calculated?
        </Link>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Measuring setups across comparable names…
        </div>
      )}

      {error && !loading && (
        <p className="text-[11px] font-mono text-destructive">{error}</p>
      )}

      {data && !loading && (
        <>
          <div>
            <p className="text-[11px] font-mono text-foreground">
              {data.profile.volBucket} volatility ({pct(data.profile.annualizedVol, 0)}) ·{" "}
              {data.profile.listingBucket} ({data.profile.listingYears.toFixed(1)} years listed)
            </p>
            <p className="text-[10px] font-mono text-muted-foreground leading-relaxed mt-0.5">
              {data.profile.forecastabilityNote}
            </p>
          </div>

          {data.matches.length === 0 ? (
            <p className="text-[11px] font-mono text-muted-foreground">
              No defined setups match this symbol right now.
            </p>
          ) : (
            <>
              <div className="space-y-3">
                {data.matches.map(m => <SetupCard key={m.name} match={m} />)}
              </div>
              <p className="text-[10px] font-mono text-muted-foreground leading-relaxed border-t border-border pt-2">
                Base rates describe what followed historically across comparable stocks. They are
                not predictions, and any single occurrence can land anywhere in the distribution
                shown.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
