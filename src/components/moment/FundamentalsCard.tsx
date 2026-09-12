// components/moment/FundamentalsCard.tsx
// Four fundamentals only. Fails on its own — never blanks the rest of the page.

import type { MomentFundamentals } from "@/hooks/useMomentSymbol";

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{value}</span>
    </li>
  );
}

const bigMoney = (v: number) => {
  const abs = Math.abs(v);
  const unit = abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : [1, ""];
  return `${v < 0 ? "-" : ""}$${(abs / (unit[0] as number)).toFixed(2)}${unit[1]}`;
};

export function FundamentalsCard({
  fundamentals, loading, error,
}: {
  fundamentals: MomentFundamentals | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <h2 className="text-sm font-semibold text-foreground">Four fundamentals</h2>

      {loading && (
        <div className="mt-2 space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      )}

      {!loading && error && (
        <p className="mt-1 text-sm text-muted-foreground">
          We couldn't load the company numbers this time. The rest of the page is unaffected.
        </p>
      )}

      {!loading && !error && fundamentals && (
        <ul className="mt-1 divide-y divide-border">
          <Row
            label="Price to earnings"
            note={
              fundamentals.sectorPe != null
                ? `Sector median ${fundamentals.sectorPe.toFixed(1)}`
                : "No sector median available"
            }
            value={fundamentals.peRatio != null ? fundamentals.peRatio.toFixed(1) : "Not reported"}
          />
          <Row
            label="Revenue growth"
            note="Latest year against the year before"
            value={
              fundamentals.revenueGrowthYoY != null
                ? `${fundamentals.revenueGrowthYoY >= 0 ? "+" : ""}${fundamentals.revenueGrowthYoY.toFixed(1)}%`
                : "Not reported"
            }
          />
          <Row
            label="Free cash flow"
            note={
              fundamentals.freeCashFlow != null
                ? fundamentals.freeCashFlow >= 0
                  ? "Cash coming in"
                  : "Cash going out"
                : undefined
            }
            value={fundamentals.freeCashFlow != null ? bigMoney(fundamentals.freeCashFlow) : "Not reported"}
          />
          <Row
            label="Share count change"
            note={
              fundamentals.sharesChangeYoY != null
                ? fundamentals.sharesChangeYoY < 0
                  ? "Buyback"
                  : fundamentals.sharesChangeYoY > 0
                    ? "Dilution"
                    : "Unchanged"
                : undefined
            }
            value={
              fundamentals.sharesChangeYoY != null
                ? `${fundamentals.sharesChangeYoY >= 0 ? "+" : ""}${fundamentals.sharesChangeYoY.toFixed(1)}%`
                : "Not reported"
            }
          />
        </ul>
      )}

      {!loading && !error && !fundamentals && (
        <p className="mt-1 text-sm text-muted-foreground">No company numbers on file for this one yet.</p>
      )}
    </section>
  );
}
