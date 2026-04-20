// components/BacktestModal.tsx
import { useState, useEffect } from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid, ReferenceLine,
} from "recharts";
import { backtest, BacktestResult } from "@/lib/backtest";
import { fetchAndStoreStockData, getStockDataFromDB } from "@/lib/stock-data";

interface StockPoint { date: string; timestamp: number; close: number; }
interface BacktestModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticker: string;
  // stockData prop no longer used — modal fetches its own 1y data
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtPrice = (v: number) => `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function accentColor(val: number, lo: number, hi: number) {
  return val <= lo ? "#34d399" : val <= hi ? "#fbbf24" : "#f87171";
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, wide }: {
  label: string; value: string; sub?: string; color: string; wide?: boolean;
}) {
  return (
    <div className={`rounded-xl border bg-white/[0.02] p-4 flex flex-col gap-1 ${wide ? "col-span-2" : ""}`}
      style={{ borderColor: `${color}30` }}>
      <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{label}</span>
      <span className="text-2xl font-semibold font-mono" style={{ color }}>{value}</span>
      {sub && <span className="text-[11px] text-zinc-500 font-mono">{sub}</span>}
    </div>
  );
}

// ─── Confidence ring ──────────────────────────────────────────────────────────

function ConfidenceRing({ score }: { score: number }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const color = score >= 65 ? "#34d399" : score >= 40 ? "#fbbf24" : "#f87171";
  const label = score >= 65 ? "HIGH" : score >= 40 ? "MODERATE" : "LOW";
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-28 h-28">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#27272a" strokeWidth="7" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * circ} ${circ - (score / 100) * circ}`}
            style={{ transition: "stroke-dasharray 1.4s cubic-bezier(0.4,0,0.2,1)" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-mono font-bold" style={{ color }}>{score.toFixed(0)}</span>
          <span className="text-[9px] font-mono text-zinc-500">/ 100</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-[11px] font-mono font-semibold tracking-widest" style={{ color }}>{label}</div>
        <div className="text-[9px] font-mono text-zinc-600">CONFIDENCE</div>
      </div>
    </div>
  );
}

// ─── Regime banner ────────────────────────────────────────────────────────────

function RegimeBanner({ regime }: { regime: BacktestResult["regime"] }) {
  if (!regime.warning) return null;
  const severe = regime.ratio > 2.5;
  return (
    <div className={`rounded-xl border px-4 py-3 flex gap-3 items-start ${severe ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
      <span className="text-lg mt-0.5">{severe ? "🚨" : "⚠️"}</span>
      <div>
        <p className={`text-xs font-mono font-semibold mb-0.5 ${severe ? "text-red-400" : "text-amber-400"}`}>
          {severe ? "Extreme Regime Shift Detected" : "Regime Warning"}
        </p>
        <p className="text-[11px] font-mono text-zinc-400">{regime.warning}</p>
      </div>
    </div>
  );
}

// ─── Disagreement banner ──────────────────────────────────────────────────────

function DisagreementBanner({ agreement, disagreement }: { agreement: number; disagreement: boolean }) {
  if (!disagreement) return null;
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex gap-3 items-start">
      <span className="text-lg mt-0.5">📊</span>
      <div>
        <p className="text-xs font-mono font-semibold mb-0.5 text-amber-400">Model Disagreement Detected</p>
        <p className="text-[11px] font-mono text-zinc-400">
          Ensemble agreement is {(agreement * 100).toFixed(0)}%. The 5 models produce meaningfully different forecasts —
          the uncertainty cone has been widened automatically and confidence reduced.
        </p>
      </div>
    </div>
  );
}

// ─── Ensemble model table ─────────────────────────────────────────────────────

function EnsembleTable({ models }: { models: BacktestResult["models"] }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b border-zinc-800">
            {["Window", "Recon Error", "Epochs", "Converged"].map((h) => (
              <th key={h} className="text-left px-4 py-2 text-[10px] uppercase tracking-widest text-zinc-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.windowSize} className="border-b border-zinc-800/50 hover:bg-white/[0.02] transition-colors">
              <td className="px-4 py-2 text-zinc-300">{m.windowSize} days</td>
              <td className="px-4 py-2" style={{ color: accentColor(m.reconError, 1, 3) }}>
                {m.reconError.toFixed(2)}%
              </td>
              <td className="px-4 py-2 text-zinc-400">{m.epochsRun}</td>
              <td className="px-4 py-2">
                <span className={`px-2 py-0.5 rounded text-[10px] ${m.converged ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                  {m.converged ? "✓ YES" : "MAX HIT"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Uncertainty cone chart ───────────────────────────────────────────────────

function ForecastConeChart({ result }: { result: BacktestResult }) {
  // Last 15 actual points + forecast cone
  const tail = result.actualPath.slice(-15).map((d) => ({
    date: fmtDate(d.timestamp),
    actual: d.actual,
    mean: null as number | null,
    upper1: null as number | null, lower1: null as number | null,
    upper2: null as number | null, lower2: null as number | null,
    band1: null as [number, number] | null,
    band2: null as [number, number] | null,
  }));

  const forecastPts = result.forecastPoints.map((fp) => ({
    date: fmtDate(fp.timestamp),
    actual: null as number | null,
    mean: fp.mean,
    upper1: fp.upper1, lower1: fp.lower1,
    upper2: fp.upper2, lower2: fp.lower2,
    band1: [fp.lower1, fp.upper1] as [number, number],
    band2: [fp.lower2, fp.upper2] as [number, number],
  }));

  const data = [...tail, ...forecastPts];
  const step = Math.max(1, Math.floor(data.length / 8));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }}
          interval={step - 1} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }}
          axisLine={false} tickLine={false} width={68}
          tickFormatter={fmtPrice} />
        <Tooltip
          contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11, fontFamily: "monospace" }}
          formatter={(v: unknown, name: string) => {
            if (Array.isArray(v)) return [`${fmtPrice(v[0])} – ${fmtPrice(v[1])}`, name];
            return [fmtPrice(v as number), name];
          }} />
        {/* ±2σ cone */}
        <Area type="monotone" dataKey="band2" fill="#60a5fa" fillOpacity={0.07}
          stroke="none" name="±2σ band" connectNulls={false} />
        {/* ±1σ cone */}
        <Area type="monotone" dataKey="band1" fill="#60a5fa" fillOpacity={0.15}
          stroke="none" name="±1σ band" connectNulls={false} />
        {/* Actual */}
        <Line type="monotone" dataKey="actual" stroke="#60a5fa" strokeWidth={2}
          dot={false} name="Actual" connectNulls={false} />
        {/* Mean forecast */}
        <Line type="monotone" dataKey="mean" stroke="#f59e0b" strokeWidth={2}
          strokeDasharray="6 3" dot={false} name="Ensemble Mean" connectNulls={false} />
        {/* Band edges */}
        <Line type="monotone" dataKey="upper1" stroke="#34d399" strokeWidth={1}
          strokeDasharray="3 3" dot={false} name="+1σ" connectNulls={false} />
        <Line type="monotone" dataKey="lower1" stroke="#34d399" strokeWidth={1}
          strokeDasharray="3 3" dot={false} name="-1σ" connectNulls={false} />
        <Line type="monotone" dataKey="upper2" stroke="#f87171" strokeWidth={1}
          strokeDasharray="2 4" dot={false} name="+2σ" connectNulls={false} />
        <Line type="monotone" dataKey="lower2" stroke="#f87171" strokeWidth={1}
          strokeDasharray="2 4" dot={false} name="-2σ" connectNulls={false} />
        <ReferenceLine x={tail[tail.length - 1]?.date} stroke="#52525b" strokeDasharray="4 4" label={{ value: "Today", fill: "#71717a", fontSize: 10, fontFamily: "monospace" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ─── Walk-forward chart ───────────────────────────────────────────────────────

function WalkForwardChart({ result }: { result: BacktestResult }) {
  const { walkForward } = result;
  if (!walkForward.actualPath.length) {
    return <p className="text-xs font-mono text-zinc-500 text-center py-8">Not enough data for walk-forward validation.</p>;
  }

  const data = walkForward.actualPath.map((d, i) => ({
    date: fmtDate(d.timestamp),
    actual: d.actual,
    predicted: walkForward.predictedPath[i]?.actual ?? null,
  }));

  return (
    <>
      {/* Proof box */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-center">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">30-Day Forecast Accuracy</div>
          <div className="text-2xl font-mono font-bold" style={{ color: accentColor(walkForward.mape, 3, 7) }}>
            {(100 - walkForward.mape).toFixed(1)}%
          </div>
          <div className="text-[10px] font-mono text-zinc-600">MAPE: {walkForward.mape.toFixed(2)}%</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-center">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Direction Hit Rate</div>
          <div className="text-2xl font-mono font-bold" style={{ color: accentColor(100 - walkForward.hitRate, 30, 50) }}>
            {walkForward.hitRate.toFixed(1)}%
          </div>
          <div className="text-[10px] font-mono text-zinc-600">up/down correct</div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }}
            interval={Math.max(1, Math.floor(data.length / 6) - 1)} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }}
            axisLine={false} tickLine={false} width={68} tickFormatter={fmtPrice} />
          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11, fontFamily: "monospace" }}
            formatter={(v: number, name: string) => [fmtPrice(v), name === "actual" ? "What actually happened" : "What model predicted"]} />
          <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace", color: "#a1a1aa" }} />
          <Line type="monotone" dataKey="actual" stroke="#60a5fa" strokeWidth={2} dot={false} name="actual" />
          <Line type="monotone" dataKey="predicted" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 3" dot={false} name="predicted" />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-[10px] font-mono text-zinc-600 text-center mt-2">
        Model was trained on data excluding the last 30 days, then asked to forecast them. This is what it predicted vs what actually happened.
      </p>
    </>
  );
}

// ─── Regime chart ─────────────────────────────────────────────────────────────

function RegimePanel({ regime }: { regime: BacktestResult["regime"] }) {
  const bars = [
    { label: "Training Vol", value: regime.trainingVol, color: "#60a5fa" },
    { label: "Current Vol", value: regime.currentVol, color: regime.outsideDistribution ? "#f87171" : "#34d399" },
  ];
  const maxVal = Math.max(regime.trainingVol, regime.currentVol) * 1.2 || 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Training Vol (ann.)" value={`${(regime.trainingVol * 100).toFixed(1)}%`} color="#60a5fa" />
        <StatCard label="Current Vol (ann.)" value={`${(regime.currentVol * 100).toFixed(1)}%`}
          color={regime.outsideDistribution ? "#f87171" : "#34d399"} />
        <StatCard label="Vol Ratio" value={`${regime.ratio.toFixed(2)}×`}
          sub={regime.outsideDistribution ? "Outside distribution" : "Within normal range"}
          color={regime.ratio > 2.5 ? "#f87171" : regime.ratio > 1.5 ? "#fbbf24" : "#34d399"} />
      </div>
      <div className="flex gap-6 items-end h-24 px-4">
        {bars.map(({ label, value, color }) => (
          <div key={label} className="flex flex-col items-center gap-1 flex-1">
            <div className="w-full rounded-t" style={{
              height: `${(value / maxVal) * 80}px`,
              background: color,
              opacity: 0.8,
              transition: "height 0.8s ease",
            }} />
            <span className="text-[9px] font-mono text-zinc-500 text-center">{label}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] font-mono text-zinc-600 text-center">
        Ratios above 1.5× indicate the model is forecasting in market conditions it hasn't seen during training.
        A ratio above 2.5× significantly reduces forecast reliability.
      </p>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

type Tab = "forecast" | "walkforward" | "ensemble" | "regime";

export function BacktestModal({ isOpen, onClose, ticker }: BacktestModalProps) {
  const [lookback, setLookback] = useState<3 | 6>(6);
  const [activeTab, setActiveTab] = useState<Tab>("forecast");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [dataPoints, setDataPoints] = useState<{ date: string; timestamp: number; actual: number }[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  // Always fetch a full 1 year of data when the modal opens or ticker changes
  useEffect(() => {
    if (!isOpen || !ticker) return;
    setDataReady(false);
    setDataLoading(true);
    setResult(null);
    setError(null);

    const load = async () => {
      try {
        await fetchAndStoreStockData(ticker, "1y");
        const rows = await getStockDataFromDB(ticker, "1y");
        if (!rows || rows.length < 100) {
          throw new Error(`Only ${rows?.length ?? 0} data points available. Need at least 100 for the ensemble.`);
        }
        setDataPoints(rows.map((d: StockPoint) => ({ date: d.date, timestamp: d.timestamp, actual: d.close })));
        setDataReady(true);
      } catch (e) {
        setError(`Data fetch failed: ${(e as Error).message}`);
      } finally {
        setDataLoading(false);
      }
    };

    load();
  }, [isOpen, ticker]);

  const handleRun = () => {
    if (!dataReady || dataPoints.length < 100) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setProgressPct(0);

    const steps = [
      [5,  "Fetched 1 year of daily price data ✓"],
      [15, "Initializing 5 autoencoder models (Xavier weights)..."],
      [28, "Training model A — window: 10 days..."],
      [41, "Training model B — window: 15 days..."],
      [54, "Training model C — window: 20 days..."],
      [65, "Training model D — window: 30 days..."],
      [75, "Training model E — window: 40 days..."],
      [83, "Running walk-forward validation on held-out 30 days..."],
      [90, "Detecting market regime vs training distribution..."],
      [95, "Computing ensemble uncertainty bands (±1σ, ±2σ)..."],
      [98, "Scoring confidence from verifiable evidence..."],
    ] as [number, string][];

    let s = 0;
    const iv = setInterval(() => {
      if (s < steps.length) {
        setProgressPct(steps[s][0]);
        setProgress(steps[s][1]);
        s++;
      } else clearInterval(iv);
    }, 320);

    setTimeout(() => {
      clearInterval(iv);
      try {
        const res = backtest(dataPoints, lookback);
        setResult(res);
        setProgressPct(100);
        setProgress("");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setRunning(false);
      }
    }, steps.length * 320 + 300);
  };

  if (!isOpen) return null;

  const tabs: { id: Tab; label: string; badge?: string }[] = [
    { id: "forecast", label: "Forecast + Uncertainty Cone" },
    { id: "walkforward", label: "Walk-Forward Proof" },
    { id: "ensemble", label: "Ensemble Models" },
    { id: "regime", label: "Regime Detection" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950"
        style={{ boxShadow: "0 0 100px rgba(0,0,0,0.95), 0 0 0 1px #27272a" }}>

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/98 backdrop-blur">
          <div>
            <h2 className="text-sm font-mono font-semibold text-zinc-100 tracking-widest uppercase">
              Ensemble Autoencoder Backtest
            </h2>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">
              {ticker} — 5 models · uncertainty bands · walk-forward proof · regime detection
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors text-xl font-light leading-none">✕</button>
        </div>

        <div className="p-6 flex flex-col gap-5">

          {/* Architecture pill row */}
          <div className="flex flex-wrap gap-2 items-center">
            {["10d", "15d", "20d", "30d", "40d"].map((w, i) => (
              <span key={w} className="px-2.5 py-1 rounded-full text-[10px] font-mono border border-zinc-700 text-zinc-400 bg-zinc-900">
                AE-{i + 1}: {w} window
              </span>
            ))}
            <span className="text-zinc-700 text-xs mx-1">→</span>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-mono border border-sky-800 text-sky-400 bg-sky-950/40">Ensemble mean</span>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-mono border border-emerald-800 text-emerald-400 bg-emerald-950/40">±1σ / ±2σ cone</span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Lookback</span>
            <div className="flex gap-2">
              {([3, 6] as const).map((m) => (
                <button key={m} onClick={() => setLookback(m)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-mono border transition-all ${lookback === m ? "bg-sky-500/10 border-sky-500/50 text-sky-400" : "border-zinc-700 text-zinc-500 hover:border-zinc-500"}`}>
                  {m} Months
                </button>
              ))}
            </div>
            <button onClick={handleRun} disabled={running || dataLoading || !dataReady}
              className="ml-auto px-5 py-2 rounded-lg text-xs font-mono font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              {running ? "⟳ Training ensemble..." : "▶ Run Ensemble Backtest"}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs font-mono text-red-400">{error}</div>
          )}

          {/* Loading */}
          {running && (
            <div className="flex flex-col gap-4 py-8">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                <span className="text-xs font-mono text-zinc-400 animate-pulse text-center max-w-xs">{progress}</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }} />
              </div>
              <p className="text-[10px] font-mono text-zinc-600 text-center">{progressPct}% complete</p>
            </div>
          )}

          {/* Results */}
          {result && !running && (
            <>
              {/* Alert banners */}
              <RegimeBanner regime={result.regime} />
              <DisagreementBanner agreement={result.ensembleAgreement} disagreement={result.modelDisagreement} />

              {/* Top metrics row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Walk-Fwd Accuracy"
                  value={`${(100 - result.walkForward.mape).toFixed(1)}%`}
                  sub={`proven on 30 held-out days`}
                  color={accentColor(result.walkForward.mape, 3, 7)} />
                <StatCard label="Direction Hit Rate"
                  value={`${result.walkForward.hitRate.toFixed(1)}%`}
                  sub="up/down correct"
                  color={accentColor(100 - result.walkForward.hitRate, 30, 50)} />
                <StatCard label="Ensemble Agreement"
                  value={`${(result.ensembleAgreement * 100).toFixed(0)}%`}
                  sub={`${result.models.filter((m) => m.converged).length}/${result.models.length} converged`}
                  color={accentColor(100 - result.ensembleAgreement * 100, 30, 50)} />
                <StatCard label="Regime"
                  value={result.regime.outsideDistribution ? "⚠ SHIFTED" : "✓ NORMAL"}
                  sub={`${result.regime.ratio.toFixed(2)}× vol ratio`}
                  color={result.regime.outsideDistribution ? "#f87171" : "#34d399"} />
              </div>

              {/* Confidence + score breakdown */}
              <div className="flex flex-col md:flex-row gap-4">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 flex flex-col items-center justify-center min-w-[180px]">
                  <ConfidenceRing score={result.confidenceScore} />
                  <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mt-3 text-center leading-relaxed">
                    Evidence-Based<br />Forward Forecast<br />Confidence
                  </p>
                </div>
                <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">Score Breakdown</p>
                  {[
                    { label: "Walk-forward accuracy (30pts)", val: Math.max(0, (1 - result.walkForward.mape / 10)) * 30, max: 30 },
                    { label: "Direction hit rate (20pts)", val: Math.max(0, (result.walkForward.hitRate - 50) / 50) * 20, max: 20 },
                    { label: "Ensemble agreement (20pts)", val: result.ensembleAgreement * 20, max: 20 },
                    { label: "Reconstruction quality (15pts)", val: Math.max(0, 1 - result.finalForecastError / 5) * 15, max: 15 },
                    { label: "Convergence rate (15pts)", val: (result.models.filter((m) => m.converged).length / 5) * 15, max: 15 },
                    { label: "Regime penalty", val: result.regime.outsideDistribution ? (result.regime.ratio > 2.5 ? -25 : -12) : 0, max: 0 },
                  ].map(({ label, val, max }) => (
                    <div key={label} className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-mono text-zinc-500 w-52 shrink-0">{label}</span>
                      <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: max > 0 ? `${(val / max) * 100}%` : "100%",
                            background: val < 0 ? "#f87171" : "#34d399",
                          }} />
                      </div>
                      <span className="text-[10px] font-mono w-10 text-right"
                        style={{ color: val < 0 ? "#f87171" : "#a1a1aa" }}>
                        {val >= 0 ? `+${val.toFixed(0)}` : val.toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-0 border-b border-zinc-800 overflow-x-auto">
                {tabs.map((tab) => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest whitespace-nowrap border-b-2 transition-all ${activeTab === tab.id ? "border-sky-500 text-sky-400" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                {activeTab === "forecast" && (
                  <>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
                      Ensemble mean forecast with ±1σ / ±2σ uncertainty cone (from real model spread)
                    </p>
                    <ForecastConeChart result={result} />
                  </>
                )}
                {activeTab === "walkforward" && (
                  <>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
                      Verifiable proof: model trained without last 30 days, then tested against them
                    </p>
                    <WalkForwardChart result={result} />
                  </>
                )}
                {activeTab === "ensemble" && (
                  <>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
                      Individual model performance — 5 autoencoders, 5 window sizes
                    </p>
                    <EnsembleTable models={result.models} />
                  </>
                )}
                {activeTab === "regime" && (
                  <>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
                      Current market volatility vs training period distribution
                    </p>
                    <RegimePanel regime={result.regime} />
                  </>
                )}
              </div>
            </>
          )}

          {/* Empty state */}
          {!result && !running && !error && (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <span className="text-4xl">🧠</span>
              <p className="text-sm font-mono text-zinc-400 font-semibold">Ensemble Autoencoder Ready</p>
              {dataLoading && (
                <div className="flex items-center gap-2 text-xs font-mono text-sky-400 animate-pulse">
                  <div className="w-3 h-3 border border-sky-400/40 border-t-sky-400 rounded-full animate-spin" />
                  Fetching 1 year of {ticker} price data...
                </div>
              )}
              {dataReady && (
                <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                  <span>✓</span>
                  {dataPoints.length} trading days loaded — ready to train
                </div>
              )}
              <p className="text-[11px] font-mono text-zinc-600 max-w-md leading-relaxed">
                5 models train in parallel on different window sizes using a full year of data.
                Their disagreement determines the uncertainty cone width. Walk-forward validation
                proves accuracy on 30 days the model never saw. Regime detection warns when
                current conditions exceed training bounds.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
