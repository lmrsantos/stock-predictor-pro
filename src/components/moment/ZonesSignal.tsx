// components/moment/ZonesSignal.tsx
// Entry / exit zones from the ACTIVE support-resistance values, plus the
// trade-plan action word. No decision language — never BUY, never SELL.

import type { MomentData } from "@/hooks/useMomentSymbol";

const money = (v: number) => `$${v.toFixed(2)}`;

const ACTION_COPY: Record<string, string> = {
  accumulate: "Price is near the lower zone, so adding is the step this plan favours here.",
  hold: "Price sits between the zones, so the plan favours leaving the position alone.",
  trim: "Price is close to the upper zone, so the plan favours reducing size.",
  exit: "Price has broken below the floor this plan relies on, so the plan favours stepping out.",
  wait: "The zones are too close together to act on, so the plan favours waiting.",
};

export function ZonesSignal({ data }: { data: MomentData }) {
  const { plan, levels, currentPrice } = data;

  const pct = (v: number) => `${(((v - currentPrice) / currentPrice) * 100).toFixed(1)}%`;
  const days = (v: number) => {
    const atr = levels.atr;
    if (!atr) return "—";
    const d = Math.max(1, Math.round(Math.abs(v - currentPrice) / atr));
    return `${d} day${d === 1 ? "" : "s"} at its typical pace`;
  };

  if (!plan) {
    return (
      <section className="rounded-xl border border-border bg-card p-3">
        <h2 className="text-sm font-semibold text-foreground">Zones</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Not enough clean history to place zones for this one.
        </p>
      </section>
    );
  }

  const zones = [
    { label: "Entry zone", lo: plan.entryLow, hi: plan.entryHigh, ref: plan.entryLow },
    { label: "Exit zone 1", lo: plan.target1, hi: plan.target1, ref: plan.target1 },
    { label: "Exit zone 2", lo: plan.target2, hi: plan.target2, ref: plan.target2 },
  ];

  const confLabel = (c: number) => {
    const pctText = `${Math.round(c * 100)}%`;
    return c < 0.3 ? `${pctText} · low confidence` : pctText;
  };

  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <h2 className="text-sm font-semibold text-foreground">Zones and next step</h2>

      {/* Structural levels — where price is now */}
      <div className="mt-2 rounded-lg border border-border p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Where price is now</p>
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Support</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {money(levels.support)}
            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
              backed by {levels.supportCount} measure{levels.supportCount === 1 ? "" : "s"}
            </span>
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Resistance</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {money(levels.resistance)}
            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
              backed by {levels.resistanceCount} measure{levels.resistanceCount === 1 ? "" : "s"}
            </span>
          </span>
        </div>
      </div>

      {/* Cycle projection — a forecast, not a level price is sitting on */}
      <div className="mt-2 rounded-lg border border-dashed border-border p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Where the cycle points next
        </p>
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Next low</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {money(levels.projectedTrough)}
            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
              confidence {confLabel(levels.troughConfidence)}
            </span>
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Next high</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {money(levels.projectedPeak)}
            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
              confidence {confLabel(levels.peakConfidence)}
            </span>
          </span>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Projection, not a level price is sitting on.
        </p>
      </div>

      <ul className="mt-2 space-y-2">
        {zones.map((z) => (
          <li key={z.label} className="rounded-lg bg-muted/50 p-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">{z.label}</span>
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {z.lo === z.hi ? money(z.lo) : `${money(z.lo)} – ${money(z.hi)}`}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {pct(z.ref)} away · roughly {days(z.ref)}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-3 rounded-lg border border-border p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Action word</p>
        <p className="mt-1 text-xl font-bold capitalize text-foreground">{plan.action}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {ACTION_COPY[plan.action] ?? plan.rationale[0]}
        </p>
      </div>
    </section>
  );
}
