// components/moment/MomentWatchList.tsx
// "Worth a look today" — ranked straight from stored daily closes so the first
// screen paints in under a second. Real numbers only; when the data is thin,
// the list is short.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight } from "lucide-react";
import { useMomentQuotes } from "@/hooks/useMomentQuotes";

export interface WatchListRow {
  symbol: string;
  sector: string | null;
  dayChangePct: number;
  reason: string;
}

// Module-level cache: the list is the same for every mount in a session, so
// rendering this component twice must never trigger a second fetch.
let cache: { rows: WatchListRow[]; error: string | null } | null = null;
let pending: Promise<{ rows: WatchListRow[]; error: string | null }> | null = null;

export function MomentWatchList({ onSelect }: { onSelect: (symbol: string) => void }) {
  const [rows, setRows] = useState<WatchListRow[] | null>(cache?.rows ?? null);
  const [error, setError] = useState<string | null>(cache?.error ?? null);
  const { quotes } = useMomentQuotes((rows ?? []).map((r) => r.symbol));

  useEffect(() => {
    if (cache) return;
    if (!pending) {
      pending = (async () => {
        try {
          const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          const [priceRes, metaRes] = await Promise.all([
            supabase
              .from("stock_prices")
              .select("ticker, date, close")
              .gte("date", since)
              .order("ticker", { ascending: true })
              .order("date", { ascending: true })
              .range(0, 24999),
            supabase.from("stock_fundamentals").select("ticker, sector").range(0, 999),
          ]);

          if (priceRes.error) throw priceRes.error;

          const sectorByTicker = new Map<string, string | null>(
            (metaRes.data ?? []).map((m) => [m.ticker, m.sector]),
          );

          const byTicker = new Map<string, number[]>();
          for (const r of priceRes.data ?? []) {
            const close = Number(r.close);
            if (!Number.isFinite(close) || close <= 0) continue;
            const list = byTicker.get(r.ticker);
            if (list) list.push(close);
            else byTicker.set(r.ticker, [close]);
          }

          const scored = [...byTicker.entries()]
            .map(([symbol, closes]) => {
              if (closes.length < 21) return null;
              const last = closes[closes.length - 1];
              const prev = closes[closes.length - 2];
              const base = closes[closes.length - 21];
              const ret20 = ((last - base) / base) * 100;
              const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
              const sector = sectorByTicker.get(symbol) ?? null;
              return {
                symbol,
                sector,
                dayChangePct: ((last - prev) / prev) * 100,
                score: Math.abs(ret20),
                reason: `${ret20 >= 0 ? "Up" : "Down"} ${Math.abs(ret20).toFixed(1)}% over 20 days, ${
                  last >= ma20 ? "above" : "below"
                } its 20-day average${sector ? ` · ${sector}` : ""}`,
              };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null)
            .sort((a, b) => b.score - a.score);

          const seenSector = new Set<string>();
          const picked: WatchListRow[] = [];
          for (const r of scored) {
            if (picked.length >= 8) break;
            if (!r.sector) continue;
            if (seenSector.has(r.sector)) continue;
            seenSector.add(r.sector);
            picked.push({
              symbol: r.symbol,
              sector: r.sector,
              dayChangePct: r.dayChangePct,
              reason: r.reason,
            });
          }
          return { rows: picked, error: null as string | null };
        } catch (e) {
          return { rows: [] as WatchListRow[], error: (e as Error).message };
        }
      })();
    }
    let cancelled = false;
    pending.then((result) => {
      cache = result;
      if (!cancelled) {
        setRows(result.rows);
        setError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="px-3 pt-3">
        <h2 className="text-sm font-semibold text-foreground">Worth a look today</h2>
        <p className="text-[11px] text-muted-foreground">
          The biggest 20-day moves in our tracked universe, one per sector. Movement is not a reason
          to act.
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
          This list didn't load. Search a ticker above instead.
        </p>
      )}

      {rows && rows.length === 0 && (
        <p className="px-3 py-3 text-sm text-muted-foreground">
          Not enough recent price history on file to rank anything today.
        </p>
      )}

      {rows && rows.length > 0 && (
        <ul className="mt-2 divide-y divide-border">
          {rows.map((r) => {
            // Live quote wins over the stored close whenever it is available.
            const live = quotes[r.symbol];
            const changePct = live?.changePct ?? r.dayChangePct;
            return (
              <li key={r.symbol}>
                <button
                  onClick={() => onSelect(r.symbol)}
                  className="flex min-h-[44px] w-full items-center gap-3 px-3 py-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{r.symbol}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{r.reason}</p>
                  </div>
                  <span className="shrink-0 text-right">
                    {live && (
                      <span className="block text-sm font-semibold tabular-nums text-foreground">
                        ${live.price.toFixed(2)}
                      </span>
                    )}
                    <span
                      className={`block text-sm font-semibold tabular-nums ${
                        changePct >= 0 ? "text-accent-success" : "text-accent-danger"
                      }`}
                    >
                      {changePct >= 0 ? "+" : ""}
                      {changePct.toFixed(2)}%
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
