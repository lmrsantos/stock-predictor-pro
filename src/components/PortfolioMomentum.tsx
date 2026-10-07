import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Area, Bar, Cell, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/InfoTooltip";
import { fetchAndStoreStockData, getStockDataFromDB } from "@/lib/stock-data";
import { analyzePortfolioHistory, buildPortfolioHistory, type HistoryHolding, type PortfolioHistoryPoint } from "@/lib/portfolio-history";

const ranges = [{ label: "1M", days: 30 }, { label: "2M", days: 61 }, { label: "6M", days: 183 }, { label: "1Y", days: 365 }];
const money = (v: number) => `${v < 0 ? "−" : "+"}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const positive = "hsl(var(--accent-success))";
const negative = "hsl(var(--accent-danger))";

function HistoryTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload?: PortfolioHistoryPoint }>; label?: string }) {
  const point = payload?.[0]?.payload;
  if (!active || !point || !label) return null;
  return <div className="rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground shadow-sm">
    <p className="font-semibold">{dateLabel(label)}</p>
    <p>Gain/loss: {money(point.gainLoss)} ({point.gainLossPct.toFixed(2)}%)</p>
    <p>Portfolio value: ${point.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}</p>
    {point.momentum != null && <p>20-session change: {money(point.momentum)}</p>}
  </div>;
}

export function PortfolioMomentum({ holdings }: { holdings: HistoryHolding[] }) {
  const [range, setRange] = useState("2M");
  const tickers = useMemo(() => [...new Set(holdings.map((h) => h.ticker))], [holdings]);
  const meta = useQueries({ queries: tickers.map((ticker) => ({
    queryKey: ["portfolio-fetch", ticker], queryFn: () => fetchAndStoreStockData(ticker, "1y"), staleTime: 30 * 60 * 1000, retry: 1,
  })) });
  const prices = useQueries({ queries: tickers.map((ticker, i) => ({
    queryKey: ["portfolio-db", ticker], queryFn: () => getStockDataFromDB(ticker, "1y"), enabled: !!meta[i].data, staleTime: 30 * 60 * 1000,
  })) });
  const history = useMemo(() => {
    const byTicker = Object.fromEntries(tickers.map((ticker, i) => {
      const rows = new Map((prices[i].data ?? []).map((p) => [p.date, p]));
      for (const row of meta[i].data?.prices ?? []) rows.set(row.date, row);
      return [ticker, [...rows.values()]];
    }));
    return buildPortfolioHistory(holdings, byTicker);
  }, [holdings, tickers, prices, meta]);
  const analysis = useMemo(() => analyzePortfolioHistory(history), [history]);
  const days = ranges.find((r) => r.label === range)?.days ?? 61;
  const endDate = history.at(-1)?.date;
  const cutoff = endDate ? new Date(new Date(`${endDate}T12:00:00Z`).getTime() - days * 86400000).toISOString().slice(0, 10) : "";
  const visible = analysis.points.filter((p) => p.date >= cutoff);
  const last = history.at(-1);
  const error = [...meta, ...prices].some((q) => q.isError);
  const loading = meta.some((q) => q.isPending) || prices.some((q) => q.isPending);
  const unsupportedCurrency = meta.some((q) => q.data && q.data.currency && q.data.currency !== "USD");
  const incomplete = prices.some((q) => !q.data?.length) && meta.some((q) => !q.data?.prices.length);
  const { levels, cost, fit } = analysis;
  const support = levels ? levels.support - cost : undefined;
  const resistance = levels ? levels.resistance - cost : undefined;
  const pad = (levels?.atr ?? 0) * 0.375;
  const change = visible.length > 1 ? visible[visible.length - 1].gainLoss - visible[0].gainLoss : undefined;
  const metricClass = (value: number) => value >= 0 ? "price-positive" : "price-negative";

  if (!holdings.length) return null;
  return <section aria-label="Portfolio momentum" className="space-y-4 border-y border-border py-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Activity className="h-5 w-5 text-primary" />Portfolio momentum</h2>
      <div className="flex gap-1" aria-label="Portfolio date range">{ranges.map((r) => <Button key={r.label} size="sm" variant={range === r.label ? "default" : "ghost"} aria-pressed={range === r.label} onClick={() => setRange(r.label)}>{r.label}</Button>)}</div>
    </div>
    {unsupportedCurrency ? <p className="text-sm text-muted-foreground">This basket includes currencies other than USD. A combined gain/loss chart needs currency conversion first.</p>
      : loading ? <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading portfolio history…</div>
      : error || incomplete || !last || visible.length < 2 ? <div className="py-12 text-center text-sm text-muted-foreground">Not enough shared closing-price history for all holdings yet. No partial portfolio is shown.{error && <Button variant="outline" size="sm" className="ml-2" onClick={() => { meta.forEach((q) => q.refetch()); prices.forEach((q) => q.refetch()); }}>Retry</Button>}</div>
      : <>
        <div className="grid grid-cols-2 gap-x-5 gap-y-4 lg:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Gain/loss at last close<InfoTooltip title="Portfolio gain/loss" what="The value of your current shares at each daily close minus their saved purchase cost." howToRead="Above zero means an unrealized gain; below zero means a loss. For example, $12,000 of value minus $10,000 of cost gives +$2,000. This is not a complete account-return history." /></p><p className={`mt-1 break-words font-mono text-xl ${metricClass(last.gainLoss)}`}>{money(last.gainLoss)}</p></div>
          <div><p className="text-xs text-muted-foreground">Change over {range}<InfoTooltip title="Period change" what="The change in this same basket's gain/loss between the first and last visible closes." howToRead="If gain/loss rises from +$500 to +$800, the period change is +$300. This excludes deposits and withdrawals." /></p><p className={`mt-1 break-words font-mono text-xl ${metricClass(change ?? 0)}`}>{change != null ? money(change) : "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">20-session momentum<InfoTooltip title="20-session momentum" what="Today's basket value minus its value 20 trading sessions earlier, using the same share quantities." howToRead="+ $300 means this basket gained $300 across the last 20 observed sessions; a bar below zero means it lost value. A turn is not a promise the next wave repeats." /></p><p className={`mt-1 break-words font-mono text-xl ${metricClass(last.momentum ?? 0)}`}>{last.momentum != null ? money(last.momentum) : "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Recent trend<InfoTooltip title="Recent trend" what="A fitted line over up to 21 sessions. Whether a directional drift is measurable is tested using daily returns, not the visual angle." howToRead="A dashed line means the move is not distinguishable from everyday variation. +$10/day describes past slope, not a forecast." /></p><p className="mt-1 text-sm font-medium">{fit ? fit.significant ? fit.direction > 0 ? "Measurable rise" : "Measurable decline" : "No clear directional drift" : "Not enough history"}</p>{fit && <p className="font-mono text-xs text-muted-foreground">{money(fit.slope)}/session</p>}</div>
        </div>
        <div className="h-[300px] w-full min-w-0 select-none [touch-action:pan-y] [-webkit-touch-callout:none]">
          <ResponsiveContainer width="100%" height="100%"><ComposedChart data={visible} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(range === "1Y" ? { year: "2-digit" as const } : {}) })} minTickGap={38} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis domain={["auto", "auto"]} tickFormatter={money} width={72} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip content={<HistoryTooltip />} />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
            {support != null && <ReferenceArea y1={support - pad} y2={support + pad} fill={positive} fillOpacity={0.12} ifOverflow="extendDomain" />}
            {resistance != null && <ReferenceArea y1={resistance - pad} y2={resistance + pad} fill={negative} fillOpacity={0.12} ifOverflow="extendDomain" />}
            <Area dataKey="gainLoss" name="Gain/loss" stroke="hsl(var(--foreground))" strokeWidth={2} fill="hsl(var(--primary))" fillOpacity={0.07} isAnimationActive={false} />
            <Line dataKey="average" name="20-session average" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line dataKey="fitted" name="Recent fitted trend" stroke={fit?.significant ? fit.direction > 0 ? positive : negative : "hsl(var(--muted-foreground))"} strokeDasharray={fit?.significant ? undefined : "5 4"} dot={false} isAnimationActive={false} />
          </ComposedChart></ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><span>Gain/loss · solid line</span><span className="text-primary">20-session average</span><span>Recent trend · {fit?.significant ? "solid" : "dashed"}</span></div>
        {levels && <div className="grid gap-4 sm:grid-cols-2">
          {[{ title: "Support zone", value: levels.support - cost, count: levels.supportGroupCount, names: levels.supportMethodNames }, { title: "Resistance zone", value: levels.resistance - cost, count: levels.resistanceGroupCount, names: levels.resistanceMethodNames }].map((level) => <div key={level.title}>
            <p className="text-sm font-medium">{level.title}<InfoTooltip title={level.title} what="A cluster of historical structure, average, or volatility measures calculated on the basket's value, then expressed as gain/loss." howToRead="Support is below the latest close and resistance above it. If support is +$500, the basket would still be in profit there. Levels may break; these are not projected future lows or highs." /></p>
            <p className="font-mono text-lg">{money(level.value)}</p>
            <details className="text-xs text-muted-foreground"><summary className="cursor-pointer py-1">{level.count === 1 ? "1 method type only" : `${level.count} method types agree`}</summary><p>{level.names.join(", ")} cluster here ({level.names.length} measures).{level.count === 1 ? " Only one kind of evidence points here." : ""}</p></details>
          </div>)}
        </div>}
        <div><h3 className="mb-2 text-sm font-medium">Momentum wave</h3><div className="h-[120px] w-full select-none [touch-action:pan-y] [-webkit-touch-callout:none]"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={visible} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <YAxis width={72} tickFormatter={money} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
          <XAxis dataKey="date" hide /><ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
          <Tooltip content={<HistoryTooltip />} /><Bar dataKey="momentum" name="20-session change" fill="hsl(var(--primary))" isAnimationActive={false}>{visible.map((point) => <Cell key={point.date} fill={(point.momentum ?? 0) >= 0 ? positive : negative} />)}</Bar>
        </ComposedChart></ResponsiveContainer></div></div>
        <p className="text-xs leading-relaxed text-muted-foreground">Current-basket reconstruction · {dateLabel(visible[0].date)} – {dateLabel(last.date)} · daily closes, not live quotes. Uses today's shares and saved costs; excludes sold positions, past quantity changes, dividends and fees. {holdings.some((h) => !h.purchase_date) ? "Some purchase dates are missing; those positions are assumed held throughout." : "Starts after the latest recorded purchase."} Historical zones do not guarantee another bounce.</p>
      </>}
  </section>;
}