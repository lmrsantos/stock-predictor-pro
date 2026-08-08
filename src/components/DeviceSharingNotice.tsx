import { Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { useSubscription } from "@/hooks/useSubscription";
import { PLAN_META, nextTier } from "@/lib/plans";

/**
 * Fair-use notice shown when one login is being used from more devices or
 * networks than the plan allows — the usual signature of a shared account.
 */
export function DeviceSharingNotice() {
  const { status } = useSessionGuard();
  const { tier } = useSubscription();

  if (!status || !status.suspected_sharing) return null;

  const up = nextTier(tier);

  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
      <div className="p-2 rounded-full bg-amber-500/20 shrink-0">
        <Users className="w-4 h-4 text-amber-600 dark:text-amber-400" />
      </div>
      <div className="text-sm">
        <div className="font-bold mb-1">This login is being used on several devices</div>
        <p className="text-muted-foreground">
          We've seen {status.devices_24h} devices and {status.networks_24h} networks on this account in
          the last 24 hours. {PLAN_META[tier].name} covers {status.device_allowance} devices for one
          person. Shared logins burn through the monthly AI actions very fast and may be limited.
        </p>
        {up && (
          <Link to="/pricing" className="inline-block mt-2 text-xs font-mono underline">
            {PLAN_META[up].name} covers {PLAN_META[up].devices} devices →
          </Link>
        )}
      </div>
    </div>
  );
}
