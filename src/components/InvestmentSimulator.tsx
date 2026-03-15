import { useState, useMemo } from "react";
import { RegressionResult } from "@/lib/types";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";

interface InvestmentSimulatorProps {
  regression: RegressionResult | null;
  lastPrice: number;
  ticker: string;
}

const periodOptions = [
  { value: 30, label: "1M" },
  { value: 90, label: "3M" },
  { value: 180, label: "6M" },
  { value: 365, label: "1Y" },
  { value: 730, label: "2Y" },
  { value: 1825, label: "5Y" },
];

export function InvestmentSimulator({ regression, lastPrice, ticker }: InvestmentSimulatorProps) {
  const [investment, setInvestment] = useState(10000);
  const [periodDays, setPeriodDays] = useState(365);

  const result = useMemo(() => {
    if (!regression || !lastPrice) return null;

    const { slope, standardDeviation } = regression;
    const dailyReturn = slope / lastPrice;
    const shares = investment / lastPrice;

    const projectedPrice = lastPrice + slope * periodDays;
    const projected = shares * projectedPrice;

    const upper1 = shares * (projectedPrice + standardDeviation);
    const lower1 = shares * (projectedPrice - standardDeviation);
    const upper2 = shares * (projectedPrice + 2 * standardDeviation);
    const lower2 = shares * (projectedPrice - 2 * standardDeviation);

    return {
      projected,
      gain: projected - investment,
      gainPct: (projected - investment) / investment,
      upper1,
      lower1,
      upper2,
      lower2,
      shares,
    };
  }, [regression, lastPrice, investment, periodDays]);

  if (!regression) return null;

  const selectedPeriod = periodOptions.find((p) => p.value === periodDays);

  return (
    <div className="space-y-4">
      <label className="label-upper">Investment Simulator</label>

      {/* Investment Amount */}
      <div className="space-y-2">
      <div className="space-y-2">
        <span className="text-xs text-muted-foreground">Amount ($)</span>
        <Input
          type="number"
          value={investment || ""}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v >= 0 && v <= 100000) setInvestment(v);
          }}
          min={0}
          max={100000}
          className="h-8 bg-secondary border-border font-mono text-sm"
          placeholder="Enter amount..."
        />
        <Slider
          value={[Math.min(investment, 100000)]}
          onValueChange={([v]) => setInvestment(v)}
          min={0}
          max={100000}
          step={500}
          className="w-full"
        />
      </div>

      {/* Period Selection */}
      <div className="space-y-2">
        <span className="text-xs text-muted-foreground">Holding Period</span>
        <div className="flex gap-1.5 flex-wrap">
          {periodOptions.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriodDays(p.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                periodDays === p.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-2 pt-2">
          <div className="stat-card">
            <div className="text-xs text-muted-foreground">
              Projected Value ({selectedPeriod?.label})
            </div>
            <div className={`text-xl font-mono mt-1 ${result.gain >= 0 ? "price-positive" : "price-negative"}`}>
              ${result.projected.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div className={`text-xs font-mono mt-0.5 ${result.gain >= 0 ? "price-positive" : "price-negative"}`}>
              {result.gain >= 0 ? "+" : ""}${result.gain.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              {" "}({result.gain >= 0 ? "+" : ""}{(result.gainPct * 100).toFixed(1)}%)
            </div>
          </div>

          <div className="stat-card">
            <div className="text-xs text-muted-foreground">1σ Range</div>
            <div className="text-sm font-mono mt-1">
              ${result.lower1.toLocaleString(undefined, { maximumFractionDigits: 0 })} – ${result.upper1.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>

          <div className="stat-card">
            <div className="text-xs text-muted-foreground">2σ Range</div>
            <div className="text-sm font-mono mt-1">
              ${result.lower2.toLocaleString(undefined, { maximumFractionDigits: 0 })} – ${result.upper2.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>

          <div className="text-[10px] text-muted-foreground leading-relaxed mt-2">
            Based on linear regression of {ticker}. Not financial advice.
          </div>
        </div>
      )}
    </div>
  );
}
