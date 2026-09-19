// pages/MomentAuth.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Quant Moment's own sign-in screen. Self-contained: every redirect (password,
// email confirmation, Google) comes back to /moment, never to the terminal.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";

type Mode = "signup" | "signin" | "forgot";

const MOMENT_PATH = "/moment";

export default function MomentAuth() {
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { session } = useAuth();
  const navigate = useNavigate();

  const momentUrl = window.location.origin + MOMENT_PATH;

  useEffect(() => {
    document.title = "Quant Moment — account";
  }, []);

  useEffect(() => {
    if (session) navigate(MOMENT_PATH, { replace: true });
  }, [session, navigate]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setMessage("");
    setPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate(MOMENT_PATH, { replace: true });
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: momentUrl },
        });
        if (error) throw error;
        setMessage("Check your email to confirm your account, then come back here.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password?next=${MOMENT_PATH}`,
        });
        if (error) throw error;
        setMessage("If this email is registered, a reset link is on its way.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: momentUrl,
    });
    if (error) setError(error.message || "Google sign-in failed");
  };

  const title = mode === "signup" ? "Create your free account" : mode === "signin" ? "Welcome back" : "Reset password";
  const subtitle =
    mode === "signup"
      ? "Free while we're building. Keeps your lookups open."
      : mode === "signin"
      ? "Sign in to keep checking your read."
      : "We'll email you a link to set a new password.";
  const submitLabel = mode === "signup" ? "Create account" : mode === "signin" ? "Sign in" : "Send reset link";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center overflow-x-hidden px-4 py-10">
      <div className="space-y-6">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Quant Moment</p>
          <h1 className="mt-2 text-2xl font-bold text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </header>

        {mode !== "forgot" && (
          <>
            <Button variant="outline" className="min-h-[44px] w-full gap-2" onClick={handleGoogle}>
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="min-h-[44px]"
          />
          {mode !== "forgot" && (
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="min-h-[44px]"
            />
          )}
          {mode === "signin" && (
            <div className="flex justify-end">
              <button type="button" onClick={() => switchMode("forgot")} className="text-xs text-primary">
                Forgot password?
              </button>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-foreground">{message}</p>}
          <Button type="submit" className="min-h-[44px] w-full" disabled={loading}>
            {loading ? "..." : submitLabel}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {mode === "signup" && (
            <>
              Already have an account?{" "}
              <button onClick={() => switchMode("signin")} className="text-primary">Sign in</button>
            </>
          )}
          {mode === "signin" && (
            <>
              New here?{" "}
              <button onClick={() => switchMode("signup")} className="text-primary">Create an account</button>
            </>
          )}
          {mode === "forgot" && (
            <>
              Remember it?{" "}
              <button onClick={() => switchMode("signin")} className="text-primary">Sign in</button>
            </>
          )}
        </p>

        <button
          onClick={() => navigate(MOMENT_PATH)}
          className="mx-auto block text-xs text-muted-foreground underline"
        >
          Back to Quant Moment
        </button>
      </div>
    </main>
  );
}
