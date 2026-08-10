import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Server-validated admin check: reads the user_roles table under RLS.
 * Never trusts local storage or hardcoded emails.
 */
export function useIsAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setIsAdmin(false);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (cancelled) return;
      setIsAdmin(!!data);
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  return { isAdmin, isLoading, userId: user?.id ?? null };
}
