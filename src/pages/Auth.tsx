import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";

type AuthMode = "signin" | "signup" | "forgotPassword";

const Auth = () => {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { session } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get("next") ?? searchParams.get("redirect") ?? "";
  // Only allow same-origin relative paths.
  const nextPath = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/terminal";
  const postAuthRedirect = window.location.origin + nextPath;
  const emailConfirmationRedirect = window.location.origin;

  useEffect(() => {
    if (session) navigate(nextPath, { replace: true });
  }, [session, navigate, nextPath]);

  const resetMessages = () => {
    setError("");
    setMessage("");
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    resetMessages();
    setPassword("");
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate(nextPath, { replace: true });
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: emailConfirmationRedirect },
        });
        if (error) throw error;
        setMessage("Check your email to verify your account before signing in.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setMessage("If this email is registered, you will receive a reset link shortly.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: postAuthRedirect,
    });
    if (error) setError(error.message || "Google sign-in failed");
  };

  const title = mode === "signin" ? "Welcome back" : mode === "signup" ? "Create account" : "Reset password";
  const subtitle = mode === "signin"
    ? "Sign in to access Market Insights"
    : mode === "signup"
    ? "Sign up to get started"
    : "Enter your email and we'll send you a reset link";
  const submitLabel = mode === "signin" ? "Sign in" : mode === "signup" ? "Sign up" : "Send reset link";

  const showPassword = mode === "signin" || mode === "signup";
  const showGoogle = mode === "signin" || mode === "signup";
  const showDivider = mode === "signin" || mode === "signup";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-xs font-mono font-bold tracking-widest text-muted-foreground uppercase">
              QuantForecast
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>

        {/* Google */}
        {showGoogle && (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={handleGoogleSignIn}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </Button>
        )}

        {showDivider && (
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>
        )}

        {/* Email form */}
        <form onSubmit={handleEmailAuth} className="space-y-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {showPassword && (
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          )}
          {mode === "signin" && (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => switchMode("forgotPassword")}
                className="text-xs text-primary hover:underline"
              >
                Forgot password?
              </button>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-accent-foreground">{message}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "..." : submitLabel}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {mode === "signin" && (
            <>
              Don't have an account?{" "}
              <button onClick={() => switchMode("signup")} className="text-primary hover:underline">
                Sign up
              </button>
            </>
          )}
          {mode === "signup" && (
            <>
              Already have an account?{" "}
              <button onClick={() => switchMode("signin")} className="text-primary hover:underline">
                Sign in
              </button>
            </>
          )}
          {mode === "forgotPassword" && (
            <>
              Remember your password?{" "}
              <button onClick={() => switchMode("signin")} className="text-primary hover:underline">
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
};

export default Auth;
