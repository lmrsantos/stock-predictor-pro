// pages/Moment.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Quant Moment — one screen, mobile first (375px target), single column.
// "Your eyes can mislead you. We check your read with the math."
//
// Rules enforced here: every card has a skeleton and a written empty state,
// cards fail independently, no horizontal scroll at 375px, the word BUY never
// appears, and a forecast never renders without its expected-move band.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useMomentSymbol } from "@/hooks/useMomentSymbol";
import { buildRead } from "@/lib/moment-read";
import { MomentSearch } from "@/components/moment/MomentSearch";
import { MomentChart } from "@/components/moment/MomentChart";
import { FourQuestions } from "@/components/moment/FourQuestions";
import { ZonesSignal } from "@/components/moment/ZonesSignal";
import { FundamentalsCard } from "@/components/moment/FundamentalsCard";
import { MomentWatchList } from "@/components/moment/MomentWatchList";

const ANON_KEY = "qm_anon_lookups";
const ANON_LIMIT = 2;

function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-5 animate-pulse rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}

export default function Moment() {
  const { user } = useAuth();
  const [symbol, setSymbol] = useState<string | null>(null);
  const [gated, setGated] = useState(false);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);

  const { data, loading, error, fundamentals, fundamentalsError, fundamentalsLoading, baseRates } =
    useMomentSymbol(gated ? null : symbol);

  useEffect(() => {
    document.title = "Quant Moment — check your read with the math";
  }, []);

  const handleSelect = async (next: string) => {
    setLimitMessage(null);

    if (!user) {
      const used = Number(localStorage.getItem(ANON_KEY) ?? "0");
      if (used >= ANON_LIMIT) {
        setSymbol(next);
        setGated(true);
        return;
      }
      localStorage.setItem(ANON_KEY, String(used + 1));
      setGated(false);
      setSymbol(next);
      return;
    }

    // Signed in: server-side lookup ceiling, checked before any work happens.
    try {
      const { data: usage, error: usageError } = await supabase.functions.invoke("track-usage", {
        body: { feature: "moment_lookup" },
      });
      if (!usageError && usage?.allowed === false) {
        setLimitMessage("You've hit today's lookup ceiling. It resets tomorrow.");
        return;
      }
    } catch {
      // Never block a lookup on the counter failing.
    }
    setGated(false);
    setSymbol(next);
  };

  const read =
    data &&
    buildRead({
      ticker: data.ticker,
      directionHitRate: data.forecast.validation.directionHitRate,
      windowCount: data.forecast.validation.windowCount,
      direction: data.forecast.forecastDirection,
      noTrend: data.trend.state === "no_trend",
      support: data.levels.support,
      resistance: data.levels.resistance,
    });

  return (
    <main className="mx-auto w-full max-w-md overflow-x-hidden px-3 pb-16 pt-5">
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Quant Moment</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your eyes can mislead you. We check your read with the math.
        </p>
      </header>

      <MomentSearch onSelect={handleSelect} />

      {limitMessage && (
        <p className="mt-3 rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          {limitMessage}
        </p>
      )}

      {gated && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <h2 className="text-base font-semibold text-foreground">Create a free account to keep going</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You've used your two free lookups. An account keeps them unlimited — free while we're building.
          </p>
          <Link
            to="/auth"
            className="mt-3 flex min-h-[44px] items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Create free account
          </Link>
        </div>
      )}

      <div className="mt-4 space-y-4">
        {!symbol && !gated && <MomentWatchList onSelect={handleSelect} />}

        {loading && (
          <>
            <CardSkeleton lines={2} />
            <CardSkeleton lines={2} />
            <CardSkeleton lines={6} />
          </>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-sm text-foreground">{error}</p>
            <p className="mt-1 text-sm text-muted-foreground">Try another ticker.</p>
          </div>
        )}

        {!loading && data && (
          <>
            {/* Header */}
            <section className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-foreground">{data.ticker}</h2>
                  <p className="truncate text-xs text-muted-foreground">
                    {data.companyName ?? "Company name not on file"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-2xl font-bold tabular-nums text-foreground">
                    ${data.currentPrice.toFixed(2)}
                  </p>
                  {data.dayChangePct !== null && (
                    <p
                      className={`text-sm font-semibold tabular-nums ${
                        data.dayChangePct >= 0 ? "text-primary" : "text-destructive"
                      }`}
                    >
                      {data.dayChangePct >= 0 ? "+" : ""}
                      {data.dayChangePct.toFixed(2)}%
                    </p>
                  )}
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {data.sector ? `${data.sector} · ` : ""}as of {data.asOfDate}
              </p>
            </section>

            {/* The read */}
            {read && (
              <section className="rounded-xl border border-border bg-card p-4">
                <p className="text-lg leading-snug text-foreground">{read[0]}</p>
                <p className="mt-2 text-lg leading-snug text-foreground">{read[1]}</p>
              </section>
            )}

            <MomentChart data={data} />
            <FourQuestions data={data} />
            <ZonesSignal data={data} />
            <FundamentalsCard
              fundamentals={fundamentals}
              loading={fundamentalsLoading}
              error={fundamentalsError}
            />
            <MomentWatchList onSelect={handleSelect} />
          </>
        )}
      </div>

      <footer className="mt-8 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          Not investment advice. These are statistical estimates, not predictions.
        </p>
      </footer>
    </main>
  );
}
