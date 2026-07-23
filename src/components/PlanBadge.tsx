import { Link } from "react-router-dom";
import { Crown } from "lucide-react";
import { usePlan } from "@/hooks/usePlan";
import { planLabel } from "@/lib/subscription-gating";

/**
 * Small pill next to the user's identity in the top nav showing their plan.
 * Clicking navigates to /pricing.
 */
export function PlanBadge({ className = "" }: { className?: string }) {
  const { plan, loading } = usePlan();
  if (loading) return null;

  const styles =
    plan === "premium"
      ? "bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30"
      : plan === "standard"
      ? "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30"
      : "bg-muted text-muted-foreground border-border";

  return (
    <Link
      to="/pricing"
      title="Manage subscription"
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-mono uppercase tracking-widest ${styles} ${className}`}
    >
      {plan !== "free" && <Crown className="w-3 h-3" />}
      {planLabel(plan)}
    </Link>
  );
}
