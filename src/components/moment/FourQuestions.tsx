// components/moment/FourQuestions.tsx
// Collapsed rows, expand on tap. Plain words only — no jargon, no verdicts.

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { MomentData } from "@/hooks/useMomentSymbol";

const money = (v: number) => `$${v.toFixed(2)}`;

function typicalDailyMove(closes: number[]): number {
  const moves: number[] = [];
  for (let i = Math.max(1, closes.length - 60); i < closes.length; i++) {
    const prev = closes[i - 1];
    if (prev > 0) moves.push(Math.abs((closes[i] - prev) / prev) * 100);
  }
  if (!moves.length) return 0;
  return moves.reduce((s, v) => s + v, 0) / moves.length;
}

export function FourQuestions({ data }: { data: MomentData }) {
  const [open, setOpen] = useState<string | null>(null);
  const closes = data.rows.map((r) => r.close);
  const { week52Low, week52High, currentPrice, levels, trend } = data;
  const pos =
    week52High > week52Low ? ((currentPrice - week52Low) / (week52High - week52Low)) * 100 : 50;
  const typical = typicalDailyMove(closes);
  const today = data.dayChangePct;

  const rows: { q: string; a: string }[] = [
    {
      q: "Is it cheap right now?",
      a:
        `Price sits at ${pos.toFixed(0)}% of its 52-week range (${money(week52Low)} to ${money(week52High)}). ` +
        `The nearest floor underneath is ${money(levels.support)} (${levels.supportSource}) and the nearest ceiling above is ` +
        `${money(levels.resistance)} (${levels.resistanceSource}).`,
    },
    {
      q: "Is it going up?",
      a:
        trend.state === "no_trend"
          ? "There's no measurable trend in the price right now — the day-to-day movement swamps any direction."
          : `${trend.stateLabel}. ${trend.stateDescription} ${trend.caveat}`,
    },
    {
      q: "Is this a dip or a fall?",
      a: data.setups.length
        ? data.setups.map((s) => `${s.name} — ${s.rationale}`).join(" ")
        : "No pattern we track matches this.",
    },
    {
      q: "Is this move unusual?",
      a:
        today === null || typical === 0
          ? "We don't have enough recent days to compare today's move against a typical one."
          : `Today's move is ${today >= 0 ? "+" : ""}${today.toFixed(2)}%. A typical day for this stock over the last three months moves about ${typical.toFixed(2)}%, so today is ${
              Math.abs(today) > typical * 2
                ? "much larger than usual"
                : Math.abs(today) > typical
                  ? "a little larger than usual"
                  : "within its normal range"
            }.`,
    },
  ];

  return (
    <section className="rounded-xl border border-border bg-card">
      <h2 className="px-3 pt-3 text-sm font-semibold text-foreground">Four questions</h2>
      <ul className="mt-1 divide-y divide-border">
        {rows.map((r) => {
          const isOpen = open === r.q;
          return (
            <li key={r.q}>
              <button
                onClick={() => setOpen(isOpen ? null : r.q)}
                className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-3 text-left"
                aria-expanded={isOpen}
              >
                <span className="text-sm text-foreground">{r.q}</span>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>
              {isOpen && (
                <p className="px-3 pb-3 text-sm leading-relaxed text-muted-foreground">{r.a}</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
