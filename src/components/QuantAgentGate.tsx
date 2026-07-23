import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, X } from "lucide-react";
import { usePlan } from "@/hooks/usePlan";
import { canAccessQuantAgent } from "@/lib/subscription-gating";

/**
 * Gates QuantAgent behind Sector Intel (standard) or Custom Intel (premium).
 * On free plan renders a locked launcher button that opens an upgrade modal
 * instead of the agent itself.
 */
export function QuantAgentGate({ children }: { children: ReactNode }) {
  const { plan, loading } = usePlan();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  if (loading) return null;
  if (canAccessQuantAgent(plan)) return <>{children}</>;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="QuantAgent — available from Sector Intel"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-secondary border border-border text-muted-foreground text-sm font-mono shadow-lg hover:text-foreground transition-colors"
      >
        <Lock className="w-4 h-4" /> QuantAgent
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 relative shadow-2xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="inline-flex p-3 rounded-full bg-primary/10 mb-4">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-bold mb-2">QuantAgent is available from Sector Intel</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Ask about any linkage, the current regime, or what events to watch this week — live macro
              and sector data included.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => navigate("/pricing")}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-mono"
              >
                See pricing
              </button>
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-lg border border-border text-sm font-mono text-muted-foreground hover:text-foreground"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
