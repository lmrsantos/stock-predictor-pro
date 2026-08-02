import { RegressionResult } from "@/lib/types";
import { formatPrice, slopeToAnnualReturn } from "@/lib/regression";
import { InfoTooltip, metricInfo } from "./InfoTooltip";

interface Props {
  regression: RegressionResult | null;
  lastPrice: number;
  isLoading: boolean;
}

function Cell({
  label,
  value,
  valueClass = "",
  tooltip,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
  tooltip?: React.ComponentProps<typeof InfoTooltip>;
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-w-0 px-3 py-1.5 rounded-md bg-secondary/60 border border-border/60 flex items-center justify-center gap-1.5 whitespace-nowrap">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-0.5">
        {label}
        {tooltip && <InfoTooltip {...tooltip} />}
      </span>
      <span className={`text-sm font-mono ${valueClass}`}>{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  );
}


export function RegressionStatsBar({ regression, lastPrice, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex-1 h-8 rounded-md bg-secondary/40 border border-border/60 animate-pulse" />
        ))}
      </div>
    );
  }
  if (!regression) return null;

  const annual = lastPrice ? slopeToAnnualReturn(regression.slope, lastPrice) : null;
  const bullish = regression.slope >= 0;
  const sigmaPct = lastPrice ? (regression.standardDeviation / lastPrice) * 100 : 0;

  return (
    <div className="flex flex-wrap gap-2">
      <Cell
        label="R²"
        value={regression.rSquared.toFixed(2)}
        tooltip={metricInfo.rSquared}
        sub={regression.rSquared > 0.7 ? "Strong" : regression.rSquared > 0.4 ? "Moderate" : "Weak"}
      />
      <Cell
        label="Slope"
        value={`${bullish ? "+$" : "-$"}${Math.abs(regression.slope).toFixed(2)}/d`}
        valueClass={bullish ? "price-positive" : "price-negative"}
        tooltip={metricInfo.slope}
      />
      <Cell
        label="σ 30d"
        value={`${sigmaPct.toFixed(1)}%`}
        tooltip={metricInfo.stdDeviation}
        sub={`±$${formatPrice(regression.standardDeviation)}`}
      />
      {annual !== null && (
        <Cell
          label="Annual Return"
          value={`${annual >= 0 ? "+" : ""}${(annual * 100).toFixed(1)}%`}
          valueClass={annual >= 0 ? "price-positive" : "price-negative"}
          tooltip={metricInfo.annualReturn}
        />
      )}
      <Cell
        label="Signal"
        value={bullish ? "BULL" : "BEAR"}
        valueClass={bullish ? "price-positive" : "price-negative"}
      />
    </div>
  );
}
