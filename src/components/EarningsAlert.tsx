import { CalendarClock } from "lucide-react";

export interface EarningsAlertProps {
  ticker: string;
  /** ISO date (YYYY-MM-DD) of the next scheduled earnings report. */
  date: string | null | undefined;
  confirmed?: boolean;
  source?: string | null;
  /** Show only when the report is this many calendar days away or fewer. */
  windowDays?: number;
}

const dayLabel = (n: number) =>
  n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;

/**
 * Slim banner shown above the main chart when earnings are imminent.
 * Renders nothing outside the window so the chart keeps its full height.
 */
export function EarningsAlert({
  ticker,
  date,
  confirmed,
  source,
  windowDays = 5,
}: EarningsAlertProps) {
  if (!date) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;

  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days < 0 || days > windowDays) return null;

  const pretty = target.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-accent-warning/40 bg-accent-warning/10 px-3 py-2 text-xs"
      role="status"
    >
      <CalendarClock className="h-3.5 w-3.5 text-accent-warning shrink-0" />
      <span className="font-mono font-semibold text-foreground">
        {ticker} earnings {dayLabel(days)}
      </span>
      <span className="text-muted-foreground">· {pretty}</span>
      <span className="text-muted-foreground">
        {confirmed ? "· company-confirmed date" : "· date estimated, not yet confirmed"}
      </span>
      <span className="text-muted-foreground">
        · Forecast bands widen around reports — trend models do not price event risk.
      </span>
      {source && <span className="sr-only">Source: {source}</span>}
    </div>
  );
}
