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
  stockData: StockPoint[];
}

type Accent = "success" | "danger" | "info" | "warning";

const accentTextClass: Record<Accent, string> = {
  success: "text-accent-success",
  danger: "text-accent-danger",
  info: "text-accent-info",
  warning: "text-accent-warning",
};

const accentBorderClass: Record<Accent, string> = {
  success: "border-accent-success/20",
  danger: "border-accent-danger/20",
  info: "border-accent-info/20",
  warning: "border-accent-warning/20",
};

function cssVar(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function hsl(token: string): string {
  const v = cssVar(token);
  return v ? `hsl(${v})` : "";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent = "info",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: Accent;
}) {
  return (
    <div
      className={`rounded-xl border bg-card/40 backdrop-blur-sm p-4 flex flex-col gap-1 ${accentBorderClass[accent]}`}
    >
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className={`text-2xl font-semibold font-mono ${accentTextClass[accent]}`}>
        {value}
      </span>
      {sub && <span className="text-[11px] text-muted-foreground font-mono">{sub}</span>}
    </div>
  );
}

function ConfidenceRing({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;

  const accent: Accent = score >= 70 ? "success" : score >= 45 ? "warning" : "danger";
  const colorVar =
    accent === "success" ? "--accent-success" : accent === "warning" ? "--accent-warning" : "--accent-danger";
  const color = hsl(colorVar);
  const label = score >= 70 ? "HIGH" : score >= 45 ? "MODERATE" : "LOW";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke={hsl("--muted")} strokeWidth="8" />
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
          <span className={`text-xl font-mono font-bold ${accentTextClass[accent]}`}>
            {score.toFixed(0)}
          </span>
          <span className="text-[9px] font-mono text-muted-foreground">/ 100</span>
        </div>
      </div>
      <span className={`text-[10px] font-mono tracking-widest ${accentTextClass[accent]}`}>
        {label} CONFIDENCE
      </span>
    </div>
  );
}

function BacktestChart({ result }: { result: BacktestResult }) {
  const reconMap = new Map(result.reconstructedPath.map((p) => [p.timestamp, p.actual]));

  const historical = result.actualPath.map((pt) => ({
    date: new Date(pt.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    actual: Number(pt.actual.toFixed(2)),
    reconstructed: reconMap.has(pt.timestamp)
      ? Number((reconMap.get(pt.timestamp) as number).toFixed(2))
      : null,
    forecast: null as number | null,
  }));

  const forecast = result.forecastPath.map((pt) => ({
    date: new Date(pt.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    actual: null as number | null,
    reconstructed: null as number | null,
    forecast: Number(pt.actual.toFixed(2)),
  }));

  const chartData = [...historical, ...forecast];
  const step = Math.max(1, Math.floor(chartData.length / 8));

  const gridColor = hsl("--border");
  const tickColor = hsl("--muted-foreground");
  const tooltipBg = hsl("--popover");
  const tooltipBorder = hsl("--border");
  const tooltipFg = hsl("--popover-foreground");
  const actualColor = hsl("--accent-info");
  const reconColor = hsl("--muted-foreground");
  const forecastColor = hsl("--accent-success");

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: tickColor, fontFamily: "monospace" }}
          interval={step - 1}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: tickColor, fontFamily: "monospace" }}
          axisLine={false}
          tickLine={false}
          width={60}
          tickFormatter={(v) => `$${Number(v).toLocaleString()}`}
        />
        <Tooltip
          contentStyle={{
            background: tooltipBg,
            border: `1px solid ${tooltipBorder}`,
            color: tooltipFg,
            borderRadius: 8,
            fontSize: 11,
            fontFamily: "monospace",
          }}
          formatter={(value: number, name: string) => [
            `$${Number(value).toLocaleString()}`,
            name === "actual" ? "Actual" : name === "reconstructed" ? "Reconstructed" : "Forecast",
          ]}
        />
        <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace", color: tickColor }} />
        <Line type="monotone" dataKey="actual" stroke={actualColor} strokeWidth={2} dot={false} name="actual" connectNulls />
        <Line
          type="monotone"
          dataKey="reconstructed"
          stroke={reconColor}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
          name="reconstructed"
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="forecast"
          stroke={forecastColor}
          strokeWidth={2}
          dot={false}
          name="forecast"
          connectNulls
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/75 backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-card/90 backdrop-blur">
          <div>
            <h2 className="text-sm font-mono font-semibold text-foreground tracking-widest uppercase">
              Backtest Engine
            </h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {ticker} — Unsupervised Autoencoder + Forecaster
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-xl font-light"
          >
            ✕
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6">
          {/* Controls */}
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
              Lookback Period
            </span>
            <div className="flex gap-2">
              {([3, 6] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setLookback(m)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-mono border transition-all ${
                    lookback === m
                      ? "bg-accent-info/10 border-accent-info/50 text-accent-info"
                      : "border-border text-muted-foreground hover:border-muted-foreground"
                  }`}
                >
                  {m} Months
                </button>
              ))}
            </div>

            <button
              onClick={handleRun}
              disabled={running || dataPoints.length < 10}
              className="ml-auto px-5 py-2 rounded-lg text-xs font-mono font-semibold bg-accent-success/10 border border-accent-success/30 text-accent-success hover:bg-accent-success/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {running ? "⟳ Running..." : "▶ Run Backtest"}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3 text-xs font-mono text-accent-danger">
              {error}
            </div>
          )}

          {/* Loading state */}
          {running && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <div className="w-8 h-8 border-2 border-accent-success/30 border-t-accent-success rounded-full animate-spin" />
              <span className="text-xs font-mono text-muted-foreground animate-pulse">
                Training autoencoder via backpropagation...
              </span>
            </div>
          )}

          {/* Results */}
          {result && !running && (
            <>
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
                  Actual · Reconstructed · Forecast
                </p>
                <BacktestChart result={result} />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  label="Accuracy (MAPE)"
                  value={`${Math.max(0, 100 - result.mape).toFixed(1)}%`}
                  sub={`MAPE: ${result.mape.toFixed(2)}%`}
                  accent={result.mape < 3 ? "success" : result.mape < 8 ? "warning" : "danger"}
                />
                <StatCard
                  label="Endpoint Error"
                  value={`${result.finalForecastError.toFixed(2)}%`}
                  sub={`reconstruction vs actual`}
                  accent={
                    result.finalForecastError < 1
                      ? "success"
                      : result.finalForecastError < 3
                      ? "warning"
                      : "danger"
                  }
                />
                <StatCard
                  label="Epochs Run"
                  value={result.epochsRun.toString()}
                  sub={`final loss: ${(result.trainingLog.at(-1)?.reconstructionLoss ?? 0).toExponential(2)}`}
                  accent="info"
                />
                <StatCard
                  label="Converged"
                  value={result.converged ? "YES" : "NO"}
                  sub={`latent dim: ${result.latentVector.length}`}
                  accent={result.converged ? "success" : "warning"}
                />
              </div>

              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 rounded-xl border border-border bg-muted/30 p-4">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
                    Latent Representation
                  </p>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                    {[
                      { k: "Lookback", v: `${lookback} months` },
                      { k: "Forecast Horizon", v: `${result.forecastPath.length} days` },
                      { k: "Price Min", v: `$${result.priceMin.toFixed(2)}` },
                      { k: "Price Max", v: `$${result.priceMax.toFixed(2)}` },
                      {
                        k: "Final Recon Loss",
                        v: (result.trainingLog.at(-1)?.reconstructionLoss ?? 0).toExponential(2),
                      },
                      {
                        k: "Latent Vector",
                        v: result.latentVector.map((v) => v.toFixed(2)).join(", "),
                      },
                    ].map(({ k, v }) => (
                      <div key={k} className="flex flex-col min-w-0">
                        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                          {k}
                        </span>
                        <span className="text-sm font-mono text-foreground truncate">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/30 p-4 flex flex-col items-center justify-center min-w-[160px]">
                  <ConfidenceRing score={result.confidenceScore} />
                  <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mt-3 text-center">
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
              <p className="text-xs font-mono text-muted-foreground">
                Select a lookback period and run the backtest.
              </p>
              <p className="text-[10px] font-mono text-muted-foreground/70">
                Trains an unsupervised autoencoder via backpropagation,<br />
                then projects a 30-day forward forecast from the learned latent space.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
