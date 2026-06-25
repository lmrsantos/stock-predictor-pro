// src/components/SectorBacktest.tsx
import { useMemo, useState } from "react";
import {
  CURATED_SECTORS, YAHOO_SECTORS,
  runSectorBacktest, SectorBacktestRow,
} from "@/lib/sector-backtest";
import { InfoTooltip } from "@/components/InfoTooltip";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectTicker?: (ticker: string) => void;
}

type SortKey =
  | "ticker" | "currentPrice" | "annualizedReturn"
  | "forecastPct" | "rSquared" | "confidenceScore"
  | "predictedTodayErrorPct";

const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const fmtPrice = (v: number) =>
  `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const colorPct = (v: number) =>
  v >= 0 ? "text-emerald-400" : "text-red-400";
const colorConf = (v: number) =>
  v >= 65 ? "text-emerald-400" : v >= 40 ? "text-amber-400" : "text-red-400";
const colorErr = (v: number) =>
  v <= 1 ? "text-emerald-400" : v <= 3 ? "text-amber-400" : "text-red-400";

export function SectorBacktest({ isOpen, onClose, onSelectTicker }: Props) {
  const [sector, setSector]   = useState<string>("Semiconductors");
  const [source, setSource]   = useState<"curated" | "yahoo">("curated");
  const [maxTickers, setMax]  = useState<number>(30);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string }>({ done: 0, total: 0, current: "" });
  const [rows, setRows]       = useState<SectorBacktestRow[]>([]);
  const [failed, setFailed]   = useState<string[]>([]);
  const [error, setError]     = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("confidenceScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [meta, setMeta]       = useState<{ sector: string; source: string } | null>(null);

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

  async function handleRun() {
    setRunning(true);
    setRows([]); setFailed([]); setError(null);
    setProgress({ done: 0, total: 0, current: "" });
    try {
      const out = await runSectorBacktest(sector, source, {
        maxTickers,
        onProgress: (p) => setProgress({ done: p.done, total: p.total, current: p.currentTicker }),
      });
      setRows(out.rows);
      setFailed(out.failed);
      setMeta({ sector: out.sector, source: out.source });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }

  function handlePickTicker(t: string) {
    onSelectTicker?.(t);
    onClose();
  }

  if (!isOpen) return null;

  const pctDone = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-mono uppercase tracking-widest text-zinc-300">
              Sector Backtest
              <InfoTooltip
                title="Sector Backtest"
                whatIsIt="Runs the calibration-by-hindsight backtest model across every ticker in a sector and ranks them by confidence."
                howToRead="The model fits 5 trend windows (10–40 days) and picks the one that best predicted today's price from 6 months ago. The same model then projects the next 30 days. Higher confidence = lower error + higher R² + better ensemble agreement + stable regime."
              />
            </h2>
            <p className="text-[11px] text-zinc-500 font-mono mt-1">
              Universe → prices → per-ticker backtest → ranked results
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 text-xl leading-none"
            aria-label="Close"
          >✕</button>
        </div>

        {/* Controls */}
        <div className="px-6 py-4 border-b border-zinc-800 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Universe Source</label>
            <select
              value={source}
              onChange={e => {
                const s = e.target.value as "curated" | "yahoo";
                setSource(s);
                const opts = s === "yahoo" ? YAHOO_SECTORS : CURATED_SECTORS;
                if (!opts.includes(sector as any)) setSector(opts[0]);
              }}
              disabled={running}
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs font-mono text-zinc-200"
            >
              <option value="curated">Curated (fast, large-caps)</option>
              <option value="yahoo">Yahoo screener (live universe)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Sector</label>
            <select
              value={sector}
              onChange={e => setSector(e.target.value)}
              disabled={running}
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs font-mono text-zinc-200"
            >
              {sectorOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Max Tickers</label>
            <select
              value={maxTickers}
              onChange={e => setMax(Number(e.target.value))}
              disabled={running}
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs font-mono text-zinc-200"
            >
              {[10, 20, 30, 40, 50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleRun}
              disabled={running}
              className="w-full px-4 py-2 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-mono uppercase tracking-widest"
            >
              {running ? "Running…" : "Run Backtest"}
            </button>
          </div>
        </div>

        {/* Progress / Status */}
        {(running || progress.total > 0) && (
          <div className="px-6 py-3 border-b border-zinc-800 bg-zinc-900/40">
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 mb-1.5">
              <span>{running ? `Processing ${progress.current || "…"}` : "Complete"}</span>
              <span>{progress.done} / {progress.total} ({pctDone}%)</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-200"
                style={{ width: `${pctDone}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="px-6 py-3 border-b border-zinc-800 bg-red-500/10 text-red-300 text-xs font-mono">
            {error}
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-auto">
          {sortedRows.length === 0 && !running && !error && (
            <div className="p-10 text-center text-zinc-500 text-xs font-mono">
              Pick a sector and click <span className="text-zinc-300">Run Backtest</span> to score every ticker.
            </div>
          )}

          {sortedRows.length > 0 && (
            <table className="w-full text-xs font-mono">
              <thead className="sticky top-0 bg-zinc-950 border-b border-zinc-800">
                <tr>
                  <Th label="Ticker"    k="ticker"               sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Price"     k="currentPrice"         sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Winner"    k="annualizedReturn"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Ann. Ret"  k="annualizedReturn"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Forecast"  k="forecastPct"          sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Err %"     k="predictedTodayErrorPct" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="R²"        k="rSquared"             sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Confidence" k="confidenceScore"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-zinc-500">Regime</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map(r => (
                  <tr
                    key={r.ticker}
                    className="border-b border-zinc-900 hover:bg-white/[0.03] cursor-pointer"
                    onClick={() => handlePickTicker(r.ticker)}
                  >
                    <td className="px-3 py-2 text-zinc-200 font-semibold">{r.ticker}</td>
                    <td className="px-3 py-2 text-zinc-300">{fmtPrice(r.currentPrice)}</td>
                    <td className="px-3 py-2 text-zinc-400">{r.winnerWindow}d</td>
                    <td className={`px-3 py-2 ${colorPct(r.annualizedReturn)}`}>
                      {fmtPct(r.annualizedReturn * 100)}/yr
                    </td>
                    <td className={`px-3 py-2 ${colorPct(r.forecastPct)}`}>
                      {fmtPct(r.forecastPct)}
                    </td>
                    <td className={`px-3 py-2 ${colorErr(r.predictedTodayErrorPct)}`}>
                      {r.predictedTodayErrorPct.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{r.rSquared.toFixed(3)}</td>
                    <td className={`px-3 py-2 font-semibold ${colorConf(r.confidenceScore)}`}>
                      {r.confidenceScore}
                    </td>
                    <td className="px-3 py-2 text-[10px]">
                      {r.regimeWarning
                        ? <span className="text-amber-400">⚠ shift</span>
                        : <span className="text-zinc-600">stable</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer / failed */}
        {(meta || failed.length > 0) && (
          <div className="px-6 py-3 border-t border-zinc-800 text-[10px] font-mono text-zinc-500 flex items-center justify-between gap-4">
            <div>
              {meta && <>Sector: <span className="text-zinc-300">{meta.sector}</span> · Source: <span className="text-zinc-300">{meta.source}</span> · Scored: <span className="text-zinc-300">{sortedRows.length}</span></>}
            </div>
            {failed.length > 0 && (
              <div className="text-amber-500/80">
                Skipped ({failed.length}): {failed.slice(0, 12).join(", ")}{failed.length > 12 ? "…" : ""}
              </div>
            )}
          </div>
        )}
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
      className={`text-left px-3 py-2 text-[10px] uppercase tracking-widest cursor-pointer select-none ${active ? "text-zinc-200" : "text-zinc-500 hover:text-zinc-300"}`}
      onClick={() => onSort(k)}
    >
      {label}{active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );
}
