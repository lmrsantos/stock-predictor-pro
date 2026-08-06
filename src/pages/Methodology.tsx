// pages/Methodology.tsx
// Not linked from the main nav — reached from "How is this calculated?" links.

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";

import {
  runBaseRatePipeline, setupBucketTable, SETUPS,
  type BaseRatePipeline, type SetupBucketRow,
} from "@/lib/base-rate-pipeline";
import { CONSERVATIVE_CRITERIA } from "@/lib/conditioned-base-rates";

const pct = (v: number | null, d = 0) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);

function BucketTable({ pipeline, setupName }: { pipeline: BaseRatePipeline; setupName: string }) {
  const rows: SetupBucketRow[] = setupBucketTable(pipeline, setupName);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] font-mono">
        <thead>
          <tr className="text-muted-foreground text-left">
            <th className="py-1.5 pr-3 font-normal">Volatility bucket</th>
            <th className="py-1.5 pr-3 font-normal">Hit rate</th>
            <th className="py-1.5 pr-3 font-normal">Baseline (same bucket)</th>
            <th className="py-1.5 pr-3 font-normal">Excess</th>
            <th className="py-1.5 pr-3 font-normal">Median return</th>
            <th className="py-1.5 font-normal">n</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const excess = r.baselineHitRate != null && r.n > 0
              ? (r.hitRate - r.baselineHitRate) * 100 : null;
            return (
              <tr key={r.bucket} className="border-t border-border/60">
                <td className="py-1.5 pr-3 text-foreground capitalize">{r.bucket}</td>
                <td className="py-1.5 pr-3">{r.n > 0 ? pct(r.hitRate) : "—"}</td>
                <td className="py-1.5 pr-3">{pct(r.baselineHitRate)}</td>
                <td className={`py-1.5 pr-3 ${excess != null && excess >= 5 ? "text-green-600 dark:text-green-400" : ""}`}>
                  {excess == null ? "—" : `${excess >= 0 ? "+" : ""}${excess.toFixed(1)}pp`}
                </td>
                <td className="py-1.5 pr-3">{r.n > 0 ? pct(r.medianReturn, 1) : "—"}</td>
                <td className="py-1.5">{r.n}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Methodology() {
  const [pipeline, setPipeline] = useState<BaseRatePipeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading price history…");

  useEffect(() => {
    document.title = "Methodology — how the base rates are calculated";
    let cancelled = false;
    runBaseRatePipeline({ onProgress: p => { if (!cancelled) setStatus(p.message); } })
      .then(p => { if (!cancelled) setPipeline(p); })
      .catch(e => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-5 py-8 space-y-8">
        <div>
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else window.close();
            }}
            className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Close and return
          </button>

          <h1 className="text-2xl font-mono font-bold text-foreground mt-3">Methodology</h1>
          <p className="text-[12px] font-mono text-muted-foreground mt-1 leading-relaxed">
            How setups, base rates, and forecast reliability are measured in this app.
          </p>
        </div>

        {/* 1 */}
        <section className="space-y-2">
          <h2 className="text-sm font-mono font-bold text-foreground">1. What the models can and cannot do</h2>
          <p className="text-[12px] font-mono text-muted-foreground leading-relaxed">
            Volatility is genuinely predictable: quiet periods tend to be followed by quiet periods,
            and violent periods by violent ones. Direction largely is not. Over horizons of weeks,
            the sign of the next move is close to a coin flip for most names, and the models here do
            not pretend otherwise — that is why every point forecast is shown with its 1σ range.
          </p>
          <p className="text-[12px] font-mono text-muted-foreground leading-relaxed">
            Reliability is also not uniform. Calm, long-listed companies are meaningfully more
            forecastable than young, volatile, narrative-driven ones. Averaging those together
            produces a number that is wrong in both directions, so every statistic in this app is
            conditioned on a volatility bucket and a listing-age bucket.
          </p>
        </section>

        {/* 2 */}
        <section className="space-y-3">
          <h2 className="text-sm font-mono font-bold text-foreground">2. Hit rate by volatility bucket</h2>
          <p className="text-[12px] font-mono text-muted-foreground leading-relaxed">
            Computed live from the curated universe. Each setup's hit rate is shown alongside the
            unconditional baseline for the <em>same</em> volatility bucket — the only fair comparison.
          </p>

          {!pipeline && !error && (
            <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {status}
            </div>
          )}
          {error && <p className="text-[11px] font-mono text-destructive">{error}</p>}

          {pipeline && (
            <div className="space-y-5">
              <p className="text-[10px] font-mono text-muted-foreground">
                {pipeline.symbolsFetched} symbols · {pipeline.cfg.horizonDays}-day forward horizon ·{" "}
                {pipeline.cfg.cooldownBars}-bar cooldown between occurrences
              </p>
              {SETUPS.map(s => (
                <div key={s.name} className="space-y-1.5">
                  <p className="text-[12px] font-mono font-semibold text-foreground">{s.name}</p>
                  <BucketTable pipeline={pipeline} setupName={s.name} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 3 */}
        <section className="space-y-2">
          <h2 className="text-sm font-mono font-bold text-foreground">3. Why we compare to a baseline</h2>
          <p className="text-[12px] font-mono text-muted-foreground leading-relaxed">
            Any setup that requires an uptrend — "price above its 200-day average", "50-day above
            200-day" — scores around 55% on purely random data with no predictive power whatsoever.
            The mechanism is path selection, not skill: stocks whose history happened to drift upward
            satisfy the uptrend condition on far more bars, so they contribute most of the
            observations, and within a path that did drift up, forward returns are positive more
            often.
          </p>
          <p className="text-[12px] font-mono text-muted-foreground leading-relaxed">
            An absolute hit rate is therefore uninterpretable on its own. The only quantity that
            carries information is the excess over the unconditional hit rate measured on the same
            population over the same period. That is why no hit rate is ever shown in this app
            without its baseline beside it.
          </p>
        </section>

        {/* 4 */}
        <section className="space-y-2">
          <h2 className="text-sm font-mono font-bold text-foreground">4. The conservative criteria</h2>
          <p className="text-[12px] font-mono text-muted-foreground leading-relaxed">
            A setup only passes the gate when all four conditions hold. The gate is tuned for a
            downside-averse user: it prefers a modest, reliable edge over a large, uncertain one.
          </p>
          <ul className="space-y-2 text-[12px] font-mono text-muted-foreground">
            <li>
              <span className="text-foreground">Excess hit rate ≥ {CONSERVATIVE_CRITERIA.minExcessHitRatePp}pp.</span>{" "}
              Control tests on pure noise produced residual excess of up to +5pp for
              uptrend-conditioned setups, so anything below that is indistinguishable from nothing.
            </li>
            <li>
              <span className="text-foreground">Confidence interval above the baseline.</span>{" "}
              The statistical version of the first condition: if the interval overlaps the baseline,
              the edge has not been demonstrated.
            </li>
            <li>
              <span className="text-foreground">Large losses in at most {pct(CONSERVATIVE_CRITERIA.maxProbLossOver10)} of cases.</span>{" "}
              A positive average is not worth much if losses worse than 10% are common.
            </li>
            <li>
              <span className="text-foreground">Worst decile no worse than {pct(CONSERVATIVE_CRITERIA.minP10)}.</span>{" "}
              The bad case must be survivable, not merely improbable.
            </li>
            <li>
              <span className="text-foreground">At least {CONSERVATIVE_CRITERIA.minN} occurrences.</span>{" "}
              Without enough observations, none of the above means anything.
            </li>
          </ul>
        </section>

        {/* 5 */}
        <section className="space-y-3">
          <h2 className="text-sm font-mono font-bold text-foreground">5. Setup definitions</h2>
          {SETUPS.map(s => (
            <div key={s.name} className="rounded-lg border border-border bg-card/40 p-3">
              <p className="text-[12px] font-mono font-semibold text-foreground">{s.name}</p>
              <p className="text-[11px] font-mono text-muted-foreground leading-relaxed mt-1">
                {s.rationale}
              </p>
            </div>
          ))}
        </section>

        {/* 6 */}
        <section className="space-y-2 border-t border-border pt-6">
          <h2 className="text-sm font-mono font-bold text-foreground">6. Known limitations</h2>
          <ul className="space-y-2 text-[12px] font-mono text-muted-foreground leading-relaxed list-disc pl-5">
            <li>
              Much of the universe has only about one year of usable price history, so long-lookback
              setups have few independent occurrences and listing-age buckets are coarse.
            </li>
            <li>
              Setups are defined in advance from economic reasoning rather than discovered by
              scanning parameter space. That is deliberate: a scanned pattern will always look
              better in-sample and rarely survives contact with new data.
            </li>
            <li>
              Base rates describe populations, not individual stocks. A symbol with a handful of its
              own occurrences tells you nothing on its own, and any single occurrence can land
              anywhere in the distribution shown.
            </li>
            <li>
              Forward windows are separated by a cooldown at least as long as the evaluation horizon,
              so occurrence counts stay honest — but they are still not fully independent.
            </li>
          </ul>
          <p className="text-[11px] font-mono text-muted-foreground leading-relaxed pt-2">
            Nothing here is investment advice. These are historical statistics about comparable
            stocks, not predictions about this one.
          </p>
        </section>
      </div>
    </div>
  );
}
