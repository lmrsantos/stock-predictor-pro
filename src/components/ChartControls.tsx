import { TickerSearch } from "./TickerSearch";

interface ChartControlsProps {
  searchInput: string;
  onSearchInputChange: (v: string) => void;
  onSearch: (ticker?: string) => void;
  period: string;
  onPeriodChange: (v: string) => void;
  forecastDays: number;
  onForecastDaysChange: (v: number) => void;
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

export function ChartControls({
  searchInput,
  onSearchInputChange,
  onSearch,
  period,
  onPeriodChange,
  forecastDays,
  onForecastDaysChange,
}: ChartControlsProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5 min-w-[180px]">
        <label className="label-upper">Ticker Symbol</label>
        <TickerSearch
          value={searchInput}
          onChange={onSearchInputChange}
          onSelect={(symbol) => onSearch(symbol)}
        />
      </div>

      <div className="space-y-1.5">
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

      <div className="space-y-1.5">
        <label className="label-upper">Forecast Horizon</label>
        <div className="flex gap-1.5 flex-wrap">
          {forecastOptions.map((d) => (
            <button
              key={d}
              onClick={() => onForecastDaysChange(d)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors ${
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
    </div>
  );
}
