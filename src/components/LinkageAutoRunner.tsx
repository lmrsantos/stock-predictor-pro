import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { runLinkages, readCachedLinkages } from "@/lib/run-linkages";

// Routes that never consume the linkage cache — don't spend work there.
const SKIP_PATHS = ["/moment"];

/**
 * Silently refreshes the cross-sector linkage cache on app startup
 * if it's missing or older than 24h. Runs once per browser session.
 * No UI — Hot Stocks and QuantAgent consume the cache automatically.
 */
export function LinkageAutoRunner() {
  const started = useRef(false);
  const { pathname } = useLocation();

  useEffect(() => {
    if (SKIP_PATHS.some((p) => pathname.startsWith(p))) return;
    if (started.current) return;
    started.current = true;

    const cached = readCachedLinkages();
    if (cached) return; // fresh (<24h) — nothing to do

    // Defer so it never blocks first paint / interactivity
    const t = setTimeout(() => {
      runLinkages().catch((e) => {
        console.warn("[LinkageAutoRunner] background run failed:", e);
      });
    }, 4000);

    return () => clearTimeout(t);
  }, []);

  return null;
}
