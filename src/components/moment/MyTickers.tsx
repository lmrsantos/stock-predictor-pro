// components/moment/MyTickers.tsx
// "My tickers" — the list the user chose to follow, kept on their device.
// Prices come from stored daily closes; when a ticker has no history on file
// it still lists, plainly marked, instead of showing a made-up number.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, Star, X } from "lucide-react";
import { useMyTickers } from "@/hooks/useMyTickers";

interface Quote {
  close: number;
  changePct: number | null;
}

export function MyTickers({ onSelect }: { onSelect: (symbol: string) => void }) {
  const { list, remove } = useMyTickers();
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  useEffect(() => {
    if (list.length === 0) return;
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("stock_prices")
        .select("ticker, date, close")
        .in("ticker", list)
        .gte("date", since)
        .order("date", { ascending: true });
      if (cancelled || error || !data) return;

      const byTicker = new Map<string, number[]>();
      for (const row of data) {
        const close = Number(row.close);
        if (!Number.isFinite(close) || close <= 0) continue;
        const arr = byTicker.get(row.ticker);
        if (arr) arr.push(close);
        else byTicker.set(row.ticker, [close]);
      }

      const next: Record<string, Quote> = {};
      byTicker.forEach((closes, ticker) => {
        const last = closes[closes.length - 1];
        const prev = closes.length > 1 ? closes[closes.length - 2] : null;
        next[ticker] = {
          close: last,
          changePct: prev ? ((last - prev) / prev) * 100 : null,
        };
      });
      setQuotes(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [list]);

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="px-3 pt-3">
        <h2 className="text-sm font-semibold text-foreground">My tickers</h2>
        <p className="text-[11px] text-muted-foreground">
          {list.length === 0
            ? "Open a ticker and tap the star to follow it here."
            : "Kept on this device. Tap one to check the read."}
        </p>
      </div>

      {list.length === 0 && (
        <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
          <Star className="h-4 w-4 shrink-0" /> Nothing followed yet.
        </p>
      )}

      {list.length > 0 && (
        <ul className="mt-2 divide-y divide-border">
          {list.map((symbol) => {
            const q = quotes[symbol];
            return (
              <li key={symbol} className="flex items-center">
                <button
                  onClick={() => onSelect(symbol)}
                  className="flex min-h-[44px] flex-1 items-center gap-3 px-3 py-3 text-left"
                >
                  <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                    {symbol}
                  </span>
                  {q ? (
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums text-foreground">
                        ${q.close.toFixed(2)}
                      </span>
                      {q.changePct !== null && (
                        <span
                          className={`block text-[11px] font-semibold tabular-nums ${
                            q.changePct >= 0 ? "text-primary" : "text-destructive"
                          }`}
                        >
                          {q.changePct >= 0 ? "+" : ""}
                          {q.changePct.toFixed(2)}%
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      No price on file
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
                <button
                  onClick={() => remove(symbol)}
                  aria-label={`Stop following ${symbol}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
