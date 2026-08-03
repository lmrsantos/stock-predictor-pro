import { TickerSearch } from "./TickerSearch";

export type ForecastModel = "regression" | "calibration" | "cycle";

export const forecastModels: { value: ForecastModel; label: string; hint: string }[] = [
  { value: "regression", label: "Enhanced Regression V2", hint: "Log-linear weighted regression with volatility & risk adjustments" },
  { value: "calibration", label: "Calibration Ensemble", hint: "5 SMA-smoothed regressions, winner picked by lowest historical error" },
  { value: "cycle", label: "Cycle Projection", hint: "Zigzag peak/trough geometry projected forward" },
];

interface ChartControlsProps {
  searchInput: string;
  onSearchInputChange: (v: string) => void;
  onSearch: (ticker?: string) => void;
  period: string;
  onPeriodChange: (v: string) => void;
  forecastDays: number;
  onForecastDaysChange: (v: number) => void;
  forecastModel: ForecastModel;
  onForecastModelChange: (v: ForecastModel) => void;
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
  forecastModel,
  onForecastModelChange,
}: ChartControlsProps) {

  return (
    <div className="flex items-center gap-2 gap-y-2 flex-wrap min-w-0">
      <div className="flex items-center gap-1.5 w-[170px] shrink-0">
        <label className="label-upper whitespace-nowrap">Ticker</label>
        <TickerSearch
          value={searchInput}
          onChange={onSearchInputChange}
          onSelect={(symbol) => onSearch(symbol)}
        />
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <label className="label-upper whitespace-nowrap">Period</label>
        <select
          value={period}
          onChange={(e) => onPeriodChange(e.target.value)}
          className="bg-secondary border border-border rounded-lg px-2 py-1 text-sm input-focus"
        >
          {periods.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <label className="label-upper whitespace-nowrap">Forecast</label>
        <div className="flex gap-1 flex-nowrap">
          {forecastOptions.map((d) => (
            <button
              key={d}
              onClick={() => onForecastDaysChange(d)}
              className={`px-2 py-1 rounded-md text-xs font-mono transition-colors ${
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

      <div className="flex items-center gap-1.5 min-w-0">
        <label className="label-upper whitespace-nowrap">Model</label>
        <select
          value={forecastModel}
          onChange={(e) => onForecastModelChange(e.target.value as ForecastModel)}
          title={forecastModels.find((m) => m.value === forecastModel)?.hint}
          className="bg-secondary border border-border rounded-lg pl-2 pr-6 py-1 text-sm input-focus min-w-0 max-w-[200px] truncate"
        >
          {forecastModels.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

