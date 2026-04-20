// components/BacktestModal.tsx
import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import { runBacktest, BacktestResult } from "@/lib/backtest";

interface StockPoint { date: string; timestamp: number; close: number; }

interface BacktestModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticker: string;
  stockData: StockPoint[];
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="rounded-xl border bg-white/[0.02] p-4 flex flex-col gap-1" style={{ borderColor: `${color}30` }}>
      <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{label}</span>
      <span className="text-2xl font-semibold font-mono" style={{ color }}>{value}</span>
      {sub && <span className="text-[11px] text-zinc-500 font-mono">{sub}</span>}
    </div>
  );
}

// ─── Confidence ring ──────────────────────────────────────────────────────────

function ConfidenceRing({ score }: { score: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const color = score >= 70 ? "#34d399" : score >= 45 ? "#fbbf24" : "#f87171";
  const label = score >= 70 ? "HIGH" : score >= 45 ? "MODERATE" : "LOW";
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#27272a" strokeWidth="8" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * circ} ${circ - (score / 100) * circ}`}
            style={{ transition: "stroke-dasharray 1.2s ease" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-mono font-bold" style={{ color }}>{score.toFixed(0)}</span>
          <span className="text-[9px] font-mono text-zinc-500">/ 100</span>
        </div>
      </div>
      <span className="text-[10px] font-mono tracking-widest" style={{ color }}>{label} CONFIDENCE</span>
    </div>
  );
}

// ─── Reconstruction chart ─────────────────────────────────────────────────────

function ReconChart({ result }: { result: BacktestResult }) {
  // Merge actual + reconstructed paths by date
  const actualMap = new Map(result.actualPath.map((d) => [d.date, d.actual]));
  const reconMap = new Map(result.reconstructedPath.map((d) => [d.date, d.actual]));
  const allDates = [...new Set([...actualMap.keys(), ...reconMap.keys()])].sort();

  const step = Math.max(1, Math.floor(allDates.length / 8));
  const data = allDates.map((date) => ({
    date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    actual: actualMap.get(date) ?? null,
    reconstructed: reconMap.get(date) ?? null,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }}
          interval={step - 1} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }}
          axisLine={false} tickLine={false} width={64}
          tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
        <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11, fontFamily: "monospace" }}
          formatter={(v: number, name: string) => [`$${Number(v).toLocaleString()}`, name === "actual" ? "Actual Price" : "AE Reconstruction"]} />
        <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace", color: "#a1a1aa" }} />
        <Line type="monotone" dataKey="actual" stroke="#60a5fa" strokeWidth={2} dot={false} name="actual" />
        <Line type="monotone" dataKey="reconstructed" stroke="#34d399" strokeWidth={1.5} strokeDasharray="5 3" dot={false} name="reconstructed" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Forecast chart ───────────────────────────────────────────────────────────

function ForecastChart({ result }: { result: BacktestResult }) {
  // Show last 20 actual points + forecast
  const tail = result.actualPath.slice(-20).map((d) => ({
    date: new Date(d.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    actual: d.actual,
    forecast: null as number | null,
  }));
  const forecastPts = result.forecastPath.map((d) => ({
    date: new Date(d.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    actual: null as number | null,
    forecast: d.actual,
  }));
  const data = [...tail, ...forecastPts];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }}
          interval={Math.max(1, Math.floor(data.length / 8) - 1)} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }}
          axisLine={false} tickLine={false} width={64}
          tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
        <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11, fontFamily: "monospace" }}
          formatter={(v: number, name: string) => [`$${Number(v).toLocaleString()}`, name === "actual" ? "Actual" : "AE Forecast"]} />
        <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace", color: "#a1a1aa" }} />
        <Line type="monotone" dataKey="actual" stroke="#60a5fa" strokeWidth={2} dot={false} name="actual" connectNulls={false} />
        <Line type="monotone" dataKey="forecast" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" dot={false} name="forecast" connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Training loss chart ──────────────────────────────────────────────────────

function TrainingChart({ result }: { result: BacktestResult }) {
  const step = Math.max(1, Math.floor(result.trainingLog.length / 8));
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={result.trainingLog} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="epoch" tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }}
          interval={step - 1} axisLine={false} tickLine={false} label={{ value: "Epoch", position: "insideBottom", fill: "#52525b", fontSize: 10, fontFamily: "monospace" }} />
        <YAxis tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }}
          axisLine={false} tickLine={false} width={48} />
        <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11, fontFamily: "monospace" }} />
        <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace", color: "#a1a1aa" }} />
        <Line type="monotone" dataKey="reconstructionLoss" stroke="#a78bfa" strokeWidth={1.5} dot={false} name="MSE Loss" />
        <Line type="monotone" dataKey="forecastError" stroke="#fb923c" strokeWidth={1.5} dot={false} name="Endpoint Error %" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Latent vector display ────────────────────────────────────────────────────

function LatentDisplay({ vector }: { vector: number[] }) {
  const max = Math.max(...vector.map(Math.abs)) || 1;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Latent Space (4D Market Rhythm)</p>
      <div className="grid grid-cols-4 gap-2">
        {vector.map((v, i) => {
          const pct = Math.abs(v) / max;
          const color = v >= 0 ? "#34d399" : "#f87171";
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="text-[9px] font-mono text-zinc-500">z{i + 1}</span>
              <div className="w-full h-16 rounded bg-zinc-800 flex flex-col justify-end overflow-hidden">
                <div className="w-full rounded" style={{ height: `${pct * 100}%`, background: color, transition: "height 0.8s ease" }} />
              </div>
              <span className="text-[9px] font-mono" style={{ color }}>{v.toFixed(3)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function BacktestModal({ isOpen, onClose, ticker, stockData }: BacktestModalProps) {
  const [lookback, setLookback] = useState<3 | 6>(3);
  const [activeTab, setActiveTab] = useState<"reconstruction" | "forecast" | "training">("reconstruction");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  const dataPoints = useMemo(() => stockData.map((d) => ({ date: d.date, timestamp: d.timestamp, actual: d.close })), [stockData]);

  const handleRun = () => {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress("Initializing autoencoder weights (Xavier)...");

    const steps = [
      "Building sliding windows from price history...",
      "Training encoder: compressing price patterns to latent space...",
      "Backpropagating reconstruction error through all layers...",
      "Calibrating latent rhythm until endpoint converges...",
      "Training forecaster head (self-supervised)...",
      "Decoding latent vector into forward projection...",
    ];

    let s = 0;
    const iv = setInterval(() => {
      if (s < steps.length) setProgress(steps[s++]);
      else clearInterval(iv);
    }, 400);

    setTimeout(() => {
      clearInterval(iv);
      try {
        const res = runBacktest(dataPoints, lookback);
        setResult(res);
        setProgress("");
      } catch (e) {
        setError((e as Error).message);
        setProgress("");
      } finally {
        setRunning(false);
      }
    }, steps.length * 400 + 200);
  };

  if (!isOpen) return null;

  const accentColor = (val: number, lo: number, hi: number) =>
    val < lo ? "#34d399" : val < hi ? "#fbbf24" : "#f87171";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950"
        style={{ boxShadow: "0 0 80px rgba(0,0,0,0.9), 0 0 0 1px #27272a" }}>

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
          <div>
            <h2 className="text-sm font-mono font-semibold text-zinc-100 tracking-widest uppercase">
              Autoencoder Backtest
            </h2>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">
              {ticker} — Unsupervised latent pattern learning + backpropagation
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors text-xl font-light">✕</button>
        </div>

        <div className="p-6 flex flex-col gap-6">

          {/* Architecture diagram (text) */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
            <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">Architecture</p>
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { label: "Input", sub: "20 prices" },
                { label: "Encoder", sub: "→ 10 → 4" },
                { label: "Latent", sub: "4D rhythm" },
                { label: "Decoder", sub: "4 → 10 → 20" },
                { label: "Recon Loss", sub: "MSE (unsupervised)" },
                { label: "Forecaster", sub: "4 → 10 → N days" },
              ].map((node, i, arr) => (
                <div key={node.label} className="flex items-center gap-2">
                  <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-center">
                    <div className="text-[10px] font-mono text-zinc-200">{node.label}</div>
                    <div className="text-[9px] font-mono text-zinc-500">{node.sub}</div>
                  </div>
                  {i < arr.length - 1 && <span className="text-zinc-600 text-xs">→</span>}
                </div>
              ))}
            </div>
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
            <button onClick={handleRun} disabled={running || dataPoints.length < 50}
              className="ml-auto px-5 py-2 rounded-lg text-xs font-mono font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              {running ? "⟳ Training..." : "▶ Run Autoencoder"}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs font-mono text-red-400">{error}</div>
          )}

          {/* Loading */}
          {running && (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
              <span className="text-xs font-mono text-zinc-400 animate-pulse text-center max-w-xs">{progress}</span>
            </div>
          )}

          {/* Results */}
          {result && !running && (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Accuracy (MAPE)" value={`${(100 - result.mape).toFixed(1)}%`}
                  sub={`MAPE: ${result.mape.toFixed(2)}%`} color={accentColor(result.mape, 3, 8)} />
                <StatCard label="Endpoint Error" value={`${result.finalForecastError.toFixed(2)}%`}
                  sub="recon vs current" color={accentColor(result.finalForecastError, 1, 3)} />
                <StatCard label="Epochs Run" value={result.epochsRun.toString()}
                  sub={result.converged ? "✓ Converged" : "Max reached"} color={result.converged ? "#34d399" : "#fbbf24"} />
                <StatCard label="Lookback" value={`${lookback}mo`}
                  sub={`${result.actualPath.length} data points`} color="#60a5fa" />
              </div>

              {/* Confidence + latent */}
              <div className="flex flex-col md:flex-row gap-4">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 flex flex-col items-center justify-center min-w-[160px]">
                  <ConfidenceRing score={result.confidenceScore} />
                  <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mt-3 text-center">
                    Forward Forecast<br />Confidence
                  </p>
                </div>
                <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <LatentDisplay vector={result.latentVector} />
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 border-b border-zinc-800 pb-0">
                {(["reconstruction", "forecast", "training"] as const).map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-[10px] font-mono uppercase tracking-widest border-b-2 transition-all ${activeTab === tab ? "border-sky-500 text-sky-400" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>
                    {tab === "reconstruction" ? "Actual vs Reconstruction" : tab === "forecast" ? "Forward Forecast" : "Training Loss"}
                  </button>
                ))}
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                {activeTab === "reconstruction" && (
                  <>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
                      Actual price path vs autoencoder reconstruction
                    </p>
                    <ReconChart result={result} />
                  </>
                )}
                {activeTab === "forecast" && (
                  <>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
                      Learned latent rhythm decoded into forward price projection
                    </p>
                    <ForecastChart result={result} />
                  </>
                )}
                {activeTab === "training" && (
                  <>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
                      Reconstruction MSE loss + endpoint calibration error per epoch
                    </p>
                    <TrainingChart result={result} />
                  </>
                )}
              </div>
            </>
          )}

          {/* Empty state */}
          {!result && !running && !error && (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
              <span className="text-4xl">🧠</span>
              <p className="text-xs font-mono text-zinc-500">Select a lookback period and run the autoencoder.</p>
              <p className="text-[10px] font-mono text-zinc-600 max-w-sm">
                The network will compress price history into a 4-dimensional latent<br />
                representation, then decode it forward — with no external labels.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
