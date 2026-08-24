import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Passwordless sign-in for an external reviewer.
 * Visit /reviewer-access?key=<REVIEWER_ACCESS_KEY> — no password is ever shown or typed.
 */
const ReviewerAccess = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Signing you in…");

  useEffect(() => {
    const key = params.get("key") ?? "";
    const next = params.get("next") ?? "/terminal";

    if (!key) {
      setError("Missing access key.");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("reviewer-login", {
          body: { key },
        });
        if (cancelled) return;
        if (fnError || !data?.token_hash) throw new Error("Access key rejected.");

        setStatus("Establishing session…");
        const { error: otpError } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash: data.token_hash,
        });
        if (otpError) throw otpError;

        const target = next.startsWith("/") && !next.startsWith("//") ? next : "/terminal";
        navigate(target, { replace: true });
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Reviewer sign-in failed.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-mono font-bold tracking-widest text-muted-foreground uppercase">
            QuantForecast
          </span>
        </div>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{status}</p>
        )}
      </div>
    </div>
  );
};

export default ReviewerAccess;
