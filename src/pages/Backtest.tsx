import { useState, useMemo } from "react";
import { InfoTooltip } from "@/components/InfoTooltip";
import { useQuery } from "@tanstack/react-query";
import { fetchAndStoreStockData, getStockDataFromDB } from "@/lib/stock-data";
import { runAllModels, BacktestResult, ModelType } from "@/lib/backtesting";
import { Link } from "react-router-dom";
import { ArrowLeft, FlaskConical, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const TEST_TICKERS = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "JPM", "JNJ", "DIS"];

const TRAINING_SPLITS = [
  { label: "Train 6mo → Test rest", ratio: 0.5 },
  { label: "Train 9mo → Test rest", ratio: 0.75 },
  { label: "Train 80% → Test 20%", ratio: 0.8 },
];

const MODEL_COLORS: Record<string, string> = {
  "linear": "hsl(0, 75%, 55%)",
  "log-linear": "hsl(200, 80%, 50%)",
  "weighted-linear": "hsl(35, 90%, 50%)",
  "weighted-log-linear": "hsl(150, 70%, 40%)",
};

const MODEL_LABELS: Record<string, string> = {
  "linear": "Linear",
  "log-linear": "Log-Linear",
  "weighted-linear": "Weighted Linear",
  "weighted-log-linear": "Weighted Log-Linear",
};

function BacktestChart({ results, ticker }: { results: BacktestResult[]; ticker: string }) {
  if (!results.length) return null;

  const best = results[0]; // sorted by MAPE
  const chartData = best.predictions.map((p, i) => {
    const point: any = { date: p.date, actual: p.actual };
    for (const r of results) {
      point[r.model] = r.predictions[i]?.predicted;
    }
    return point;
  });

  const formatDate = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="chart-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-mono font-bold">{ticker} — Backtest Overlay</h3>
        <div className="flex gap-3 text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 inline-block rounded bg-foreground" />
            Actual
          </span>
          {results.map(r => (
            <span key={r.model} className="flex items-center gap-1">
              <span className="w-3 h-0.5 inline-block rounded" style={{ background: MODEL_COLORS[r.model] }} />
              {MODEL_LABELS[r.model]}
            </span>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} interval="preserveStartEnd" minTickGap={50} />
          <YAxis domain={["auto", "auto"]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} width={55} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
            formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, MODEL_LABELS[name] || name]}
            labelFormatter={(label: string) => new Date(label).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          />
          <ReferenceLine x={best.trainingEndDate} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
          <Line dataKey="actual" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} isAnimationActive={false} />
          {results.map(r => (
            <Line key={r.model} dataKey={r.model} stroke={MODEL_COLORS[r.model]} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function MetricBadge({ value, unit, good }: { value: number; unit: string; good: boolean }) {
  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-mono ${good ? "bg-accent-success/10 text-accent-success" : "bg-accent-danger/10 text-accent-danger"}`}>
      {value.toFixed(2)}{unit}
    </span>
  );
}

function TickerBacktest({ ticker, splitRatio }: { ticker: string; splitRatio: number }) {
  const { data: meta, isLoading: isFetching } = useQuery({
    queryKey: ["backtest-fetch", ticker],
    queryFn: () => fetchAndStoreStockData(ticker, "1y"),
    retry: 1,
    staleTime: 30 * 60 * 1000,
  });

  const { data: stockData, isLoading: isQuerying } = useQuery({
    queryKey: ["backtest-db", ticker],
    queryFn: () => getStockDataFromDB(ticker, "1y"),
    enabled: !!meta,
    staleTime: 30 * 60 * 1000,
  });

  const results = useMemo(() => {
    if (!stockData?.length) return [];
    const trainSize = Math.floor(stockData.length * splitRatio);
    const all = runAllModels(stockData, trainSize);
    return all.map(r => ({ ...r, ticker }));
  }, [stockData, splitRatio, ticker]);

  const isLoading = isFetching || isQuerying;

  if (isLoading) {
    return (
      <div className="chart-surface p-4 flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="font-mono">{ticker}</span> — Loading…
      </div>
    );
  }

  if (!results.length) {
    return (
      <div className="chart-surface p-4 text-muted-foreground text-sm">
        <span className="font-mono">{ticker}</span> — Insufficient data
      </div>
    );
  }

  const best = results[0];

  return (
    <div className="space-y-3">
      <BacktestChart results={results} ticker={ticker} />
      
      {/* Results table */}
      <div className="chart-surface overflow-hidden">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left px-4 py-2.5 font-bold uppercase tracking-widest text-[10px]">Model</th>
              <th className="text-right px-4 py-2.5 font-bold uppercase tracking-widest text-[10px]">
                <span className="inline-flex items-center">MAPE
                  <InfoTooltip
                    title="MAPE (Mean Absolute Percentage Error)"
                    what="The average percentage difference between predicted and actual prices across all test days. It measures how far off the model's predictions were, regardless of direction."
                    howToRead="Lower is better. MAPE < 5% = excellent accuracy. 5–10% = good. 10–20% = moderate. > 20% = poor. Example: MAPE of 3.5% means predictions were off by 3.5% on average — a $100 stock would be predicted within ±$3.50."
                  />
                </span>
              </th>
              <th className="text-right px-4 py-2.5 font-bold uppercase tracking-widest text-[10px]">
                <span className="inline-flex items-center">RMSE
                  <InfoTooltip
                    title="RMSE (Root Mean Squared Error)"
                    what="The square root of the average squared differences between predicted and actual prices. It penalizes large errors more heavily than small ones."
                    howToRead="Lower is better. Measured in dollars. RMSE is always ≥ MAE — if RMSE is much larger than MAE, it means the model has some very large outlier errors. Example: RMSE of $8.50 on a $200 stock means typical errors are around $8.50, but some individual days had bigger misses."
                  />
                </span>
              </th>
              <th className="text-right px-4 py-2.5 font-bold uppercase tracking-widest text-[10px]">
                <span className="inline-flex items-center">MAE
                  <InfoTooltip
                    title="MAE (Mean Absolute Error)"
                    what="The average dollar difference between predicted and actual prices, ignoring whether the model was too high or too low."
                    howToRead="Lower is better. Measured in dollars. Easier to interpret than RMSE. Example: MAE of $5.00 means the model's prediction was off by about $5 on average each day. Compare it to the stock price — $5 on a $20 stock is 25% error, but on a $500 stock it's only 1%."
                  />
                </span>
              </th>
              <th className="text-right px-4 py-2.5 font-bold uppercase tracking-widest text-[10px]">
                <span className="inline-flex items-center">Direction %
                  <InfoTooltip
                    title="Directional Accuracy"
                    what="The percentage of test days where the model correctly predicted whether the price would go up or down compared to the previous day."
                    howToRead="Above 50% is better than a coin flip. > 55% = decent. > 60% = strong. Example: Direction % of 52% means the model guessed the daily direction correctly about half the time — typical for simple regression models since daily moves are noisy."
                  />
                </span>
              </th>
              <th className="text-right px-4 py-2.5 font-bold uppercase tracking-widest text-[10px]">
                <span className="inline-flex items-center">Final Error
                  <InfoTooltip
                    title="Final Day Error"
                    what="The percentage difference between the model's predicted price and the actual price on the last day of the test period."
                    howToRead="Positive (+) means the model predicted higher than reality (optimistic). Negative (−) means it predicted lower (pessimistic). Closer to 0% is better. Example: Final Error of +12% means the model predicted a price 12% above where the stock actually ended up."
                  />
                </span>
              </th>
              <th className="text-right px-4 py-2.5 font-bold uppercase tracking-widest text-[10px]">
                <span className="inline-flex items-center">R² (Train)
                  <InfoTooltip
                    title="R² (Training R-Squared)"
                    what="How well the regression line fit the training data (0 to 1). It shows how 'linear' or predictable the stock's movement was during the training period."
                    howToRead="R² > 0.7 = strong trend in training data. 0.4–0.7 = moderate. < 0.4 = choppy. High R² doesn't guarantee good predictions — it only means the training data had a clean trend. Example: R² of 0.92 means the training period had a very consistent trend, but the stock might still behave differently in the test period."
                  />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={r.model} className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${i === 0 ? "bg-primary/5" : ""}`}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: MODEL_COLORS[r.model] }} />
                    {MODEL_LABELS[r.model]}
                    {i === 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">BEST</span>}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <MetricBadge value={r.mape} unit="%" good={r.mape < 10} />
                </td>
                <td className="px-4 py-2.5 text-right">${r.rmse.toFixed(2)}</td>
                <td className="px-4 py-2.5 text-right">${r.mae.toFixed(2)}</td>
                <td className="px-4 py-2.5 text-right">
                  <MetricBadge value={r.directionalAccuracy} unit="%" good={r.directionalAccuracy > 50} />
                </td>
                <td className={`px-4 py-2.5 text-right ${Math.abs(r.finalError) < 5 ? "price-positive" : "price-negative"}`}>
                  {r.finalError >= 0 ? "+" : ""}{r.finalError.toFixed(2)}%
                </td>
                <td className="px-4 py-2.5 text-right">{r.trainingR2.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Backtest() {
  const [selectedSplit, setSelectedSplit] = useState(1);
  const [runningTickers, setRunningTickers] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const startBacktest = () => {
    setIsRunning(true);
    setRunningTickers([]);
    // Stagger ticker loading to avoid hitting rate limits
    TEST_TICKERS.forEach((ticker, i) => {
      setTimeout(() => {
        setRunningTickers(prev => [...prev, ticker]);
      }, i * 1500); // 1.5s between each
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center gap-4">
        <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-mono font-bold tracking-widest uppercase">Model Backtester</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Description */}
        <div className="chart-surface p-5 space-y-3">
          <h2 className="text-lg font-bold">How it works</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The backtester takes 1 year of historical data for each stock, splits it into a <strong>training set</strong> and 
            a <strong>test set</strong>. It trains 4 different regression models on the training data, then projects prices 
            forward into the test period. We compare predictions against actual prices using MAPE (Mean Absolute Percentage Error), 
            RMSE, directional accuracy, and final-day error.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {Object.entries(MODEL_LABELS).map(([key, label]) => (
              <div key={key} className="stat-card">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: MODEL_COLORS[key] }} />
                  <span className="text-xs font-mono font-bold">{label}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {key === "linear" && "Baseline straight-line fit on raw prices"}
                  {key === "log-linear" && "Log-transform captures compounding growth"}
                  {key === "weighted-linear" && "Exponential weights favor recent data"}
                  {key === "weighted-log-linear" && "Best of both: log prices + recency bias"}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="space-y-1">
            <label className="label-upper">Training Split</label>
            <div className="flex gap-1.5">
              {TRAINING_SPLITS.map((split, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedSplit(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                    selectedSplit === i
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-accent"
                  }`}
                >
                  {split.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={startBacktest}
            disabled={isRunning && runningTickers.length < TEST_TICKERS.length}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-mono font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isRunning && runningTickers.length < TEST_TICKERS.length ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Testing {runningTickers.length}/{TEST_TICKERS.length}…
              </>
            ) : (
              <>
                <FlaskConical className="w-4 h-4" />
                Run Backtest ({TEST_TICKERS.length} stocks)
              </>
            )}
          </button>
        </div>

        {/* Ticker list */}
        <div className="flex flex-wrap gap-2 text-xs font-mono">
          {TEST_TICKERS.map(t => (
            <span
              key={t}
              className={`px-2 py-1 rounded ${
                runningTickers.includes(t)
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {t}
            </span>
          ))}
        </div>

        {/* Results */}
        <div className="space-y-8">
          {runningTickers.map(ticker => (
            <TickerBacktest
              key={`${ticker}-${selectedSplit}`}
              ticker={ticker}
              splitRatio={TRAINING_SPLITS[selectedSplit].ratio}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
