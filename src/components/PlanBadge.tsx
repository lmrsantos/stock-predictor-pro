import { Link } from "react-router-dom";
import { Crown } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { PLAN_META } from "@/lib/plans";
import type { Tier } from "@/lib/stripe";

const STYLES: Record<Tier, string> = {
  free: "bg-muted text-muted-foreground border-border",
  pro: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  plus: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
  elite: "bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30",
};

/**
 * Small pill next to the user's identity in the top nav showing their plan.
 * Clicking navigates to /pricing.
 */
export function PlanBadge({ className = "" }: { className?: string }) {
  const { tier, isLoading } = useSubscription();
  if (isLoading) return null;

  return (
    <Link
      to="/pricing"
      title="Manage subscription"
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-mono uppercase tracking-widest ${STYLES[tier]} ${className}`}
    >
      {tier !== "free" && <Crown className="w-3 h-3" />}
      {PLAN_META[tier].name}
    </Link>
  );
}
