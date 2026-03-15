import { Search } from "lucide-react";
import { RegressionResult } from "@/lib/types";
import { formatPrice, slopeToAnnualReturn } from "@/lib/regression";

interface SidebarProps {
  searchInput: string;
  onSearchInputChange: (v: string) => void;
  onSearch: () => void;
  period: string;
  onPeriodChange: (v: string) => void;
  forecastDays: number;
  onForecastDaysChange: (v: number) => void;
  regression: RegressionResult | null;
  lastPrice: number;
  isLoading: boolean;
}

const periods = [
  { value: "1mo", label: "1 Month" },
  { value: "3mo", label: "3 Months" },
  { value: "6mo", label: "6 Months" },
  { value: "1y", label: "1 Year" },
  { value: "2y", label: "2 Years" },
  { value: "5y", label: "5 Years" },
];

const forecastOptions = [7, 14, 30, 60, 90];

export function Sidebar({
  searchInput,
  onSearchInputChange,
  onSearch,
  period,
  onPeriodChange,
  forecastDays,
  onForecastDaysChange,
  regression,
  lastPrice,
  isLoading,
}: SidebarProps) {
  const annualReturn = regression && lastPrice
    ? slopeToAnnualReturn(regression.slope, lastPrice)
    : null;

  return (
    <aside className="border-r border-border bg-sidebar p-6 flex flex-col gap-8 overflow-y-auto">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-primary" />
        <span className="text-xs font-mono font-bold tracking-widest text-muted-foreground uppercase">
          QuantForecast
        </span>
      </div>

      {/* Search */}
      <div className="space-y-2">
        <label className="label-upper">Ticker Symbol</label>
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            placeholder="AAPL"
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono input-focus placeholder:text-muted-foreground"
          />
          <button
            onClick={onSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent transition-colors"
          >
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Analysis Period */}
      <div className="space-y-2">
        <label className="label-upper">Analysis Period</label>
        <select
          value={period}
          onChange={(e) => onPeriodChange(e.target.value)}
          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm input-focus"
        >
          {periods.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Forecast Days */}
      <div className="space-y-2">
        <label className="label-upper">Forecast Horizon</label>
        <div className="flex gap-1.5 flex-wrap">
          {forecastOptions.map((d) => (
            <button
              key={d}
              onClick={() => onForecastDaysChange(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                forecastDays === d
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Stats */}
      <div className="space-y-3">
        <label className="label-upper">Model Statistics</label>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="stat-card animate-pulse">
                <div className="h-3 w-20 bg-muted rounded mb-2" />
                <div className="h-6 w-16 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : regression ? (
          <>
            <div className="stat-card">
              <div className="text-xs text-muted-foreground">R² (Fit Quality)</div>
              <div className="text-xl font-mono mt-1">{regression.rSquared.toFixed(4)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">
                {regression.rSquared > 0.7 ? "Strong" : regression.rSquared > 0.4 ? "Moderate" : "Weak"} linear trend
              </div>
            </div>

            <div className="stat-card">
              <div className="text-xs text-muted-foreground">Slope ($/day)</div>
              <div className={`text-xl font-mono mt-1 ${regression.slope >= 0 ? "price-positive" : "price-negative"}`}>
                {regression.slope >= 0 ? "+" : ""}{regression.slope.toFixed(4)}
              </div>
            </div>

            <div className="stat-card">
              <div className="text-xs text-muted-foreground">Std Deviation (σ)</div>
              <div className="text-xl font-mono mt-1">${formatPrice(regression.standardDeviation)}</div>
            </div>

            {annualReturn !== null && (
              <div className="stat-card">
                <div className="text-xs text-muted-foreground">Implied Annual Return</div>
                <div className={`text-xl font-mono mt-1 ${annualReturn >= 0 ? "price-positive" : "price-negative"}`}>
                  {annualReturn >= 0 ? "+" : ""}{(annualReturn * 100).toFixed(1)}%
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </aside>
  );
}
