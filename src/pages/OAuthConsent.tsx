import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

// Beta namespace — Supabase JS may not surface types yet.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};
const oauth = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      if (!oauth?.getAuthorizationDetails) {
        setError("OAuth server not available in this Supabase client version.");
        return;
      }
      const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message ?? "Could not load authorization request.");
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message ?? "Authorization failed.");
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-4 text-center">
          <h1 className="text-xl font-semibold">Authorization error</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </main>
    );
  }

  if (!details) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading authorization…</p>
      </main>
    );
  }

  const clientName = details.client?.name ?? details.client?.client_name ?? "an app";
  const redirectUri = details.client?.redirect_uris?.[0] ?? details.redirect_uri ?? "";
  const scopes: string[] = Array.isArray(details.scopes)
    ? details.scopes
    : typeof details.scope === "string"
    ? details.scope.split(" ").filter(Boolean)
    : [];

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full space-y-6 border border-border rounded-lg p-6 bg-card">
        <div className="space-y-2 text-center">
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            QuantForecast
          </div>
          <h1 className="text-xl font-semibold">Connect {clientName} to your account</h1>
          <p className="text-sm text-muted-foreground">
            {clientName} will be able to call QuantForecast tools while you are signed in.
          </p>
        </div>

        <div className="space-y-2 text-sm">
          {redirectUri && (
            <div>
              <div className="text-xs uppercase text-muted-foreground">Redirect</div>
              <div className="font-mono break-all">{redirectUri}</div>
            </div>
          )}
          {scopes.length > 0 && (
            <div>
              <div className="text-xs uppercase text-muted-foreground">Requested access</div>
              <ul className="list-disc list-inside">
                {scopes.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted-foreground pt-2">
            This does not bypass QuantForecast's permissions or backend policies. Tools remain
            educational and do not constitute investment advice.
          </p>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
            Cancel
          </Button>
          <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
            {busy ? "..." : "Approve"}
          </Button>
        </div>
      </div>
    </main>
  );
}
