// src/components/SectorBacktest.tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CURATED_SECTORS, YAHOO_SECTORS,
  runSectorBacktest, SectorBacktestRow,
} from "@/lib/sector-backtest";
import { SECTOR_GROUPS } from "@/lib/sector-universes";
import { InfoTooltip } from "./InfoTooltip";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

interface Props {
  isOpen?: boolean;
  onClose?: () => void;
  onSelectTicker?: (ticker: string) => void;
  inline?: boolean;
}

type SortKey =
  | "ticker" | "currentPrice" | "annualizedReturn"
  | "forecastPct" | "rSquared" | "confidenceScore"
  | "predictedTodayErrorPct";

type Mode = "single" | "compare";

interface SectorAggregate {
  sector: string;
  count: number;
  avgForecastPct: number;
  medianForecastPct: number;
  avgConfidence: number;
  avgAnnReturn: number;
  bullish: number; // % of tickers with forecastPct > 0
  rows: SectorBacktestRow[];
}

const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const fmtPrice = (v: number) =>
  `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const colorPct = (v: number) =>
  v >= 0 ? "text-emerald-400" : "text-red-400";
const colorConf = (v: number) =>
  v >= 65 ? "text-emerald-400" : v >= 40 ? "text-amber-400" : "text-red-400";
const colorErr = (v: number) =>
  v <= 1 ? "text-emerald-400" : v <= 3 ? "text-amber-400" : "text-red-400";

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function aggregate(sector: string, rows: SectorBacktestRow[]): SectorAggregate {
  const fp = rows.map(r => r.forecastPct);
  return {
    sector,
    count: rows.length,
    avgForecastPct: rows.length ? fp.reduce((a, b) => a + b, 0) / rows.length : 0,
    medianForecastPct: median(fp),
    avgConfidence: rows.length ? rows.reduce((a, r) => a + r.confidenceScore, 0) / rows.length : 0,
    avgAnnReturn: rows.length ? rows.reduce((a, r) => a + r.annualizedReturn, 0) / rows.length : 0,
    bullish: rows.length ? (rows.filter(r => r.forecastPct > 0).length / rows.length) * 100 : 0,
    rows,
  };
}

export function SectorBacktest({ isOpen, onClose, onSelectTicker, inline = false }: Props) {
  const navigate = useNavigate();
  const [mode, setMode]       = useState<Mode>("single");
  const [sector, setSector]   = useState<string>("Semiconductors");
  const [selectedSectors, setSelectedSectors] = useState<string[]>(["Semiconductors", "Software", "Banks", "Energy"]);
  const [source, setSource]   = useState<"curated" | "yahoo">("curated");
  const [maxTickers, setMax]  = useState<number>(30);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string; sectorLabel?: string }>({ done: 0, total: 0, current: "" });
  const [rows, setRows]       = useState<SectorBacktestRow[]>([]);
  const [failed, setFailed]   = useState<string[]>([]);
  const [error, setError]     = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("confidenceScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [meta, setMeta]       = useState<{ sector: string; source: string } | null>(null);
  const [aggregates, setAggregates] = useState<SectorAggregate[]>([]);
  const [compareMetric, setCompareMetric] = useState<"avgForecastPct" | "medianForecastPct" | "avgConfidence" | "avgAnnReturn" | "bullish">("avgForecastPct");

  const sectorOptions = source === "yahoo" ? YAHOO_SECTORS : CURATED_SECTORS;

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = a[sortKey] as number | string;
      const bv = b[sortKey] as number | string;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }

  function toggleSectorPick(s: string) {
    setSelectedSectors(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  async function handleRun() {
    setRunning(true);
    setRows([]); setFailed([]); setError(null); setAggregates([]);
    setProgress({ done: 0, total: 0, current: "" });
    try {
      if (mode === "single") {
        const out = await runSectorBacktest(sector, source, {
          maxTickers,
          onProgress: (p) => setProgress({ done: p.done, total: p.total, current: p.currentTicker }),
        });
        setRows(out.rows);
        setFailed(out.failed);
        setMeta({ sector: out.sector, source: out.source });
      } else {
        if (selectedSectors.length === 0) {
          setError("Pick at least one sector to compare.");
          setRunning(false);
          return;
        }
        const aggs: SectorAggregate[] = [];
        const allFailed: string[] = [];
        for (let i = 0; i < selectedSectors.length; i++) {
          const s = selectedSectors[i];
          setProgress({ done: i, total: selectedSectors.length, current: s, sectorLabel: s });
          try {
            const out = await runSectorBacktest(s, source, {
              maxTickers,
              onProgress: (p) => setProgress({
                done: i, total: selectedSectors.length,
                current: `${s} · ${p.currentTicker}`, sectorLabel: s,
              }),
            });
            aggs.push(aggregate(out.sector, out.rows));
            allFailed.push(...out.failed);
          } catch (e) {
            console.warn(`sector ${s} failed`, e);
          }
        }
        setProgress({ done: selectedSectors.length, total: selectedSectors.length, current: "" });
        setAggregates(aggs);
        setFailed(allFailed);
        setMeta({ sector: `${aggs.length} sectors`, source });
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }

  function handlePickTicker(t: string) {
    if (inline) {
      navigate(`/?ticker=${t}`);
      return;
    }
    onSelectTicker?.(t);
    onClose?.();
  }

  if (!isOpen && !inline) return null;

  const pctDone = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  const metricLabel: Record<typeof compareMetric, string> = {
    avgForecastPct: "Avg 30d forecast %",
    medianForecastPct: "Median 30d forecast %",
    avgConfidence: "Avg confidence",
    avgAnnReturn: "Avg annualized return %",
    bullish: "% bullish tickers",
  };

  const chartData = useMemo(() => {
    const arr = aggregates.map(a => ({
      sector: a.sector,
      value:
        compareMetric === "avgAnnReturn" ? a.avgAnnReturn * 100 :
        compareMetric === "avgForecastPct" ? a.avgForecastPct :
        compareMetric === "medianForecastPct" ? a.medianForecastPct :
        compareMetric === "avgConfidence" ? a.avgConfidence :
        a.bullish,
      count: a.count,
    }));
    arr.sort((x, y) => y.value - x.value);
    return arr;
  }, [aggregates, compareMetric]);

  const header = (
    <div className="px-6 py-4 border-b border-border flex items-center justify-between">
      <div>
        <h2 className="text-sm font-mono uppercase tracking-widest text-foreground">
          Sector Backtest
          <InfoTooltip
            title="Sector Backtest"
            what="Runs the calibration-by-hindsight backtest model across every ticker in a sector and ranks them by confidence."
            howToRead="Single mode shows every ticker in one sector. Compare mode aggregates the model output across multiple sectors so you can see which sectors are collectively more bullish, more confident, or higher-return."
          />
        </h2>
        <p className="text-[11px] text-muted-foreground font-mono mt-1">
          Universe → prices → per-ticker backtest → ranked results
        </p>
      </div>
      {!inline && (
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-xl leading-none"
          aria-label="Close"
        >✕</button>
      )}
    </div>
  );

  const body = (
    <>
      {header}

      {/* Mode switch */}
      <div className="px-6 pt-4">
        <div className="inline-flex rounded border border-border bg-card p-0.5 text-[10px] font-mono uppercase tracking-widest">
          {(["single", "compare"] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => !running && setMode(m)}
              className={`px-3 py-1.5 rounded ${mode === m ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : "text-muted-foreground hover:text-foreground"}`}
            >
              {m === "single" ? "Single sector" : "Compare sectors"}
            </button>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="px-6 py-4 border-b border-border grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Universe Source</label>
          <select
            value={source}
            onChange={e => {
              const s = e.target.value as "curated" | "yahoo";
              setSource(s);
              const opts = s === "yahoo" ? YAHOO_SECTORS : CURATED_SECTORS;
              if (!opts.includes(sector as any)) setSector(opts[0]);
              setSelectedSectors(prev => prev.filter(x => (opts as readonly string[]).includes(x)));
            }}
            disabled={running}
            className="bg-card border border-border rounded px-2 py-1.5 text-xs font-mono text-foreground"
          >
            <option value="curated">Curated (fast, large-caps)</option>
            <option value="yahoo">Yahoo screener (live universe)</option>
          </select>
        </div>

        {mode === "single" ? (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Sector</label>
            <select
              value={sector}
              onChange={e => setSector(e.target.value)}
              disabled={running}
              className="bg-card border border-border rounded px-2 py-1.5 text-xs font-mono text-foreground"
            >
              {sectorOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        ) : (
          <div className="flex flex-col gap-1 md:col-span-2">
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Sectors ({selectedSectors.length} selected)
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-auto p-1.5 bg-card border border-border rounded">
              {sectorOptions.map(s => {
                const on = selectedSectors.includes(s);
                return (
                  <button
                    key={s}
                    disabled={running}
                    onClick={() => toggleSectorPick(s)}
                    className={`text-[10px] font-mono px-2 py-1 rounded border ${
                      on
                        ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Max Tickers / sector</label>
          <select
            value={maxTickers}
            onChange={e => setMax(Number(e.target.value))}
            disabled={running}
            className="bg-card border border-border rounded px-2 py-1.5 text-xs font-mono text-foreground"
          >
            {[10, 20, 30, 40, 50].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={handleRun}
            disabled={running || (mode === "compare" && selectedSectors.length === 0)}
            className="w-full px-4 py-2 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-mono uppercase tracking-widest"
          >
            {running ? "Running…" : mode === "single" ? "Run Backtest" : "Run Comparison"}
          </button>
        </div>
      </div>

      {/* Progress / Status */}
      {(running || progress.total > 0) && (
        <div className="px-6 py-3 border-b border-border bg-card/40">
          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground mb-1.5">
            <span>{running ? `Processing ${progress.current || "…"}` : "Complete"}</span>
            <span>{progress.done} / {progress.total} ({pctDone}%)</span>
          </div>
          <div className="h-1.5 bg-muted rounded overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-200"
              style={{ width: `${pctDone}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="px-6 py-3 border-b border-border bg-red-500/10 text-red-300 text-xs font-mono">
          {error}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-auto">
        {mode === "compare" && aggregates.length > 0 && (
          <div className="p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Metric</span>
              <select
                value={compareMetric}
                onChange={e => setCompareMetric(e.target.value as any)}
                className="bg-card border border-border rounded px-2 py-1.5 text-xs font-mono text-foreground"
              >
                <option value="avgForecastPct">Avg 30d forecast %</option>
                <option value="medianForecastPct">Median 30d forecast %</option>
                <option value="avgConfidence">Avg confidence</option>
                <option value="avgAnnReturn">Avg annualized return %</option>
                <option value="bullish">% bullish tickers</option>
              </select>
            </div>

            <div className="h-[360px] bg-card/40 border border-border rounded p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="sector"
                    tick={{ fill: "#a1a1aa", fontSize: 10, fontFamily: "monospace" }}
                    angle={-25}
                    textAnchor="end"
                    interval={0}
                    height={70}
                  />
                  <YAxis
                    tick={{ fill: "#a1a1aa", fontSize: 10, fontFamily: "monospace" }}
                    tickFormatter={(v) => compareMetric === "avgConfidence" ? `${v.toFixed(0)}` : `${v.toFixed(1)}%`}
                  />
                  <Tooltip
                    contentStyle={{ background: "#0a0a0a", border: "1px solid #27272a", fontFamily: "monospace", fontSize: 11 }}
                    formatter={(value: any, _n: any, p: any) => [
                      compareMetric === "avgConfidence" ? Number(value).toFixed(1) : `${Number(value).toFixed(2)}%`,
                      metricLabel[compareMetric],
                    ]}
                    labelFormatter={(label) => {
                      const row = chartData.find(r => r.sector === label);
                      return `${label} · ${row?.count ?? 0} tickers`;
                    }}
                  />
                  <Legend wrapperStyle={{ fontFamily: "monospace", fontSize: 10 }} />
                  <Bar dataKey="value" name={metricLabel[compareMetric]}>
                    {chartData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={
                          compareMetric === "avgConfidence"
                            ? (d.value >= 65 ? "#10b981" : d.value >= 40 ? "#f59e0b" : "#ef4444")
                            : (d.value >= 0 ? "#10b981" : "#ef4444")
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <table className="w-full text-xs font-mono">
              <thead className="bg-background border-b border-border">
                <tr>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">Sector</th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">Tickers</th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">Avg Fcst</th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">Median Fcst</th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">% Bullish</th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">Avg Conf</th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">Avg Ann Ret</th>
                </tr>
              </thead>
              <tbody>
                {aggregates.map(a => (
                  <tr key={a.sector} className="border-b border-border/60">
                    <td className="px-3 py-2 text-foreground font-semibold">{a.sector}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{a.count}</td>
                    <td className={`px-3 py-2 text-right ${colorPct(a.avgForecastPct)}`}>{fmtPct(a.avgForecastPct)}</td>
                    <td className={`px-3 py-2 text-right ${colorPct(a.medianForecastPct)}`}>{fmtPct(a.medianForecastPct)}</td>
                    <td className="px-3 py-2 text-right text-foreground">{a.bullish.toFixed(0)}%</td>
                    <td className={`px-3 py-2 text-right font-semibold ${colorConf(a.avgConfidence)}`}>{a.avgConfidence.toFixed(0)}</td>
                    <td className={`px-3 py-2 text-right ${colorPct(a.avgAnnReturn * 100)}`}>{fmtPct(a.avgAnnReturn * 100)}/yr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {mode === "single" && sortedRows.length === 0 && !running && !error && (
          <div className="p-10 text-center text-muted-foreground text-xs font-mono">
            Pick a sector and click <span className="text-foreground">Run Backtest</span> to score every ticker.
          </div>
        )}

        {mode === "compare" && aggregates.length === 0 && !running && !error && (
          <div className="p-10 text-center text-muted-foreground text-xs font-mono">
            Pick sectors and click <span className="text-foreground">Run Comparison</span> to see a combined graphic.
          </div>
        )}

        {mode === "single" && sortedRows.length > 0 && (
          <table className="w-full text-xs font-mono">
            <thead className="sticky top-0 bg-background border-b border-border">
              <tr>
                <Th label="Ticker"    k="ticker"               sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Price"     k="currentPrice"         sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Winner"    k="annualizedReturn"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Ann. Ret"  k="annualizedReturn"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Forecast"  k="forecastPct"          sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Err %"     k="predictedTodayErrorPct" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="R²"        k="rSquared"             sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Confidence" k="confidenceScore"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">Regime</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(r => (
                <tr
                  key={r.ticker}
                  className="border-b border-border/60 hover:bg-white/[0.03] cursor-pointer"
                  onClick={() => handlePickTicker(r.ticker)}
                >
                  <td className="px-3 py-2 text-foreground font-semibold">{r.ticker}</td>
                  <td className="px-3 py-2 text-foreground">{fmtPrice(r.currentPrice)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.winnerWindow}d</td>
                  <td className={`px-3 py-2 ${colorPct(r.annualizedReturn)}`}>
                    {fmtPct(r.annualizedReturn * 100)}/yr
                  </td>
                  <td className={`px-3 py-2 ${colorPct(r.forecastPct)}`}>
                    {fmtPct(r.forecastPct)}
                  </td>
                  <td className={`px-3 py-2 ${colorErr(r.predictedTodayErrorPct)}`}>
                    {r.predictedTodayErrorPct.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.rSquared.toFixed(3)}</td>
                  <td className={`px-3 py-2 font-semibold ${colorConf(r.confidenceScore)}`}>
                    {r.confidenceScore}
                  </td>
                  <td className="px-3 py-2 text-[10px]">
                    {r.regimeWarning
                      ? <span className="text-amber-400">⚠ shift</span>
                      : <span className="text-muted-foreground">stable</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer / failed */}
      {(meta || failed.length > 0) && (
        <div className="px-6 py-3 border-t border-border text-[10px] font-mono text-muted-foreground flex items-center justify-between gap-4">
          <div>
            {meta && <>Scope: <span className="text-foreground">{meta.sector}</span> · Source: <span className="text-foreground">{meta.source}</span> · Scored: <span className="text-foreground">{mode === "single" ? sortedRows.length : aggregates.reduce((a, b) => a + b.count, 0)}</span></>}
          </div>
          {failed.length > 0 && (
            <div className="text-amber-500/80">
              Skipped ({failed.length}): {failed.slice(0, 12).join(", ")}{failed.length > 12 ? "…" : ""}
            </div>
          )}
        </div>
      )}
    </>
  );

  if (inline) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-background border border-border rounded-2xl">
        {body}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border rounded-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {body}
      </div>
    </div>
  );
}

function Th({
  label, k, sortKey, sortDir, onSort,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th
      className={`text-left px-3 py-2 text-[10px] uppercase tracking-widest cursor-pointer select-none ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
      onClick={() => onSort(k)}
    >
      {label}{active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );
}
