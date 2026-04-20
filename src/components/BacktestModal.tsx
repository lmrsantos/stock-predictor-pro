// components/BacktestModal.tsx
import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import { runBacktest, BacktestResult } from "@/lib/backtest";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockPoint {
  date: string;
  timestamp: number;
  close: number;
}

interface BacktestModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticker: string;
  stockData: StockPoint[]; // full historical data from DB
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "red" | "blue" | "amber";
}) {
  const accentClass =
    accent === "green"
      ? "text-emerald-400 border-emerald-400/20"
      : accent === "red"
      ? "text-red-400 border-red-400/20"
      : accent === "blue"
      ? "text-sky-400 border-sky-400/20"
      : "text-amber-400 border-amber-400/20";

  return (
    <div
      className={`rounded-xl border bg-white/[0.02] backdrop-blur-sm p-4 flex flex-col gap-1 ${accentClass}`}
    >
      <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
        {label}
      </span>
      <span className={`text-2xl font-semibold font-mono ${accentClass.split(" ")[0]}`}>
        {value}
      </span>
      {sub && <span className="text-[11px] text-zinc-500 font-mono">{sub}</span>}
    </div>
  );
}

function ConfidenceRing({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color =
    score >= 70 ? "#34d399" : score >= 45 ? "#fbbf24" : "#f87171";
  const label =
    score >= 70 ? "HIGH" : score >= 45 ? "MODERATE" : "LOW";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="#27272a"
            strokeWidth="8"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={`${filled} ${circumference - filled}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 1s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-mono font-bold" style={{ color }}>
            {score.toFixed(0)}
          </span>
          <span className="text-[9px] font-mono text-zinc-500">/ 100</span>
        </div>
      </div>
      <span className="text-[10px] font-mono tracking-widest" style={{ color }}>
        {label} CONFIDENCE
      </span>
    </div>
  );
}

function BacktestChart({ result }: { result: BacktestResult }) {
  const chartData = result.actualPath.map((pt, i) => ({
    date: new Date(pt.timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    actual: Number(pt.actual.toFixed(2)),
    regression: Number(result.regressionPath[i].actual.toFixed(2)),
    calibrated: Number(result.calibratedPath[i].actual.toFixed(2)),
  }));

  // Show every nth label to avoid crowding
  const step = Math.max(1, Math.floor(chartData.length / 8));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }}
          interval={step - 1}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }}
          axisLine={false}
          tickLine={false}
          width={60}
          tickFormatter={(v) => `$${v.toLocaleString()}`}
        />
        <Tooltip
          contentStyle={{
            background: "#18181b",
            border: "1px solid #3f3f46",
            borderRadius: 8,
            fontSize: 11,
            fontFamily: "monospace",
          }}
          formatter={(value: number, name: string) => [
            `$${value.toLocaleString()}`,
            name === "actual"
              ? "Actual"
              : name === "regression"
              ? "Initial Regression"
              : "Calibrated",
          ]}
        />
        <Legend
          wrapperStyle={{ fontSize: 10, fontFamily: "monospace", color: "#a1a1aa" }}
        />
        <Line
          type="monotone"
          dataKey="actual"
          stroke="#60a5fa"
          strokeWidth={2}
          dot={false}
          name="actual"
        />
        <Line
          type="monotone"
          dataKey="regression"
          stroke="#71717a"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
          name="regression"
        />
        <Line
          type="monotone"
          dataKey="calibrated"
          stroke="#34d399"
          strokeWidth={2}
          dot={false}
          name="calibrated"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function BacktestModal({
  isOpen,
  onClose,
  ticker,
  stockData,
}: BacktestModalProps) {
  const [lookback, setLookback] = useState<3 | 6>(3);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dataPoints = useMemo(
    () =>
      stockData.map((d) => ({
        date: d.date,
        timestamp: d.timestamp,
        actual: d.close,
      })),
    [stockData]
  );

  const handleRun = () => {
    setRunning(true);
    setError(null);
    setResult(null);

    // Defer to next tick so UI can update before heavy computation
    setTimeout(() => {
      try {
        const res = runBacktest(dataPoints, lookback);
        setResult(res);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setRunning(false);
      }
    }, 50);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
        style={{ boxShadow: "0 0 60px rgba(0,0,0,0.8), 0 0 0 1px #27272a" }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
          <div>
            <h2 className="text-sm font-mono font-semibold text-zinc-100 tracking-widest uppercase">
              Backtest Engine
            </h2>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">
              {ticker} — Regression Calibration via Gradient Descent
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors text-xl font-light"
          >
            ✕
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6">
          {/* Controls */}
          <div className="flex items-center gap-4">
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">
              Lookback Period
            </span>
            <div className="flex gap-2">
              {([3, 6] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setLookback(m)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-mono border transition-all ${
                    lookback === m
                      ? "bg-sky-500/10 border-sky-500/50 text-sky-400"
                      : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
                  }`}
                >
                  {m} Months
                </button>
              ))}
            </div>

            <button
              onClick={handleRun}
              disabled={running || dataPoints.length < 10}
              className="ml-auto px-5 py-2 rounded-lg text-xs font-mono font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {running ? "⟳ Running..." : "▶ Run Backtest"}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs font-mono text-red-400">
              {error}
            </div>
          )}

          {/* Loading state */}
          {running && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
              <span className="text-xs font-mono text-zinc-500 animate-pulse">
                Calibrating slope via gradient descent...
              </span>
            </div>
          )}

          {/* Results */}
          {result && !running && (
            <>
              {/* Chart */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
                  Actual vs Regression Paths
                </p>
                <BacktestChart result={result} />
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  label="Accuracy (MAPE)"
                  value={`${(100 - result.mape).toFixed(1)}%`}
                  sub={`MAPE: ${result.mape.toFixed(2)}%`}
                  accent={result.mape < 3 ? "green" : result.mape < 8 ? "amber" : "red"}
                />
                <StatCard
                  label="Endpoint Error"
                  value={`${result.finalError.toFixed(2)}%`}
                  sub={`vs current price`}
                  accent={result.finalError < 1 ? "green" : result.finalError < 3 ? "amber" : "red"}
                />
                <StatCard
                  label="R² (Fit Quality)"
                  value={result.calibrated.rSquared.toFixed(3)}
                  sub={`${result.calibrated.iterationsRun} iterations`}
                  accent={result.calibrated.rSquared > 0.8 ? "green" : result.calibrated.rSquared > 0.5 ? "amber" : "red"}
                />
                <StatCard
                  label="Converged"
                  value={result.calibrated.converged ? "YES" : "NO"}
                  sub={`LR: ${result.calibrated.learningRate.toExponential(1)}`}
                  accent={result.calibrated.converged ? "green" : "red"}
                />
              </div>

              {/* Calibrated params + confidence */}
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
                    Calibrated Parameters
                  </p>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                    {[
                      { k: "Slope (Δ$/day)", v: result.calibrated.slope.toFixed(4) },
                      { k: "Intercept", v: `$${result.calibrated.intercept.toFixed(2)}` },
                      { k: "R²", v: result.calibrated.rSquared.toFixed(4) },
                      { k: "Iterations", v: result.calibrated.iterationsRun.toString() },
                      { k: "Learning Rate", v: result.calibrated.learningRate.toExponential(2) },
                      { k: "Lookback", v: `${lookback} months` },
                    ].map(({ k, v }) => (
                      <div key={k} className="flex flex-col">
                        <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider">
                          {k}
                        </span>
                        <span className="text-sm font-mono text-zinc-200">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 flex flex-col items-center justify-center min-w-[160px]">
                  <ConfidenceRing score={result.confidenceScore} />
                  <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mt-3 text-center">
                    Forward Forecast<br />Confidence
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Empty state */}
          {!result && !running && !error && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <span className="text-3xl">⟳</span>
              <p className="text-xs font-mono text-zinc-500">
                Select a lookback period and run the backtest.
              </p>
              <p className="text-[10px] font-mono text-zinc-600">
                The engine will calibrate slope parameters until the predicted<br />
                endpoint price converges within 0.5% of the actual current price.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
