import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { useEffect, useState } from "react";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { AiActionsMeter } from "@/components/AiActionsMeter";
import { DeviceSharingNotice } from "@/components/DeviceSharingNotice";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { PLAN_META } from "@/lib/plans";


export default function Account() {
  const { user, signOut, isLoading: authLoading } = useAuth();
  const sub = useSubscription();
  const navigate = useNavigate();
  const [portalLoading, setPortalLoading] = useState(false);
  const { status: sharing } = useSessionGuard();
  const meta = PLAN_META[sub.tier];

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?redirect=/account");
  }, [authLoading, user, navigate]);


  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-portal-session", {
        body: { returnUrl: `${window.location.origin}/account`, environment: getStripeEnvironment() },
      });
      if (error || !data?.url) throw new Error(error?.message || "Could not open billing portal");
      window.open(data.url, "_blank");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setPortalLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PaymentTestModeBanner />
      <div className="max-w-3xl mx-auto p-6 lg:p-10">
        <Link to="/terminal" className="text-sm text-muted-foreground flex items-center gap-1 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to terminal
        </Link>
        <h1 className="text-3xl font-bold mb-1">Account</h1>
        <p className="text-muted-foreground text-sm mb-8">{user.email}</p>

        <div className="rounded-2xl border border-border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs uppercase text-muted-foreground font-mono">Current plan</div>
              <div className="text-2xl font-bold mt-1">{meta.name}</div>
              <div className="text-xs text-muted-foreground mt-1">{meta.profileLabel} · {meta.allowanceExample}</div>
              {sub.status && <div className="text-xs text-muted-foreground mt-1">Status: {sub.status}{sub.cancelAtPeriodEnd ? " (cancels at period end)" : ""}</div>}
            </div>
            <Link to="/pricing" className="text-sm underline">Change plan</Link>
          </div>
          {sub.currentPeriodEnd && (
            <div className="text-xs text-muted-foreground">
              Renews / ends: {new Date(sub.currentPeriodEnd).toLocaleDateString()}
            </div>
          )}
          {sub.tier !== "free" && (
            <button
              onClick={openPortal}
              disabled={portalLoading}
              className="mt-4 px-4 py-2 rounded-lg border border-border text-sm font-mono flex items-center gap-2 disabled:opacity-50"
            >
              Manage billing <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="mb-6">
          <AiActionsMeter />
        </div>

        <div className="mb-6">
          <DeviceSharingNotice />
        </div>

        <div className="rounded-2xl border border-border p-6 mb-6">
          <div className="text-xs uppercase text-muted-foreground font-mono mb-2">Devices on this account</div>
          <div className="text-2xl font-bold">
            {sharing?.devices_24h ?? "—"}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              of {meta.devices} allowed (last 24h)
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {meta.name} is a personal plan for one person on up to {meta.devices} devices. Sharing a
            login uses up your monthly AI actions much faster and may be limited.
          </p>
        </div>


        <button onClick={() => { signOut(); navigate("/terminal"); }} className="text-sm text-muted-foreground underline">
          Sign out
        </button>
      </div>
    </div>
  );
}
