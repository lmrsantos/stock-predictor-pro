// components/moment/MomentWatchList.tsx
// "Worth a look today" — ranked from the hot-stocks screen. Real numbers only;
// when the screen comes back short, the list is short.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight } from "lucide-react";

interface Row {
  symbol: string;
  sector: string;
  dayChangePct: number;
  reason: string;
}

interface SymbolData {
  symbol: string;
  sector: string;
  series: { date: string; close: number }[];
  sectorBias: number;
}

export function MomentWatchList({ onSelect }: { onSelect: (symbol: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error: err } = await supabase.functions.invoke("hot-stocks", {
          body: { riskProfile: "moderate" },
        });
        if (err) throw err;
        if (data?.error) throw new Error(data.error);

        const symbolData: SymbolData[] = data?.symbolData ?? [];
        const scored = symbolData
          .map((s) => {
            const closes = s.series.map((p) => p.close).filter((c) => Number.isFinite(c) && c > 0);
            if (closes.length < 40) return null;
            const last = closes[closes.length - 1];
            const prev = closes[closes.length - 2];
            const ret20 = ((last - closes[closes.length - 21]) / closes[closes.length - 21]) * 100;
            const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
            return {
              symbol: s.symbol,
              sector: s.sector,
              dayChangePct: prev > 0 ? ((last - prev) / prev) * 100 : 0,
              score: ret20 * (s.sectorBias ?? 1),
              reason: `${ret20 >= 0 ? "Up" : "Down"} ${Math.abs(ret20).toFixed(1)}% over 20 days, ${
                last >= ma20 ? "above" : "below"
              } its 20-day average · ${s.sector}`,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null)
          .sort((a, b) => b.score - a.score);

        const seenSector = new Set<string>();
        const picked: Row[] = [];
        for (const r of scored) {
          if (picked.length >= 8) break;
          if (seenSector.has(r.sector)) continue;
          seenSector.add(r.sector);
          picked.push({ symbol: r.symbol, sector: r.sector, dayChangePct: r.dayChangePct, reason: r.reason });
        }
        if (!cancelled) setRows(picked);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="px-3 pt-3">
        <h2 className="text-sm font-semibold text-foreground">Worth a look today</h2>
        <p className="text-[11px] text-muted-foreground">
          Screened from our tracked universe. Some days this list is short — that's the point.
        </p>
      </div>

      {!rows && !error && (
        <ul className="mt-2 divide-y divide-border">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="px-3 py-3">
              <div className="h-9 animate-pulse rounded bg-muted" />
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="px-3 py-3 text-sm text-muted-foreground">
          The screen didn't run this time. Search a ticker above instead.
        </p>
      )}

      {rows && rows.length === 0 && (
        <p className="px-3 py-3 text-sm text-muted-foreground">
          Nothing cleared the screen today.
        </p>
      )}

      {rows && rows.length > 0 && (
        <ul className="mt-2 divide-y divide-border">
          {rows.map((r) => (
            <li key={r.symbol}>
              <button
                onClick={() => onSelect(r.symbol)}
                className="flex min-h-[44px] w-full items-center gap-3 px-3 py-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{r.symbol}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{r.reason}</p>
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    r.dayChangePct >= 0 ? "text-primary" : "text-destructive"
                  }`}
                >
                  {r.dayChangePct >= 0 ? "+" : ""}
                  {r.dayChangePct.toFixed(2)}%
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
