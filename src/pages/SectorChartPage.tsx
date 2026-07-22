import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, LineChart as LineChartIcon, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { useQuery, useQueries } from "@tanstack/react-query";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine,
} from "recharts";
import { CURATED_SECTOR_UNIVERSES, SECTOR_NAMES, SECTOR_GROUPS, type SectorName } from "@/lib/sector-universes";
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

type Mode = "single" | "compare";

// Distinct palette for compare mode lines
const COMPARE_COLORS = [
  "hsl(var(--primary))", "#f59e0b", "#10b981", "#ef4444", "#a78bfa",
  "#06b6d4", "#f472b6", "#84cc16", "#eab308", "#8b5cf6", "#14b8a6", "#fb923c", "#64748b",
];

export default function SectorChartPage() {
  const [mode, setMode] = useState<Mode>("single");
  const [sector, setSector] = useState<SectorName>("Semiconductors");
  const [selected, setSelected] = useState<SectorName[]>(["Semiconductors", "Software", "Banks", "Energy"]);
  const [period, setPeriod] = useState("1y");

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
        {/* Mode toggle */}
        <div className="inline-flex rounded border border-border bg-card p-0.5 text-[10px] font-mono uppercase tracking-widest">
          {(["single", "compare"] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded ${mode === m ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : "text-muted-foreground hover:text-foreground"}`}
            >
              {m === "single" ? "Single sector" : "Compare sectors"}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {mode === "single" ? (
            <div className="flex items-center gap-2">
              <label className="text-xs uppercase tracking-widest text-muted-foreground">Sector / Subsector</label>
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value as SectorName)}
                className="bg-secondary text-foreground text-sm rounded-md px-3 py-1.5 border border-border focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {SECTOR_GROUPS.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.sectors.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex flex-col gap-2 w-full">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                Sectors ({selected.length} selected)
              </div>
              <div className="flex flex-col gap-2 max-h-64 overflow-auto p-2 border border-border rounded">
                {SECTOR_GROUPS.map((g) => (
                  <div key={g.group}>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">{g.group}</div>
                    <div className="flex flex-wrap gap-2">
                      {g.sectors.map((s) => {
                        const active = selected.includes(s);
                        return (
                          <button
                            key={s}
                            onClick={() => setSelected(prev =>
                              prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
                            )}
                            className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                              active
                                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                                : "border-border text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
        </div>

        {mode === "single"
          ? <SingleView sector={sector} period={period} />
          : <CompareView sectors={selected} period={period} />
        }
      </main>
    </div>
  );
}

// ---------------- Single sector view (existing behavior) ----------------
function SingleView({ sector, period }: { sector: SectorName; period: string }) {
  const proxy = SECTOR_ETF_PROXY[sector];
  const { data, isFetching, error } = useQuery({
    queryKey: ["sector-composite", sector, period, proxy?.symbol ?? null],
    queryFn: () => buildSectorComposite(sector, period, proxy?.symbol ?? null),
    staleTime: 10 * 60 * 1000,
  });

  const series = data?.series ?? [];

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
    <>
      <div className="flex justify-end text-xs text-muted-foreground">
        {data ? `${data.membersLoaded.length}/${CURATED_SECTOR_UNIVERSES[sector].length} members loaded` : ""}
      </div>

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
          tooltip={proxy ? `Market-cap-weighted ETF benchmark for this sector: ${proxy.label}.` : "No clean ETF proxy for this custom basket. Only the composite is shown."}
        />
        <StatCard
          label="Composite − proxy"
          value={spread != null ? `${spread >= 0 ? "+" : ""}${spread.toFixed(2)} pp` : "—"}
          positive={(spread ?? 0) >= 0}
          tooltip="How much the equal-weight curated composite outperformed (or lagged) the ETF proxy over the same window."
        />
        <StatCard
          label="R² (composite trend)"
          value={regression ? regression.rSquared.toFixed(3) : "—"}
          positive={(regression?.rSquared ?? 0) >= 0.5}
          tooltip="How well a straight-line trend fits the composite. 1.0 = perfect linear trend."
        />
      </div>

      <div className="chart-surface p-4 mt-6">
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
              <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} minTickGap={40} />
              <YAxis
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                domain={["auto", "auto"]}
                label={{ value: "Level (base = 100)", angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 4" opacity={0.5} />
              <Line type="monotone" dataKey="composite" name="Composite (equal-weight)" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
              {proxy && (
                <Line type="monotone" dataKey="proxy" name={`${proxy.symbol} (ETF proxy)`} stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
              )}
              {regression && (
                <Line type="monotone" dataKey="trend" name="Composite trend" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {data && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3 mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              Members in composite
              <InfoTooltip
                title="Members in composite" what="The curated tickers combined (equal-weight, normalized to 100) to build this sector's composite line."
                howToRead="Each ticker is rebased to 100 at the start of the period, then averaged day-by-day. Same math as the Linkage Engine."
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
        </div>
      )}
    </>
  );
}

// ---------------- Compare view (multi-sector overlay) ----------------
function CompareView({ sectors, period }: { sectors: SectorName[]; period: string }) {
  const results = useQueries({
    queries: sectors.map((s) => ({
      queryKey: ["sector-composite", s, period, SECTOR_ETF_PROXY[s]?.symbol ?? null],
      queryFn: () => buildSectorComposite(s, period, SECTOR_ETF_PROXY[s]?.symbol ?? null),
      staleTime: 10 * 60 * 1000,
    })),
  });

  const anyLoading = results.some(r => r.isFetching && !r.data);
  const errorRes = results.find(r => r.error);

  // Merge composites into one time-aligned chart. Rebase each to 100 at first common date.
  const { chartData, returns } = useMemo(() => {
    const byDate = new Map<string, Record<string, number>>();
    const perSectorFirst: Record<string, number> = {};
    const perSectorLast: Record<string, number> = {};

    sectors.forEach((s, idx) => {
      const series = results[idx]?.data?.series ?? [];
      if (!series.length) return;
      const base = series[0].composite;
      perSectorFirst[s] = base;
      series.forEach((pt) => {
        const rebased = (pt.composite / base) * 100;
        perSectorLast[s] = rebased;
        if (!byDate.has(pt.date)) byDate.set(pt.date, { date: pt.date as any });
        byDate.get(pt.date)![s] = Number(rebased.toFixed(2));
      });
    });

    const chartData = Array.from(byDate.values()).sort((a: any, b: any) => a.date.localeCompare(b.date));
    const returns = sectors.map((s) => ({
      sector: s,
      ret: perSectorLast[s] != null ? perSectorLast[s] - 100 : null,
    })).sort((a, b) => (b.ret ?? -Infinity) - (a.ret ?? -Infinity));

    return { chartData, returns };
  }, [sectors, results.map(r => r.data).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sectors.length) {
    return <div className="text-sm text-muted-foreground">Pick at least one sector to compare.</div>;
  }

  return (
    <>
      {/* Ranking table */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {returns.map((r, i) => (
          <div key={r.sector} className="rounded border border-border bg-card px-3 py-2">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground truncate">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: COMPARE_COLORS[sectors.indexOf(r.sector) % COMPARE_COLORS.length] }} />
              <span className="truncate">{r.sector}</span>
            </div>
            <div className={`mt-0.5 text-sm font-mono font-semibold ${(r.ret ?? 0) >= 0 ? "text-accent-success" : "text-accent-danger"}`}>
              {r.ret != null ? `${r.ret >= 0 ? "+" : ""}${r.ret.toFixed(2)}%` : "—"}
            </div>
          </div>
        ))}
      </div>

      <div className="chart-surface p-4 mt-6">
        {anyLoading ? (
          <div className="h-[460px] flex items-center justify-center text-muted-foreground text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Building composites for {sectors.length} sectors…
          </div>
        ) : errorRes ? (
          <div className="h-[460px] flex items-center justify-center text-accent-danger text-sm">
            {(errorRes.error as Error).message}
          </div>
        ) : !chartData.length ? (
          <div className="h-[460px] flex items-center justify-center text-muted-foreground text-sm">
            No price history available.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={460}>
            <LineChart data={chartData} margin={{ top: 12, right: 24, left: 12, bottom: 8 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" opacity={0.4} />
              <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} minTickGap={40} />
              <YAxis
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                domain={["auto", "auto"]}
                label={{ value: "Level (base = 100)", angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 4" opacity={0.5} />
              {sectors.map((s, i) => (
                <Line
                  key={s}
                  type="monotone"
                  dataKey={s}
                  name={s}
                  stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]}
                  strokeWidth={1.75}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground mt-2">
        Each sector composite is equal-weight and rebased to 100 at the start of the selected period, so the lines show relative performance.
      </p>
    </>
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
