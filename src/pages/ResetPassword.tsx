import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [validLink, setValidLink] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase sends recovery as a hash fragment: #type=recovery&access_token=...
    const hash = window.location.hash;
    if (hash.includes("type=recovery") && hash.includes("access_token")) {
      setValidLink(true);
    } else {
      setError("This reset link is invalid or has expired. Please request a new one.");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage("Password updated successfully. Signing you in...");
      setTimeout(() => navigate("/auth", { replace: true }), 1500);
    } catch (err: any) {
      setError(err.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-xs font-mono font-bold tracking-widest text-muted-foreground uppercase">
              QuantForecast
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Reset password</h1>
          <p className="text-sm text-muted-foreground">
            {validLink ? "Enter your new password below." : "Secure password reset link"}
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {validLink && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                type="password"
                placeholder="Re-enter password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
              />
            </div>
            {message && (
              <p className="text-sm text-accent-foreground">{message}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "..." : "Update password"}
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <button
            onClick={() => navigate("/auth")}
            className="text-primary hover:underline"
          >
            Back to sign in
          </button>
        </p>
      </div>
    </div>
  );
};

export default ResetPassword;
