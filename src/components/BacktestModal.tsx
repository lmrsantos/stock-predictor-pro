// components/BacktestModal.tsx
import { useState, useEffect } from "react";
import { CycleAnalysisPanel } from "@/components/CycleAnalysis";
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, Legend,
} from "recharts";
import { backtest, ForecastResult } from "@/lib/backtest";
import { fetchAndStoreStockData, getStockDataFromDB } from "@/lib/stock-data";
import { supabase } from "@/integrations/supabase/client";

interface StockPoint { date: string; timestamp: number; close: number; }

interface BacktestModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticker: string;
  onResult?: (result: ForecastResult) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtPrice = (v: number) =>
  `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function buildDateLabels(timestamps: number[]): string[] {
  return timestamps.map((ts) => {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });
}

const accentColor = (val: number, lo: number, hi: number) =>
  val <= lo ? "#34d399" : val <= hi ? "#fbbf24" : "#f87171";

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="rounded-xl border bg-white/[0.02] p-4 flex flex-col gap-1"
      style={{ borderColor: `${color}30` }}>
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold font-mono" style={{ color }}>{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground font-mono">{sub}</span>}
    </div>
  );
}

// ─── Confidence ring ──────────────────────────────────────────────────────────

function ConfidenceRing({ score }: { score: number }) {
  const r     = 40;
  const circ  = 2 * Math.PI * r;
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
          <span className="text-2xl font-mono font-bold" style={{ color }}>{score}</span>
          <span className="text-[9px] font-mono text-muted-foreground">/ 100</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-[11px] font-mono font-semibold tracking-widest" style={{ color }}>{label}</div>
        <div className="text-[9px] font-mono text-muted-foreground">CONFIDENCE</div>
      </div>
    </div>
  );
}

// ─── Model calibration table ──────────────────────────────────────────────────

function CalibrationTable({ result }: { result: ForecastResult }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
      <div className="px-4 py-2 border-b border-border">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Out-of-sample holdout — fit on data up to {result.holdout?.asOfDate ?? "cutoff"} only, projected {result.holdout?.days ?? 30} bars blind to today
        </p>
        {result.holdout && (
          <p className="text-[10px] font-mono text-muted-foreground mt-1">
            As-of close {fmtPrice(result.holdout.asOfPrice)} → actual today {fmtPrice(result.currentPrice)} · direction hit rate {result.holdout.directionHitRate.toFixed(0)}%
          </p>
        )}
      </div>
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b border-border">
            {["Model", "Trend", "Projected Today", "Actual Today", "Error", "Direction", "R²", "Status"].map(h => (
              <th key={h} className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.models.map((m) => (
            <tr key={m.windowSize}
              className={`border-b border-border/50 transition-colors ${m.winner ? "bg-emerald-500/5" : "hover:bg-white/[0.02]"}`}>
              <td className="px-3 py-2 text-foreground">{m.label}</td>
              <td className="px-3 py-2" style={{ color: m.slope >= 0 ? "#34d399" : "#f87171" }}>
                {m.slope >= 0 ? "↑" : "↓"} {(m.annualizedReturn * 100).toFixed(1)}%/yr
              </td>
              <td className="px-3 py-2 text-foreground">{fmtPrice(m.predictedTodayPrice)}</td>
              <td className="px-3 py-2 text-muted-foreground">{fmtPrice(m.actualTodayPrice)}</td>
              <td className="px-3 py-2" style={{ color: accentColor(m.errorPct, 1, 3) }}>
                {m.errorPct.toFixed(2)}%
              </td>
              <td className="px-3 py-2" style={{ color: m.directionCorrect ? "#34d399" : "#f87171" }}>
                {m.directionCorrect ? "✓ right" : "✗ wrong"}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{m.rSquared.toFixed(3)}</td>
              <td className="px-3 py-2">
                {m.winner
                  ? <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-400 font-semibold">🏆 WINNER</span>
                  : <span className="text-muted-foreground text-[10px]">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 bg-card/40 border-t border-border">
        <p className="text-[10px] font-mono text-muted-foreground">
          Every row is a genuine forecast: the model saw nothing after {result.holdout?.asOfDate ?? "the cutoff"}. The lowest-error model earns the right to forecast the next 30 days from today.
        </p>
      </div>
    </div>

  );
}

// ─── Calibration reliability banner ───────────────────────────────────────────

function CalibrationBanner({ result }: { result: ForecastResult }) {
  const { calibration, magnitudeSignal } = result;
  if (calibration.directionCredible) return null;

  const failed = calibration.grade === "failed";
  const tone = failed
    ? "border-red-500/40 bg-red-500/10 text-red-300"
    : "border-amber-500/40 bg-amber-500/10 text-amber-300";

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 ${tone}`}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-widest font-semibold">
          {failed ? "⚠ Direction not forecastable" : "⚠ Direction unreliable"}
        </span>
        <span className="text-[10px] font-mono opacity-80">
          winner error {calibration.winnerErrorPct.toFixed(1)}% · median {calibration.medianErrorPct.toFixed(1)}%
        </span>
      </div>
      <p className="text-[11px] font-mono leading-relaxed text-foreground/90">{calibration.message}</p>
      <div className="rounded-lg border border-border bg-card/60 p-3">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
          Magnitude signal (direction-free)
        </p>
        <p className="text-[11px] font-mono leading-relaxed text-foreground/90">{magnitudeSignal.message}</p>
        <p className="text-[10px] font-mono text-muted-foreground mt-1">
          20d vol {(magnitudeSignal.shortVol * 100).toFixed(1)}% ann. vs baseline {(magnitudeSignal.baseVol * 100).toFixed(1)}% ann.
          {magnitudeSignal.compressed ? " — compressed, expect expansion." : ""}
        </p>
      </div>
    </div>
  );
}


// ─── Forecast + cone chart ────────────────────────────────────────────────────

function ForecastChart({ result }: { result: ForecastResult }) {
  const [showData, setShowData] = useState(false);

  // Deduplicate actual path
  const seen    = new Set<string>();
  const actual  = result.actualPath.filter(d => {
    if (seen.has(d.date)) return false; seen.add(d.date); return true;
  });

  const allTs     = [...actual.map(d => d.timestamp), ...result.forecastPoints.map(fp => fp.timestamp)];
  const labels    = buildDateLabels(allTs);
  const step      = Math.max(1, Math.floor(allTs.length / 8) - 1);

  const data = [
    ...actual.map((d, i) => ({
      date: labels[i], actual: d.actual,
      mean: null, upper1: null, lower1: null, upper2: null, lower2: null,
      band1: null as [number,number]|null, band2: null as [number,number]|null,
    })),
    ...result.forecastPoints.map((fp, i) => ({
      date:   labels[actual.length + i],
      actual: null,
      mean:   fp.mean, upper1: fp.upper1, lower1: fp.lower1,
      upper2: fp.upper2, lower2: fp.lower2,
      band1:  [fp.lower1, fp.upper1] as [number,number],
      band2:  [fp.lower2, fp.upper2] as [number,number],
    })),
  ];

  const todayLabel = labels[actual.length - 1];

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }}
            interval={Math.max(1, Math.floor(data.length / 6) - 1)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }}
            axisLine={false} tickLine={false} width={72} tickFormatter={fmtPrice} />
          <Tooltip
            contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11, fontFamily: "monospace" }}
            formatter={(v: unknown, name: string) => {
              if (Array.isArray(v)) return [`${fmtPrice(v[0])} – ${fmtPrice(v[1])}`, name];
              return [fmtPrice(v as number), name];
            }} />
          <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace", color: "#a1a1aa" }} />
          <Area type="monotone" dataKey="band2" fill="#60a5fa" fillOpacity={0.06} stroke="none" name="±2σ" connectNulls={false} />
          <Area type="monotone" dataKey="band1" fill="#60a5fa" fillOpacity={0.14} stroke="none" name="±1σ" connectNulls={false} />
          <Line type="monotone" dataKey="actual" stroke="#60a5fa" strokeWidth={2} dot={false} name="Actual price" connectNulls={false} />
          <Line type="monotone" dataKey="mean"   stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" dot={false} name="Forecast (winner)" connectNulls={false} />
          <ReferenceLine x={todayLabel} stroke="#52525b" strokeDasharray="4 4"
            label={{ value: "Today", fill: "#71717a", fontSize: 10, fontFamily: "monospace" }} />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex justify-end mt-2">
        <button
          onClick={() => setShowData(!showData)}
          className="text-[10px] font-mono px-3 py-1 rounded border border-border text-muted-foreground hover:border-foreground/40 transition-all"
        >
          {showData ? "Hide Data" : "Show Data"}
        </button>
      </div>

      {showData && (
        <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-[10px] font-mono">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border">
                <th className="text-left px-3 py-1.5 text-muted-foreground">#</th>
                <th className="text-left px-3 py-1.5 text-muted-foreground">Date</th>
                <th className="text-left px-3 py-1.5 text-muted-foreground">Timestamp</th>
                <th className="text-left px-3 py-1.5 text-muted-foreground">Type</th>
                <th className="text-right px-3 py-1.5 text-muted-foreground">Price</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="px-3 py-1 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-1 text-foreground">{row.date}</td>
                  <td className="px-3 py-1 text-muted-foreground">{row.actual !== null ? new Date(allTs[i]).toISOString().split("T")[0] : "—"}</td>
                  <td className="px-3 py-1" style={{ color: row.actual !== null ? "#60a5fa" : "#f59e0b" }}>
                    {row.actual !== null ? "actual" : "forecast"}
                  </td>
                  <td className="px-3 py-1 text-right text-foreground">
                    {row.actual !== null ? fmtPrice(row.actual) : fmtPrice(row.mean ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Regime banner ────────────────────────────────────────────────────────────

function RegimeBanner({ regime }: { regime: ForecastResult["regime"] }) {
  if (!regime.warning) return null;
  const severe = regime.ratio > 2.5;
  return (
    <div className={`rounded-xl border px-4 py-3 flex gap-3 items-start ${severe ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
      <span className="text-lg mt-0.5">{severe ? "🚨" : "⚠️"}</span>
      <div>
        <p className={`text-xs font-mono font-semibold mb-0.5 ${severe ? "text-red-400" : "text-amber-400"}`}>
          {severe ? "Extreme Regime Shift" : "Regime Warning"}
        </p>
        <p className="text-[11px] font-mono text-muted-foreground">{regime.warning}</p>
      </div>
    </div>
  );
}

// ─── QuantAgent market context panel ─────────────────────────────────────────

function MarketContextPanel({ ticker, result }: { ticker: string; result: ForecastResult }) {
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<string>("");
  const [error, setError]     = useState<string>("");

  const stockContext = {
    ticker,
    price: result.currentPrice,
    backtestResult: {
      signal:              result.forecastDirection === "up" ? "BUY" : "SELL",
      confidenceScore:     result.confidenceScore,
      walkForwardAccuracy: Math.max(0, 100 - result.winningModel.errorPct),
      hitRate:             result.ensembleAgreement * 100,
      regime:              result.regime.outsideDistribution ? "SHIFTED" : "NORMAL",
      forecastPct:         result.forecastPct,
      forecastLabel:       "30 days",
    },
  };

  const message = `For ${ticker} (current price: ${fmtPrice(result.currentPrice)}):

The quantitative model shows:
- Forecast: ${result.forecastPct > 0 ? "+" : ""}${result.forecastPct}% over 30 days (${result.forecastDirection.toUpperCase()})
- Winning model: ${result.winningModel.label} with ${result.winningModel.errorPct.toFixed(2)}% calibration error
- Model confidence: ${result.confidenceScore}/100
- Regime: ${result.regime.outsideDistribution ? "SHIFTED (elevated volatility)" : "NORMAL"}
- Direction agreement: ${(result.ensembleAgreement * 100).toFixed(0)}% of models agree
- Calibration quality: ${result.calibration.grade.toUpperCase()} — ${result.calibration.message}
- Magnitude signal: ${result.magnitudeSignal.message}${result.calibration.directionCredible ? "" : `

IMPORTANT: calibration failed this symbol, so do NOT assert a direction. Frame the context around magnitude/volatility and catalysts only.`}

Please search for current news, earnings calendar, analyst ratings, and macro factors for ${ticker}. Then give a concise 3-4 sentence market context that helps the user decide whether to act on this forecast. Focus on: upcoming catalysts, recent price drivers, and key risks. Be direct.`;

  useEffect(() => {
    const ask = async () => {
      try {
        // Step 1: Get agent_id + environment_id (cached after first call)
        const { data: agentData, error: agentErr } = await supabase.functions.invoke("quant-agent", {
          body: { action: "get_or_create_agent", context: stockContext, ticker },
        });
        if (agentErr) throw new Error(agentErr.message);
        const { agent_id, environment_id } = agentData;

        // Step 2: Create a session for this backtest context
        const { data: sessionData, error: sessionErr } = await supabase.functions.invoke("quant-agent", {
          body: {
            action: "create_session",
            agent_id,
            environment_id,
            ticker,
            purpose: `backtest_${Date.now()}`, // fresh session every run — no stale context
            context: stockContext,
          },
        });
        if (sessionErr) throw new Error(sessionErr.message);
        const sessionId = sessionData?.session_id;
        if (!sessionId) throw new Error("No session ID returned");

        // Step 3: Send the market context message
        const { data, error: msgErr } = await supabase.functions.invoke("quant-agent", {
          body: {
            action: "send_message",
            session_id: sessionId,
            message,
            context: stockContext,
            ticker,
          },
        });
        if (msgErr) throw new Error(msgErr.message);
        setContext(data?.response || "No response from agent.");
      } catch (e) {
        setError(`Could not load market context: ${(e as Error).message}`);
      } finally {
        setLoading(false);
      }
    };
    ask();
  }, [ticker, result.confidenceScore]);

  return (
    <div className="rounded-xl border border-sky-800/40 bg-sky-950/20 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm">🧠</span>
        <p className="text-[10px] font-mono uppercase tracking-widest text-sky-400">
          QuantAgent — Current Market Context
        </p>
        {loading && <div className="w-3 h-3 border border-sky-400/30 border-t-sky-400 rounded-full animate-spin ml-auto" />}
      </div>
      {loading && (
        <p className="text-[11px] font-mono text-muted-foreground animate-pulse">
          Searching for latest news, earnings, and analyst ratings for {ticker}...
        </p>
      )}
      {error && <p className="text-[11px] font-mono text-red-400">{error}</p>}
      {context && !loading && (
        <p className="text-[11px] font-mono text-foreground leading-relaxed whitespace-pre-wrap">{context}</p>
      )}
      <p className="text-[9px] font-mono text-muted-foreground">
        Powered by Claude with web search · Not financial advice
      </p>
    </div>
  );
}

// ─── Recommendation panel ─────────────────────────────────────────────────────

function RecommendationPanel({ result, ticker }: { result: ForecastResult; ticker: string }) {
  const up         = result.forecastDirection === "up";
  const confidence = result.confidenceScore;
  const regime     = result.regime;
  const agreement  = result.ensembleAgreement;

  let signal: "BUY" | "SELL" | "WAIT" | "STAY OUT" = "WAIT";
  let signalColor = "#fbbf24";
  let emoji       = "⏳";

  if (regime.ratio > 2.5) {
    signal = "STAY OUT"; signalColor = "#f87171"; emoji = "🚫";
  } else if (agreement < 0.6) {
    signal = "WAIT";     signalColor = "#fbbf24"; emoji = "⏳";
  } else if (confidence >= 50 && up) {
    signal = "BUY";      signalColor = "#34d399"; emoji = "✅";
  } else if (confidence >= 50 && !up) {
    signal = "SELL";     signalColor = "#f87171"; emoji = "🔴";
  }

  let positionSize = "Stay flat";
  if (signal === "BUY" || signal === "SELL") {
    if (confidence >= 75 && !regime.outsideDistribution)      positionSize = "Full position";
    else if (confidence >= 50 && !regime.outsideDistribution) positionSize = "Half position";
    else                                                       positionSize = "Quarter position";
  }

  const reasons = [
    { text: `Winning model (${result.winningModel.label}) calibrated with only ${result.winningModel.errorPct.toFixed(2)}% error on today's price`, positive: result.winningModel.errorPct < 3 },
    { text: `Forecast: ${up ? "+" : ""}${result.forecastPct}% over 30 days — model projects price ${up ? "higher" : "lower"}`, positive: up },
    { text: `${(agreement * 100).toFixed(0)}% of models agree on direction — ${agreement >= 0.8 ? "strong consensus" : agreement >= 0.6 ? "moderate consensus" : "low consensus"}`, positive: agreement >= 0.6 },
    { text: `R² of winning model: ${result.winningModel.rSquared.toFixed(3)} — ${result.winningModel.rSquared >= 0.7 ? "high trend reliability" : result.winningModel.rSquared >= 0.4 ? "moderate reliability" : "low reliability"}`, positive: result.winningModel.rSquared >= 0.4 },
    { text: `Market regime: ${regime.outsideDistribution ? `SHIFTED (${regime.ratio.toFixed(1)}× normal volatility) — elevated risk` : "NORMAL — model within trained conditions"}`, positive: !regime.outsideDistribution },
    { text: `Confidence score: ${confidence}/100`, positive: confidence >= 50 },
  ];

  const signalBg     = `${signalColor}08`;
  const signalBorder = `${signalColor}30`;

  return (
    <div className="rounded-xl border-2 p-5 flex flex-col gap-4"
      style={{ borderColor: signalBorder, background: signalBg }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{emoji}</span>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Model Recommendation for {ticker}
            </p>
            <p className="text-3xl font-mono font-bold mt-0.5" style={{ color: signalColor }}>
              {signal}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Position Size</p>
          <p className="text-sm font-mono font-semibold mt-0.5" style={{ color: signalColor }}>{positionSize}</p>
        </div>
      </div>
      <div className="border-t" style={{ borderColor: signalBorder }} />
      <div className="flex flex-col gap-1.5">
        {reasons.map(({ text, positive }, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-[11px] mt-0.5 shrink-0" style={{ color: positive ? "#34d399" : "#f87171" }}>
              {positive ? "✓" : "✗"}
            </span>
            <span className="text-[11px] font-mono text-muted-foreground">{text}</span>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-muted/40 px-3 py-2">
        <p className="text-[9px] font-mono text-muted-foreground leading-relaxed">
          Based on calibration-by-hindsight: the model that best predicted today's price from {result.lookbackMonths} months ago
          earns the right to forecast forward. Combine with market context below before acting.
          Not financial advice.
        </p>
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function BacktestModal({ isOpen, onClose, ticker, onResult }: BacktestModalProps) {
  const [lookback, setLookback]     = useState<3 | 6>(6);
  const [running, setRunning]       = useState(false);
  const [result, setResult]         = useState<ForecastResult | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [progress, setProgress]     = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [dataPoints, setDataPoints] = useState<{ date: string; timestamp: number; actual: number }[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataReady, setDataReady]   = useState(false);
  const [activeTab, setActiveTab]   = useState<"forecast" | "calibration" | "regime" | "cycle">("forecast");

  useEffect(() => {
    if (!isOpen || !ticker) return;
    setDataReady(false);
    setDataLoading(true);
    setResult(null);
    setError(null);

    const load = async () => {
      try {
        // Fetch 2 years for better trend capture on strongly trending stocks
        await fetchAndStoreStockData(ticker, "2y");
        const rows = await getStockDataFromDB(ticker, "2y");
        if (!rows || rows.length < 60) {
          // Fall back to 1 year if 2y not available
          await fetchAndStoreStockData(ticker, "1y");
          const rows1y = await getStockDataFromDB(ticker, "1y");
          if (!rows1y || rows1y.length < 60) {
            throw new Error(`Only ${rows1y?.length ?? 0} data points. Need at least 60.`);
          }
          setDataPoints(rows1y.map((d: StockPoint) => ({ date: d.date, timestamp: d.timestamp, actual: d.close })));
          setDataReady(true);
          return;
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
    if (!dataReady) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setProgressPct(0);

    const steps: [number, string][] = [
      [10, "Fetched 1 year of daily price data ✓"],
      [25, "Calibrating 10-day trend model..."],
      [40, "Calibrating 15-day trend model..."],
      [55, "Calibrating 20-day monthly model..."],
      [70, "Calibrating 30-day medium trend..."],
      [82, "Calibrating 40-day long trend..."],
      [90, "Ranking models by prediction error..."],
      [96, "Generating forecast from winning model..."],
    ];

    let s = 0;
    const iv = setInterval(() => {
      if (s < steps.length) { setProgressPct(steps[s][0]); setProgress(steps[s][1]); s++; }
      else clearInterval(iv);
    }, 300);

    setTimeout(() => {
      clearInterval(iv);
      try {
        const res = backtest(dataPoints, lookback);
        setResult(res);
        onResult?.(res);
        setProgressPct(100);
        setProgress("");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setRunning(false);
      }
    }, steps.length * 300 + 200);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border border-border bg-background"
        style={{ boxShadow: "0 0 100px rgba(0,0,0,0.95), 0 0 0 1px #27272a" }}>

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-background/95 backdrop-blur">
          <div>
            <h2 className="text-sm font-mono font-semibold text-foreground tracking-widest uppercase">
              Calibration Backtest
            </h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {ticker} — 5 models compete · winner forecasts forward · AI market context
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-xl font-light">✕</button>
        </div>

        <div className="p-6 flex flex-col gap-5">

          {/* How it works */}
          <div className="rounded-xl border border-border bg-card/40 px-4 py-3">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">How it works</p>
            <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono text-muted-foreground">
              <span className="px-2 py-1 rounded bg-muted text-foreground">Start N months ago</span>
              <span className="text-muted-foreground">→</span>
              <span className="px-2 py-1 rounded bg-muted text-foreground">5 models project to today</span>
              <span className="text-muted-foreground">→</span>
              <span className="px-2 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold">Winner = closest to actual price</span>
              <span className="text-muted-foreground">→</span>
              <span className="px-2 py-1 rounded bg-sky-500/15 border border-sky-500/30 text-sky-400 font-semibold">Winner forecasts 30 days forward</span>
              <span className="text-muted-foreground">+</span>
              <span className="px-2 py-1 rounded bg-purple-500/15 border border-purple-500/30 text-purple-400 font-semibold">🧠 AI market context</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Lookback</span>
            <div className="flex gap-2">
              {([3, 6] as const).map(m => (
                <button key={m} onClick={() => setLookback(m)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-mono border transition-all ${lookback === m ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-secondary text-secondary-foreground border-border hover:bg-accent hover:text-accent-foreground"}`}>
                  {m} Months
                </button>
              ))}
            </div>
            <button onClick={handleRun} disabled={running || dataLoading || !dataReady}
              className="ml-auto px-5 py-2 rounded-lg text-xs font-mono font-semibold bg-accent-success text-white border border-accent-success hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
              {dataLoading ? "⟳ Loading data..." : running ? "⟳ Calibrating models..." : "▶ Run Backtest"}
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs font-mono text-red-400">{error}</div>
          )}

          {running && (
            <div className="flex flex-col gap-4 py-8">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                <span className="text-xs font-mono text-muted-foreground animate-pulse text-center">{progress}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
              </div>
              <p className="text-[10px] font-mono text-muted-foreground text-center">{progressPct}% complete</p>
            </div>
          )}

          {result && !running && (
            <>
              <RegimeBanner regime={result.regime} />
              <CalibrationBanner result={result} />

              {/* Key metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Winning Model"
                  value={`${result.winningModel.errorPct.toFixed(2)}% err`}
                  sub={`${result.winningModel.label} · calibration ${result.calibration.grade}`}
                  color={accentColor(result.winningModel.errorPct, 3, 8)} />
                {result.calibration.directionCredible ? (
                  <StatCard label="30-Day Forecast"
                    value={`${result.forecastPct > 0 ? "+" : ""}${result.forecastPct}%`}
                    sub={`Direction: ${result.forecastDirection.toUpperCase()}`}
                    color={result.forecastDirection === "up" ? "#34d399" : "#f87171"} />
                ) : (
                  <StatCard label="30-Day Expected Move"
                    value={`±${result.magnitudeSignal.expectedMovePct.toFixed(1)}%`}
                    sub="Direction not reliable (1σ magnitude)"
                    color="#fbbf24" />
                )}
                <StatCard label="Model Agreement"
                  value={`${(result.ensembleAgreement * 100).toFixed(0)}%`}
                  sub={`${result.models.filter(m => m.winner || m.slope * (result.forecastDirection === "up" ? 1 : -1) > 0).length}/5 models agree`}
                  color={accentColor(100 - result.ensembleAgreement * 100, 30, 50)} />
                <StatCard label="Regime"
                  value={result.regime.outsideDistribution ? "⚠ SHIFTED" : "✓ NORMAL"}
                  sub={`${result.regime.ratio.toFixed(2)}× vol ratio`}
                  color={result.regime.outsideDistribution ? "#f87171" : "#34d399"} />
              </div>

              {/* Confidence + recommendation */}
              <div className="flex flex-col md:flex-row gap-4">
                <div className="rounded-xl border border-border bg-card/60 p-5 flex flex-col items-center justify-center min-w-[180px]">
                  <ConfidenceRing score={result.confidenceScore} />
                  <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mt-3 text-center leading-relaxed">
                    Forecast<br />Confidence
                  </p>
                </div>
                <div className="flex-1">
                  <RecommendationPanel result={result} ticker={ticker} />
                </div>
              </div>

              {/* QuantAgent market context — auto-triggered, fresh session per run */}
              <MarketContextPanel
                key={`${ticker}-${result.confidenceScore}-${result.forecastPct}-${result.winningModel.windowSize}`}
                ticker={ticker}
                result={result}
              />

              {/* Tabs */}
              <div className="flex border-b border-border">
                {([
                  { id: "forecast",    label: "Forecast + Cone" },
                  { id: "calibration", label: "Model Calibration" },
                  { id: "regime",      label: "Regime Detection" },
                  { id: "cycle",       label: "Cycle Analysis" },
                ] as const).map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest whitespace-nowrap border-b-2 transition-all ${activeTab === tab.id ? "border-sky-500 text-sky-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="rounded-xl border border-border bg-card/60 p-4">
                {activeTab === "forecast" && (
                  <>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
                      Winning model forecast with ensemble uncertainty cone
                    </p>
                    <ForecastChart result={result} />
                  </>
                )}
                {activeTab === "calibration" && <CalibrationTable result={result} />}
                {activeTab === "regime" && (
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-3 gap-3">
                      <StatCard label="Training Vol (ann.)" value={`${(result.regime.trainingVol * 100).toFixed(1)}%`} color="#60a5fa" />
                      <StatCard label="Current Vol (ann.)"  value={`${(result.regime.currentVol * 100).toFixed(1)}%`}
                        color={result.regime.outsideDistribution ? "#f87171" : "#34d399"} />
                      <StatCard label="Vol Ratio" value={`${result.regime.ratio.toFixed(2)}×`}
                        sub={result.regime.outsideDistribution ? "Outside distribution" : "Within normal range"}
                        color={result.regime.ratio > 2.5 ? "#f87171" : result.regime.ratio > 1.5 ? "#fbbf24" : "#34d399"} />
                    </div>
                    <p className="text-[10px] font-mono text-muted-foreground text-center">
                      Ratios above 1.5× mean current conditions are outside what the model was calibrated on.
                      Above 2.5× — do not act on the forecast.
                    </p>
                  </div>
                )}
                {activeTab === "cycle" && (
                  <CycleAnalysisPanel
                    ticker={ticker}
                    prices={dataPoints.map(d => d.actual)}
                    dates={dataPoints.map(d => d.date)}
                  />
                )}
              </div>
            </>
          )}

          {/* Empty state */}
          {!result && !running && !error && (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <span className="text-4xl">🏆</span>
              <p className="text-sm font-mono text-muted-foreground font-semibold">Calibration Backtest Ready</p>
              {dataLoading && (
                <div className="flex items-center gap-2 text-xs font-mono text-sky-400 animate-pulse">
                  <div className="w-3 h-3 border border-sky-400/40 border-t-sky-400 rounded-full animate-spin" />
                  Fetching 1 year of {ticker} price data...
                </div>
              )}
              {dataReady && (
                <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                  <span>✓</span> {dataPoints.length} trading days loaded — ready
                </div>
              )}
              <p className="text-[11px] font-mono text-muted-foreground max-w-md leading-relaxed">
                5 models will compete to predict today's price from {lookback} months ago.
                The winner earns the right to forecast the next 30 days.
                QuantAgent will then search for current market context to help you decide.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
