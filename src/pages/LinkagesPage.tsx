import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Activity, Loader2, Check, X, AlertTriangle, Lock, Sparkles, Crown } from "lucide-react";
import { runLinkages, readCachedLinkages, type LinkagePayload, type RunProgress } from "@/lib/run-linkages";
import type { LinkageResult } from "@/lib/cross-sector-linkages";
import { InfoTooltip, metricInfo } from "@/components/InfoTooltip";
import SectorLinkageGraph from "@/components/SectorLinkageGraph";
import { SECTOR_MEMBERSHIP } from "@/config/sector-membership";
import { useEntitlement } from "@/hooks/useEntitlement";
import { CustomLinkageAnalysis } from "@/components/CustomLinkageAnalysis";
import { toast } from "sonner";


type SortKey = "validated" | "pAdjusted" | "rSquaredDelta" | "leader";

export default function LinkagesPage() {
  const { can, tier, isLoading: entLoading } = useEntitlement();
  const canView = can("linkages_view");
  const canRun = can("linkages_run");

  const [payload, setPayload] = useState<LinkagePayload | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("validated");
  const [onlyValidated, setOnlyValidated] = useState(false);

  useEffect(() => { setPayload(readCachedLinkages()); }, []);

  const handleRun = async () => {
    setRunning(true);
    setProgress({ stage: "sectors", message: "Starting…" });
    try {
      const p = await runLinkages((pg) => setProgress(pg));
      setPayload(p);
      toast.success(`Ran ${p.results.length} pair tests — ${p.results.filter(r => r.validated).length} validated`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const validatedCount = payload ? payload.results.filter((r) => r.validated).length : 0;

  const rows: LinkageResult[] = (() => {
    if (!payload) return [];
    let r = [...payload.results];
    if (onlyValidated) r = r.filter((x) => x.validated);
    r.sort((a, b) => {
      if (sortKey === "validated") {
        if (a.validated !== b.validated) return a.validated ? -1 : 1;
        return a.pAdjusted - b.pAdjusted;
      }
      if (sortKey === "pAdjusted") return a.pAdjusted - b.pAdjusted;
      if (sortKey === "rSquaredDelta") return b.rSquaredDelta - a.rSquaredDelta;
      return String(a.leader).localeCompare(String(b.leader));
    });
    return r;
  })();

  if (!entLoading && !canView) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="border-b border-border px-6 py-4 flex items-center gap-4">
          <Link to="/terminal" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h1 className="text-sm font-mono font-bold tracking-widest uppercase">Cross-Sector Linkages</h1>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/5 via-background to-background p-10 text-center space-y-6 relative overflow-hidden">
            <div className="absolute top-4 right-4 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-mono uppercase tracking-widest">
              <Crown className="w-3 h-3" /> Signature Tool
            </div>
            <div className="inline-flex p-4 rounded-full bg-primary/10">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">Unlock the Cross-Sector Linkage Engine</h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                Granger-style lag regressions across a curated map of <span className="text-foreground font-mono">22 economically-motivated pairs</span> —
                BH-corrected, split-half validated, and rendered as an interactive causal graph.
                The same engine powers Hot Stocks confidence tilts and QuantAgent's macro reasoning.
              </p>
            </div>
            <ul className="text-sm text-left max-w-md mx-auto space-y-2">
              <li className="flex gap-2"><Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Interactive sector → ticker linkage graph</li>
              <li className="flex gap-2"><Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Lead-lag coefficients with p-values & ΔR²</li>
              <li className="flex gap-2"><Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Regime-flip detection across market halves</li>
              <li className="flex gap-2"><Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Feeds every predictive engine in the terminal</li>
            </ul>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-mono font-bold hover:opacity-90 transition-opacity"
            >
              <Crown className="w-4 h-4" /> Upgrade to Pro — $19/mo
            </Link>
            <p className="text-xs text-muted-foreground">
              Included in Pro (read-only) · Elite unlocks live re-runs & CSV export
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border px-6 py-4 flex items-center gap-4">
        <Link to="/terminal" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-mono font-bold tracking-widest uppercase">Cross-Sector Linkages</h1>
          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-mono uppercase tracking-widest">
            <Crown className="w-3 h-3" /> Signature
          </span>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Granger-style lag regressions across a curated map of {" "}
              <span className="text-foreground font-mono">22 directed pairs</span> {" "}
              spanning the 13 sector composites and macro proxies (OIL, GOLD, US10Y, XLY/XLP risk-appetite spread).
              Each pair is tested only if the economic channel is documented; results are BH-corrected and split-half validated.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              {canRun ? (
                <button
                  onClick={handleRun}
                  disabled={running}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-mono disabled:opacity-50 flex items-center gap-2"
                >
                  {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                  {running ? "Running…" : payload ? "Re-run tests" : "Run linkage tests"}
                </button>
              ) : (
                <Link
                  to="/pricing"
                  className="px-4 py-2 rounded-lg border border-primary/50 bg-primary/5 text-primary text-sm font-mono flex items-center gap-2 hover:bg-primary/10 transition-colors"
                  title="Live re-runs are an Elite feature"
                >
                  <Lock className="w-4 h-4" /> Upgrade to Elite to re-run
                </Link>
              )}
              {payload && (
                <span className="text-xs text-muted-foreground font-mono">
                  Last run: {new Date(payload.updatedAt).toLocaleString()}
                </span>
              )}
              {!canRun && (
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  {tier === "pro" ? "Pro: read-only view" : ""}
                </span>
              )}
            </div>
            {progress && (
              <div className="text-xs font-mono text-muted-foreground">
                {progress.stage.toUpperCase()} — {progress.message}
                {progress.total ? ` (${progress.done}/${progress.total})` : ""}
              </div>
            )}
            {progress && (
              <div className="text-xs font-mono text-muted-foreground">
                {progress.stage.toUpperCase()} — {progress.message}
                {progress.total ? ` (${progress.done}/${progress.total})` : ""}
              </div>
            )}
            {payload && payload.sectorsFailed.length > 0 && (
              <div className="text-xs text-yellow-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Failed sectors: {payload.sectorsFailed.join(", ")}
              </div>
            )}
          </div>

          {payload && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                  Linkage Graph
                  <span className="ml-2 normal-case tracking-normal text-foreground/70">
                    {validatedCount}/{payload.results.length} validated
                  </span>
                </h2>
                <label
                  className={`text-xs font-mono flex items-center gap-2 ${validatedCount === 0 ? "text-muted-foreground cursor-not-allowed" : ""}`}
                  title={validatedCount === 0 ? "No pair passed BH correction + split-half agreement in this run" : undefined}
                >
                  <input
                    type="checkbox"
                    disabled={validatedCount === 0}
                    checked={onlyValidated && validatedCount > 0}
                    onChange={(e) => setOnlyValidated(e.target.checked)}
                  />
                  Show validated linkages only
                  {validatedCount === 0 && <span className="text-[10px]">(none yet)</span>}
                </label>
              </div>
              {onlyValidated && validatedCount === 0 ? (
                <div className="rounded border border-border bg-muted/30 p-6 text-center text-xs font-mono text-muted-foreground">
                  No linkages are statistically validated in this run, so the filtered graph is empty.
                  Uncheck the filter to inspect all tested pairs and their BH p-values.
                </div>
              ) : (
                <SectorLinkageGraph
                  results={payload.results}
                  sectorMembership={SECTOR_MEMBERSHIP}
                  validatedOnly={onlyValidated}
                />
              )}
            </div>
          )}


          <CustomLinkageAnalysis />

          {payload && (
            <div className="rounded-lg border border-border bg-card overflow-hidden">

              <div className="p-3 flex items-center gap-3 border-b border-border">
                <label className="text-xs font-mono flex items-center gap-1">
                  <input type="checkbox" checked={onlyValidated}
                    onChange={(e) => setOnlyValidated(e.target.checked)} />
                  Validated only
                </label>
                <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="ml-auto bg-secondary border border-border rounded px-2 py-1 text-xs">
                  <option value="validated">Sort: validated first</option>
                  <option value="pAdjusted">Sort: BH p-value</option>
                  <option value="rSquaredDelta">Sort: incremental R²</option>
                  <option value="leader">Sort: leader</option>
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">
                        Leader → Follower
                        <InfoTooltip {...metricInfo.linkagePair} />
                      </th>
                      <th className="px-3 py-2 text-left">
                        Channel
                        <InfoTooltip {...metricInfo.linkageChannel} />
                      </th>
                      <th className="px-3 py-2 text-right">
                        Lag
                        <InfoTooltip {...metricInfo.linkageLag} />
                      </th>
                      <th className="px-3 py-2 text-right">
                        Coef
                        <InfoTooltip {...metricInfo.linkageCoefficient} />
                      </th>
                      <th className="px-3 py-2 text-right">
                        p (BH)
                        <InfoTooltip {...metricInfo.linkagePValue} />
                      </th>
                      <th className="px-3 py-2 text-right">
                        ΔR²
                        <InfoTooltip {...metricInfo.linkageRSquaredDelta} />
                      </th>
                      <th className="px-3 py-2 text-center">
                        Halves
                        <InfoTooltip {...metricInfo.linkageHalves} />
                      </th>
                      <th className="px-3 py-2 text-center">
                        Validated
                        <InfoTooltip {...metricInfo.linkageValidated} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const halvesAgree =
                        Math.sign(r.firstHalf.coefficient) === Math.sign(r.secondHalf.coefficient) &&
                        Math.sign(r.firstHalf.coefficient) === r.sign;
                      return (
                        <tr key={i} className={`border-t border-border ${r.validated ? "bg-green-500/5" : ""}`}>
                          <td className="px-3 py-2">
                            <span className="text-foreground">{r.leader}</span>
                            <span className="text-muted-foreground"> → </span>
                            <span className="text-foreground">{r.follower}</span>
                            {r.regimeSignFlip && (
                              <span className="ml-2 px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600 text-[10px]">
                                regime
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground max-w-[280px] truncate" title={r.channel}>
                            {r.channel}
                          </td>
                          <td className="px-3 py-2 text-right">{r.bestLag}d</td>
                          <td className={`px-3 py-2 text-right ${r.sign > 0 ? "text-green-500" : "text-red-500"}`}>
                            {r.coefficient >= 0 ? "+" : ""}{r.coefficient.toFixed(3)}
                          </td>
                          <td className="px-3 py-2 text-right">{r.pAdjusted.toFixed(3)}</td>
                          <td className="px-3 py-2 text-right">{r.rSquaredDelta.toFixed(4)}</td>
                          <td className="px-3 py-2 text-center">
                            {halvesAgree
                              ? <Check className="w-3 h-3 text-green-500 inline" />
                              : <X className="w-3 h-3 text-muted-foreground inline" />}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {r.validated
                              ? <Check className="w-4 h-4 text-green-500 inline" />
                              : <X className="w-4 h-4 text-muted-foreground inline" />}
                          </td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && (
                      <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                        No rows.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
