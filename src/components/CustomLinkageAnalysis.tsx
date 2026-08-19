import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Lock, Loader2, Check, X, Sparkles } from "lucide-react";
import { usePlan } from "@/hooks/usePlan";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { getGateProps } from "@/lib/subscription-gating";
import { readCachedLinkages } from "@/lib/run-linkages";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { SECTOR_NAMES, MACRO_SERIES_NAMES, LeaderName, SectorName } from "@/lib/cross-sector-linkages";

/**
 * Minimal entry point for custom linkage analyses.
 * - Free: locked, upgrade CTA
 * - Standard (Sector Intel): needs one-time purchase (Stripe TODO)
 * - Premium (Custom Intel): 3/month
 *
 * For this MVP the "engine" reuses cached results from the standard 22-pair run.
 * A future step will add full arbitrary-pair pipeline (buildSectorComposites → runLinkageTests).
 */
// TODO: replace with Stripe checkout — one-time $29 purchase for custom analyses
function handleOneTimePurchase() {
  console.log("[TODO stripe] one-time custom analysis purchase — $29");
  toast.info("One-time purchases will be wired to Stripe soon.");
}

export function CustomLinkageAnalysis() {
  const { user } = useAuth();
  const { subscription, refetch } = usePlan();
  const { isAdmin } = useIsAdmin();
  const rawGate = getGateProps("custom_analysis", subscription);
  const gate = isAdmin ? { ...rawGate, locked: false } : rawGate;

  const [leader, setLeader] = useState("");
  const [follower, setFollower] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<null | {
    leader: string; follower: string; bestLag: number; coefficient: number;
    pAdjusted: number; rSquaredDelta: number; validated: boolean; channel: string;
  }>(null);

  const runAnalysis = async () => {
    if (!user) { toast.error("Please sign in first"); return; }
    if (!leader.trim() || !follower.trim()) { toast.error("Enter both a leader and a follower"); return; }
    setRunning(true);
    setResult(null);
    try {
      const cached = readCachedLinkages();
      const match = cached?.results.find(
        (r) => String(r.leader).toLowerCase() === leader.trim().toLowerCase()
            && String(r.follower).toLowerCase() === follower.trim().toLowerCase()
      );
      if (!match) {
        toast.error("This pair isn't in the standard map yet. Full arbitrary-pair engine coming soon.");
        return;
      }
      const row = {
        user_id: user.id,
        leader: String(match.leader),
        follower: String(match.follower),
        lag_days: match.bestLag,
        coefficient: match.coefficient,
        p_value: match.pValue,
        p_adjusted: match.pAdjusted,
        r_squared_delta: match.rSquaredDelta,
        validated: match.validated,
        channel: match.channel,
        is_private: true,
        purchase_type: subscription.plan === "premium" ? "subscription" : "one_time",
      };
      const { error } = await supabase.from("custom_linkage_analyses").insert(row);
      if (error) throw error;
      setResult({
        leader: row.leader, follower: row.follower,
        bestLag: match.bestLag, coefficient: match.coefficient,
        pAdjusted: match.pAdjusted, rSquaredDelta: match.rSquaredDelta,
        validated: match.validated, channel: match.channel,
      });
      await refetch();
      toast.success("Custom analysis saved.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Custom Linkage Analysis
        </h2>
        {isAdmin ? (
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            admin — unlimited
          </span>
        ) : subscription.plan === "premium" && (
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            {subscription.customAnalysesUsedThisMonth}/3 used this month
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Choose a leader → follower pair from the standard map. Results are saved privately to your account.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Leader</label>
          <select
            value={leader}
            onChange={(e) => setLeader(e.target.value)}
            className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm font-mono input-focus"
          >
            <option value="" disabled>Choose leader…</option>
            <optgroup label="Macro">
              {MACRO_SERIES_NAMES.map((m) => <option key={m} value={m}>{m}</option>)}
            </optgroup>
            <optgroup label="Sectors">
              {SECTOR_NAMES.map((s) => <option key={s} value={s}>{s}</option>)}
            </optgroup>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Follower</label>
          <select
            value={follower}
            onChange={(e) => setFollower(e.target.value)}
            className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm font-mono input-focus"
          >
            <option value="" disabled>Choose follower…</option>
            {SECTOR_NAMES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {gate.locked ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled
            title={gate.upgradeMessage}
            className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-mono flex items-center gap-2 cursor-not-allowed"
          >
            <Lock className="w-4 h-4" /> Run analysis
          </button>
          <span className="text-xs text-muted-foreground">{gate.upgradeMessage}</span>
          {subscription.plan === "free" && (
            <Link to="/pricing" className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-mono">
              See pricing
            </Link>
          )}
          {subscription.plan === "standard" && (
            <button
              onClick={handleOneTimePurchase}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-mono"
            >
              Buy for $29
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={runAnalysis}
          disabled={running}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-mono disabled:opacity-50 flex items-center gap-2"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {running ? "Running…" : "Run analysis"}
        </button>
      )}

      {result && (
        <div className="mt-3 rounded border border-border bg-background p-3 text-xs font-mono space-y-1">
          <div className="text-sm">
            <span className="text-foreground">{result.leader}</span>
            <span className="text-muted-foreground"> → </span>
            <span className="text-foreground">{result.follower}</span>
            {result.validated ? (
              <span className="ml-2 inline-flex items-center gap-1 text-green-500"><Check className="w-3 h-3" /> validated</span>
            ) : (
              <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground"><X className="w-3 h-3" /> not validated</span>
            )}
          </div>
          <div className="text-muted-foreground">Channel: <span className="text-foreground">{result.channel}</span></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
            <div><div className="text-muted-foreground">Lag</div><div>{result.bestLag}d</div></div>
            <div>
              <div className="text-muted-foreground">Coef</div>
              <div className={result.coefficient >= 0 ? "text-green-500" : "text-red-500"}>
                {result.coefficient >= 0 ? "+" : ""}{result.coefficient.toFixed(3)}
              </div>
            </div>
            <div><div className="text-muted-foreground">p (BH)</div><div>{result.pAdjusted.toFixed(3)}</div></div>
            <div><div className="text-muted-foreground">ΔR²</div><div>{result.rSquaredDelta.toFixed(4)}</div></div>
          </div>
        </div>
      )}
    </div>
  );
}
