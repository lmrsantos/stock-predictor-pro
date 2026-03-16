import { TrendingUp, TrendingDown, Minus, AlertTriangle, ShieldCheck, Info } from "lucide-react";
import { RegressionResult } from "@/lib/types";
import { StockFundamentals, AnalystRating } from "@/lib/stock-data";
import { slopeToAnnualReturn } from "@/lib/regression";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface InvestmentRecommendationProps {
  regression: RegressionResult | null;
  fundamentals: StockFundamentals | null;
  analystRating: AnalystRating | null;
  lastPrice: number;
  ticker: string;
  isLoading: boolean;
}

type Signal = "bullish" | "neutral" | "bearish";
type Verdict = "Favorable" | "Cautious" | "Unfavorable";

interface SignalItem {
  label: string;
  signal: Signal;
  detail: string;
  weight: number;
}

function getVerdictFromScore(score: number): { verdict: Verdict; color: string; icon: typeof TrendingUp } {
  if (score >= 0.4) return { verdict: "Favorable", color: "text-[hsl(var(--accent-success))]", icon: TrendingUp };
  if (score >= -0.2) return { verdict: "Cautious", color: "text-yellow-400", icon: Minus };
  return { verdict: "Unfavorable", color: "text-[hsl(var(--accent-danger))]", icon: TrendingDown };
}

function computeSignals(
  regression: RegressionResult | null,
  fundamentals: StockFundamentals | null,
  analystRating: AnalystRating | null,
  lastPrice: number,
): SignalItem[] {
  const signals: SignalItem[] = [];

  // 1. Trend momentum (regression slope)
  if (regression && lastPrice > 0) {
    const annualReturn = slopeToAnnualReturn(regression.slope, lastPrice);
    let signal: Signal = "neutral";
    let detail = "";
    if (annualReturn > 0.08) {
      signal = "bullish";
      detail = `Strong uptrend — implied +${(annualReturn * 100).toFixed(1)}%/yr`;
    } else if (annualReturn > 0) {
      signal = "neutral";
      detail = `Modest uptrend — implied +${(annualReturn * 100).toFixed(1)}%/yr`;
    } else {
      signal = "bearish";
      detail = `Downtrend — implied ${(annualReturn * 100).toFixed(1)}%/yr`;
    }
    signals.push({ label: "Price Momentum", signal, detail, weight: 0.25 });
  }

  // 2. Trend reliability (R²)
  if (regression) {
    const r2 = regression.rSquared;
    let signal: Signal = "neutral";
    let detail = "";
    if (r2 > 0.7) {
      signal = "bullish";
      detail = `High trend reliability (R² = ${r2.toFixed(2)}) — price follows a consistent pattern`;
    } else if (r2 > 0.4) {
      signal = "neutral";
      detail = `Moderate trend reliability (R² = ${r2.toFixed(2)}) — some predictability`;
    } else {
      signal = "bearish";
      detail = `Low trend reliability (R² = ${r2.toFixed(2)}) — price is volatile and unpredictable`;
    }
    signals.push({ label: "Trend Reliability", signal, detail, weight: 0.15 });
  }

  // 3. Valuation (P/E)
  if (fundamentals?.pe_ratio != null) {
    const pe = fundamentals.pe_ratio;
    let signal: Signal = "neutral";
    let detail = "";
    if (pe < 0) {
      signal = "bearish";
      detail = `Negative P/E (${pe.toFixed(1)}) — company is currently unprofitable`;
    } else if (pe < 15) {
      signal = "bullish";
      detail = `Low P/E (${pe.toFixed(1)}) — potentially undervalued relative to earnings`;
    } else if (pe < 30) {
      signal = "neutral";
      detail = `Moderate P/E (${pe.toFixed(1)}) — fairly valued by market standards`;
    } else {
      signal = "bearish";
      detail = `High P/E (${pe.toFixed(1)}) — premium valuation, higher downside risk`;
    }
    signals.push({ label: "Valuation (P/E)", signal, detail, weight: 0.15 });
  }

  // 4. 52-week position (industry momentum proxy)
  if (fundamentals?.fifty_two_week_high != null && fundamentals?.fifty_two_week_low != null && lastPrice > 0) {
    const high = fundamentals.fifty_two_week_high;
    const low = fundamentals.fifty_two_week_low;
    const range = high - low;
    const position = range > 0 ? (lastPrice - low) / range : 0.5;
    let signal: Signal = "neutral";
    let detail = "";
    if (position > 0.8) {
      signal = "bullish";
      detail = `Trading near 52-week high (${(position * 100).toFixed(0)}% of range) — strong momentum`;
    } else if (position > 0.4) {
      signal = "neutral";
      detail = `Mid-range of 52-week band (${(position * 100).toFixed(0)}%) — no extreme positioning`;
    } else {
      signal = "bearish";
      detail = `Near 52-week low (${(position * 100).toFixed(0)}% of range) — weak momentum or potential value`;
    }
    signals.push({ label: "Market Position", signal, detail, weight: 0.15 });
  }

  // 5. Analyst rating
  if (analystRating?.recommendation) {
    const rec = analystRating.recommendation.toLowerCase();
    let signal: Signal = "neutral";
    let detail = "";
    if (rec.includes("strong buy") || rec.includes("buy")) {
      signal = "bullish";
      detail = `Analyst consensus: ${analystRating.recommendation} (score: ${analystRating.score}/5)`;
    } else if (rec.includes("hold") || rec.includes("neutral")) {
      signal = "neutral";
      detail = `Analyst consensus: ${analystRating.recommendation} (score: ${analystRating.score}/5)`;
    } else {
      signal = "bearish";
      detail = `Analyst consensus: ${analystRating.recommendation} (score: ${analystRating.score}/5)`;
    }
    signals.push({ label: "Analyst Consensus", signal, detail, weight: 0.2 });
  }

  // 6. Forward P/E vs trailing (earnings momentum)
  if (fundamentals?.pe_ratio != null && fundamentals?.forward_pe != null && fundamentals.pe_ratio > 0 && fundamentals.forward_pe > 0) {
    const ratio = fundamentals.forward_pe / fundamentals.pe_ratio;
    let signal: Signal = "neutral";
    let detail = "";
    if (ratio < 0.85) {
      signal = "bullish";
      detail = `Forward P/E ${fundamentals.forward_pe.toFixed(1)} < Trailing ${fundamentals.pe_ratio.toFixed(1)} — earnings growth expected`;
    } else if (ratio > 1.15) {
      signal = "bearish";
      detail = `Forward P/E ${fundamentals.forward_pe.toFixed(1)} > Trailing ${fundamentals.pe_ratio.toFixed(1)} — earnings decline expected`;
    } else {
      signal = "neutral";
      detail = `Forward P/E (${fundamentals.forward_pe.toFixed(1)}) ≈ Trailing (${fundamentals.pe_ratio.toFixed(1)}) — stable earnings outlook`;
    }
    signals.push({ label: "Earnings Outlook", signal, detail, weight: 0.1 });
  }

  return signals;
}

function computeOverallScore(signals: SignalItem[]): number {
  if (signals.length === 0) return 0;
  const totalWeight = signals.reduce((s, i) => s + i.weight, 0);
  const weightedSum = signals.reduce((s, i) => {
    const v = i.signal === "bullish" ? 1 : i.signal === "bearish" ? -1 : 0;
    return s + v * i.weight;
  }, 0);
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

const signalDotColor: Record<Signal, string> = {
  bullish: "bg-[hsl(var(--accent-success))]",
  neutral: "bg-yellow-400",
  bearish: "bg-[hsl(var(--accent-danger))]",
};

export function InvestmentRecommendation({
  regression,
  fundamentals,
  analystRating,
  lastPrice,
  ticker,
  isLoading,
}: InvestmentRecommendationProps) {
  if (isLoading) {
    return (
      <div className="chart-surface p-4 animate-pulse">
        <div className="h-5 w-40 bg-muted rounded mb-3" />
        <div className="h-4 w-full bg-muted rounded" />
      </div>
    );
  }

  const signals = computeSignals(regression, fundamentals, analystRating, lastPrice);
  if (signals.length === 0) return null;

  const score = computeOverallScore(signals);
  const { verdict, color, icon: VerdictIcon } = getVerdictFromScore(score);

  const bullishCount = signals.filter(s => s.signal === "bullish").length;
  const bearishCount = signals.filter(s => s.signal === "bearish").length;
  const neutralCount = signals.filter(s => s.signal === "neutral").length;

  // Build professional summary
  let summary = "";
  if (verdict === "Favorable") {
    summary = `Based on ${signals.length} quantitative signals, ${ticker} shows a favorable risk-reward profile. ${bullishCount} of ${signals.length} indicators are positive, suggesting momentum and fundamentals are aligned.`;
  } else if (verdict === "Cautious") {
    summary = `${ticker} presents a mixed outlook across ${signals.length} indicators. With ${bullishCount} positive and ${bearishCount} negative signals, the risk-reward balance warrants careful position sizing.`;
  } else {
    summary = `${ticker} currently shows ${bearishCount} of ${signals.length} indicators signaling caution. The combination of trend and fundamental data suggests elevated risk at current levels.`;
  }

  // Industry/momentum emphasis
  const momentumSignal = signals.find(s => s.label === "Price Momentum");
  const positionSignal = signals.find(s => s.label === "Market Position");
  if (momentumSignal || positionSignal) {
    const parts: string[] = [];
    if (momentumSignal) parts.push(momentumSignal.detail);
    if (positionSignal) parts.push(positionSignal.detail);
    summary += ` Key momentum insight: ${parts.join(". ")}.`;
  }

  return (
    <div className={`chart-surface p-4 space-y-3 border-l-4 ${
      verdict === "Favorable" ? "border-l-[hsl(var(--accent-success))]" :
      verdict === "Cautious" ? "border-l-yellow-400" :
      "border-l-[hsl(var(--accent-danger))]"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <VerdictIcon className={`w-5 h-5 ${color}`} />
          <span className={`text-sm font-bold ${color}`}>
            {verdict} Outlook
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            ({bullishCount}↑ {neutralCount}→ {bearishCount}↓)
          </span>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="inline-flex items-center justify-center" aria-label="Signal breakdown">
                <Info className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              <p className="font-bold mb-1">Signal Breakdown</p>
              {signals.map((s, i) => (
                <div key={i} className="flex items-start gap-2 py-0.5">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${signalDotColor[s.signal]}`} />
                  <div>
                    <span className="font-medium">{s.label}:</span>{" "}
                    <span className="text-muted-foreground">{s.detail}</span>
                  </div>
                </div>
              ))}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Summary */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        {summary}
      </p>

      {/* Signal dots row */}
      <div className="flex gap-1.5 flex-wrap">
        {signals.map((s, i) => (
          <TooltipProvider key={i}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className={`px-2 py-1 rounded text-[10px] font-mono border border-border flex items-center gap-1.5 ${
                  s.signal === "bullish" ? "bg-[hsl(var(--accent-success))]/10" :
                  s.signal === "bearish" ? "bg-[hsl(var(--accent-danger))]/10" :
                  "bg-yellow-400/10"
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${signalDotColor[s.signal]}`} />
                  {s.label}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                {s.detail}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-1.5 pt-1 border-t border-border">
        <ShieldCheck className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          This is a quantitative analysis tool, not financial advice. Signals are derived from historical trends, valuation metrics, and third-party ratings. Always conduct your own research and consult a licensed financial adviser before making investment decisions.
        </p>
      </div>
    </div>
  );
}
