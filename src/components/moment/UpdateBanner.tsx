// components/moment/UpdateBanner.tsx
// Tells the user when a newer build of Quant Moment is live.
// It compares the script filename this page is running against the one the
// live index.html points to. Different name means a new build was published.

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

function currentBundle(): string | null {
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"));
  const match = scripts.map((s) => s.getAttribute("src") ?? "").find((src) => /\/assets\/.+\.js/.test(src));
  return match ?? null;
}

async function liveBundle(): Promise<string | null> {
  const res = await fetch(`/index.html?cb=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/src="([^"]*\/assets\/[^"]+\.js)"/);
  return m?.[1] ?? null;
}

export function UpdateBanner() {
  const [available, setAvailable] = useState(false);

  const check = useCallback(async () => {
    try {
      const mine = currentBundle();
      if (!mine) return; // dev server: no hashed bundle to compare
      const live = await liveBundle();
      if (live && live !== mine) setAvailable(true);
    } catch {
      // A failed check is silent; never interrupt the screen over it.
    }
  }, []);

  useEffect(() => {
    check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [check]);

  if (!available) return null;

  return (
    <div className="mb-3 flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2">
      <p className="flex-1 text-sm text-foreground">A new version of Quant Moment is available.</p>
      <button
        onClick={() => window.location.reload()}
        className="flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
      >
        <RefreshCw className="h-4 w-4" /> Reload
      </button>
    </div>
  );
}
