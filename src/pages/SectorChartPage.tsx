import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, LineChart as LineChartIcon, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine,
} from "recharts";
import { CURATED_SECTOR_UNIVERSES, SECTOR_NAMES, type SectorName } from "@/lib/sector-universes";
import { SECTOR_ETF_PROXY } from "@/lib/sector-etf-mapping";
import { buildSectorComposite } from "@/lib/sector-composite";
import { computeLinearRegression } from "@/lib/regression";
import { InfoTooltip } from "@/components/InfoTooltip";

const PERIODS = [
  { key: "3mo", label: "3M" },
  { key: "6mo", label: "6M" },
  { key: "1y",  label: "1Y" },
  { key: "2y",  label: "2Y" },
  { key: "5y",  label: "5Y" },
];

export default function SectorChartPage() {
  const [sector, setSector] = useState<SectorName>("Semiconductors");
  const [period, setPeriod] = useState("1y");

  const proxy = SECTOR_ETF_PROXY[sector];

  const { data, isFetching, error } = useQuery({
    queryKey: ["sector-composite", sector, period, proxy?.symbol ?? null],
    queryFn: () => buildSectorComposite(sector, period, proxy?.symbol ?? null),
    staleTime: 10 * 60 * 1000,
  });

  const series = data?.series ?? [];

  // Regression on the composite (for stats + trendline)
  const regression = useMemo(() => {
    if (series.length < 10) return null;
    const pts = series.map((s) => ({
      date: s.date, timestamp: s.timestamp,
      open: s.composite, high: s.composite, low: s.composite, close: s.composite, volume: 0,
    }));
    return computeLinearRegression(pts, 0);
  }, [series]);

  const chartData = useMemo(() => {
    const fitByDate = new Map<string, number>();
    regression?.historicalFit.forEach((f) => fitByDate.set(f.date, f.fitted));
    return series.map((s) => ({
      date: s.date,
      composite: Number(s.composite.toFixed(2)),
      proxy: s.proxy != null ? Number(s.proxy.toFixed(2)) : undefined,
      trend: fitByDate.has(s.date) ? Number(fitByDate.get(s.date)!.toFixed(2)) : undefined,
    }));
  }, [series, regression]);

  const first = series[0]?.composite;
  const last = series[series.length - 1]?.composite;
  const compReturn = first && last ? ((last - first) / first) * 100 : 0;

  const proxyFirst = series.find((s) => s.proxy != null)?.proxy;
  const proxyLast = [...series].reverse().find((s) => s.proxy != null)?.proxy;
  const proxyReturn = proxyFirst && proxyLast ? ((proxyLast - proxyFirst) / proxyFirst) * 100 : null;

  const spread = proxyReturn != null ? compReturn - proxyReturn : null;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border px-6 py-4 flex items-center gap-4">
        <Link to="/terminal" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-2">
          <LineChartIcon className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-mono font-bold tracking-widest uppercase">Sector Chart</h1>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-y-auto space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Sector</label>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value as SectorName)}
              className="bg-secondary text-foreground text-sm rounded-md px-3 py-1.5 border border-border focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {SECTOR_NAMES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1 bg-secondary rounded-md p-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  period === p.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            {data ? `${data.membersLoaded.length}/${CURATED_SECTOR_UNIVERSES[sector].length} members loaded` : ""}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <StatCard
            label="Composite return"
            value={`${compReturn >= 0 ? "+" : ""}${compReturn.toFixed(2)}%`}
            positive={compReturn >= 0}
            tooltip="Equal-weight average of the curated sector members, normalized to 100 at the start of the period. Matches the math used by the Linkage Engine."
          />
          <StatCard
            label={proxy ? `${proxy.symbol} return` : "ETF proxy"}
            value={proxyReturn != null ? `${proxyReturn >= 0 ? "+" : ""}${proxyReturn.toFixed(2)}%` : "n/a"}
            positive={(proxyReturn ?? 0) >= 0}
            tooltip={proxy ? `Market-cap-weighted ETF benchmark for this sector: ${proxy.label}.` : "No clean ETF proxy for this custom basket (e.g. Mega-cap Tech, Quantum). Only the composite is shown."}
          />
          <StatCard
            label="Composite − proxy"
            value={spread != null ? `${spread >= 0 ? "+" : ""}${spread.toFixed(2)} pp` : "—"}
            positive={(spread ?? 0) >= 0}
            tooltip="How much the equal-weight curated composite outperformed (or lagged) the ETF proxy over the same window. Positive means the equal-weight basket beat the cap-weighted benchmark."
          />
          <StatCard
            label="R² (composite trend)"
            value={regression ? regression.rSquared.toFixed(3) : "—"}
            positive={(regression?.rSquared ?? 0) >= 0.5}
            tooltip="How well a straight-line trend fits the composite over the period. 1.0 = perfect linear trend, 0 = no trend."
          />
        </div>

        {/* Chart */}
        <div className="chart-surface p-4">
          {isFetching && !series.length ? (
            <div className="h-[420px] flex items-center justify-center text-muted-foreground text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Building composite from {CURATED_SECTOR_UNIVERSES[sector].length} tickers…
            </div>
          ) : error ? (
            <div className="h-[420px] flex items-center justify-center text-accent-danger text-sm">
              {(error as Error).message}
            </div>
          ) : !series.length ? (
            <div className="h-[420px] flex items-center justify-center text-muted-foreground text-sm">
              No price history available.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={460}>
              <LineChart data={chartData} margin={{ top: 12, right: 24, left: 12, bottom: 8 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" opacity={0.4} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  minTickGap={40}
                />
                <YAxis
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  domain={["auto", "auto"]}
                  label={{ value: "Level (base = 100)", angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 4" opacity={0.5} />
                <Line
                  type="monotone" dataKey="composite" name="Composite (equal-weight)"
                  stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false}
                />
                {proxy && (
                  <Line
                    type="monotone" dataKey="proxy" name={`${proxy.symbol} (ETF proxy)`}
                    stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false}
                  />
                )}
                {regression && (
                  <Line
                    type="monotone" dataKey="trend" name="Composite trend"
                    stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Members */}
        {data && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                Members in composite
                <InfoTooltip
                  title="Members in composite" what="The curated tickers that were combined (equal-weight, normalized to 100) to build this sector's composite line."
                  howToRead="Each ticker's price series is rebased to 100 at the start of the period, then averaged day-by-day. This is the exact same math the Linkage Engine uses, so what you see here is what the linkages are reasoning over."
                />
              </h3>
              <span className="text-xs text-muted-foreground">
                {data.membersLoaded.length} loaded · {data.membersMissing.length} missing
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.membersLoaded.map((s) => (
                <span key={s} className="px-2 py-0.5 text-[11px] rounded bg-secondary text-foreground font-mono">{s}</span>
              ))}
              {data.membersMissing.map((s) => (
                <span key={s} className="px-2 py-0.5 text-[11px] rounded bg-secondary/40 text-muted-foreground line-through font-mono" title="No price history in DB">{s}</span>
              ))}
            </div>
            {!proxy && (
              <p className="text-[11px] text-muted-foreground">
                No clean single-ETF benchmark exists for this basket — showing composite only.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, positive, tooltip }: { label: string; value: string; positive: boolean; tooltip: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
        <InfoTooltip title={label} what={label} howToRead={tooltip} />
      </div>
      <div className={`mt-1 text-xl font-mono font-semibold flex items-center gap-1.5 ${positive ? "text-accent-success" : "text-accent-danger"}`}>
        {positive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
        {value}
      </div>
    </div>
  );
}
