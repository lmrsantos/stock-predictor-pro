import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getDeviceId } from "@/lib/device-id";

export interface SharingStatus {
  tier: string;
  device_allowance: number;
  devices_24h: number;
  devices_7d: number;
  networks_24h: number;
  over_limit: boolean;
  suspected_sharing: boolean;
}

/**
 * Registers this browser against the signed-in account once per session and
 * returns the account-sharing read (how many distinct devices / networks used
 * the same login recently).
 */
export function useSessionGuard(): { status: SharingStatus | null } {
  const { user } = useAuth();
  const [status, setStatus] = useState<SharingStatus | null>(null);

  useEffect(() => {
    if (!user) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("session-heartbeat", {
          body: { deviceId: getDeviceId() },
        });
        if (!cancelled && !error && data && !data.error) setStatus(data as SharingStatus);
      } catch {
        // Non-critical — never block the app on device tracking.
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return { status };
}
