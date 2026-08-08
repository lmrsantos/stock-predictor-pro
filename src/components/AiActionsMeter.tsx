import { Gauge, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { useAiActions } from "@/hooks/useAiActions";
import { useSubscription } from "@/hooks/useSubscription";
import { PLAN_META, nextTier } from "@/lib/plans";

const BAND_STYLES: Record<string, string> = {
  light: "text-emerald-600 dark:text-emerald-400",
  medium: "text-blue-600 dark:text-blue-400",
  heavy: "text-amber-600 dark:text-amber-400",
  over: "text-red-600 dark:text-red-400",
};

const BAR_STYLES: Record<string, string> = {
  light: "bg-emerald-500",
  medium: "bg-blue-500",
  heavy: "bg-amber-500",
  over: "bg-red-500",
};

/**
 * Shows how much AI capacity the member has left this month, in plain
 * language ("AI actions"), plus a light/medium/heavy usage read.
 */
export function AiActionsMeter({ compact = false }: { compact?: boolean }) {
  const { remaining, allowance, used, verdict, loading } = useAiActions();
  const { tier } = useSubscription();
  const meta = PLAN_META[tier];
  const up = nextTier(tier);

  if (loading) return null;

  const pct = allowance > 0 ? Math.min(100, (used / allowance) * 100) : 0;

  if (compact) {
    return (
      <Link
        to="/account"
        title={`${remaining} AI actions left this month`}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-border text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
      >
        <Gauge className="w-3 h-3" />
        {remaining} left
      </Link>
    );
  }

  return (
    <div className="rounded-2xl border border-border p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="text-xs uppercase text-muted-foreground font-mono">AI actions this month</div>
          <div className="text-2xl font-bold mt-1">
            {remaining} <span className="text-sm font-normal text-muted-foreground">of {allowance} left</span>
          </div>
        </div>
        <span className={`text-xs font-mono uppercase tracking-widest ${BAND_STYLES[verdict.band]}`}>
          {verdict.label}
        </span>
      </div>

      <div className="h-2 rounded-full bg-muted overflow-hidden mb-3">
        <div className={`h-full ${BAR_STYLES[verdict.band]}`} style={{ width: `${pct}%` }} />
      </div>

      <p className="text-xs text-muted-foreground mb-3">{verdict.hint}</p>

      <div className="text-xs text-muted-foreground space-y-1">
        <div>1 QuantAgent question = 1 action · Portfolio review = 3 · IPO report = 5</div>
        <div>{meta.name} includes {allowance} actions/month — {meta.allowanceExample}</div>
      </div>

      {up && (verdict.band === "heavy" || verdict.band === "over") && (
        <Link
          to="/pricing"
          className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-mono"
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Move to {PLAN_META[up].name} — {PLAN_META[up].actions} actions/month
        </Link>
      )}
    </div>
  );
}
