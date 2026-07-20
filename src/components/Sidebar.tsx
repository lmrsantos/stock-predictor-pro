import { Link } from "react-router-dom";
import { RegressionResult } from "@/lib/types";
import { formatPrice, slopeToAnnualReturn } from "@/lib/regression";
import { StockFundamentals } from "@/lib/stock-data";
import { InfoTooltip, metricInfo } from "./InfoTooltip";
import { TickerSearch } from "./TickerSearch";
import { InvestmentSimulator } from "./InvestmentSimulator";


import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { Briefcase, BarChart3, Sparkles, User, Activity } from "lucide-react";


interface SidebarProps {
  searchInput: string;
  onSearchInputChange: (v: string) => void;
  onSearch: (ticker?: string) => void;
  period: string;
  onPeriodChange: (v: string) => void;
  forecastDays: number;
  onForecastDaysChange: (v: number) => void;
  regression: RegressionResult | null;
  lastPrice: number;
  isLoading: boolean;
  fundamentals: StockFundamentals | null;
  ticker: string;
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

function formatMarketCap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toLocaleString()}`;
}

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
  fundamentals,
  ticker,
}: SidebarProps) {
  const { user } = useAuth();
  const { tier } = useSubscription();
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
        <TickerSearch
          value={searchInput}
          onChange={onSearchInputChange}
          onSelect={(symbol) => onSearch(symbol)}
        />
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

      {/* Fundamentals */}
      {fundamentals && (fundamentals.pe_ratio || fundamentals.eps || fundamentals.sector) && (
        <div className="space-y-3">
          <label className="label-upper">Company Fundamentals</label>

          {fundamentals.sector && (
            <div className="stat-card">
              <div className="text-xs text-muted-foreground flex items-center">
                Sector / Industry
                <InfoTooltip {...metricInfo.sector} />
              </div>
              <div className="text-sm mt-1">{fundamentals.sector}</div>
              {fundamentals.industry && (
                <div className="text-xs text-muted-foreground mt-0.5">{fundamentals.industry}</div>
              )}
            </div>
          )}

          {fundamentals.pe_ratio != null && (
            <div className="stat-card">
              <div className="text-xs text-muted-foreground flex items-center">
                P/E Ratio (Trailing)
                <InfoTooltip {...metricInfo.peRatio} />
              </div>
              <div className="text-xl font-mono mt-1">{fundamentals.pe_ratio.toFixed(2)}</div>
              {fundamentals.forward_pe != null && (
                <div className="text-xs text-muted-foreground mt-1 flex items-center">
                  Forward: {fundamentals.forward_pe.toFixed(2)}
                  <InfoTooltip {...metricInfo.forwardPE} />
                </div>
              )}
            </div>
          )}

          {fundamentals.eps != null && (
            <div className="stat-card">
              <div className="text-xs text-muted-foreground flex items-center">
                EPS (TTM)
                <InfoTooltip {...metricInfo.eps} />
              </div>
              <div className="text-xl font-mono mt-1">${fundamentals.eps.toFixed(2)}</div>
            </div>
          )}

          {fundamentals.market_cap != null && (
            <div className="stat-card">
              <div className="text-xs text-muted-foreground flex items-center">
                Market Cap
                <InfoTooltip {...metricInfo.marketCap} />
              </div>
              <div className="text-xl font-mono mt-1">{formatMarketCap(fundamentals.market_cap)}</div>
            </div>
          )}

          {fundamentals.dividend_yield != null && fundamentals.dividend_yield > 0 && (
            <div className="stat-card">
              <div className="text-xs text-muted-foreground flex items-center">
                Dividend Yield
                <InfoTooltip {...metricInfo.dividendYield} />
              </div>
              <div className="text-xl font-mono mt-1">{(fundamentals.dividend_yield * 100).toFixed(2)}%</div>
            </div>
          )}

          {fundamentals.fifty_two_week_low != null && fundamentals.fifty_two_week_high != null && (
            <div className="stat-card">
              <div className="text-xs text-muted-foreground flex items-center">
                52-Week Range
                <InfoTooltip {...metricInfo.fiftyTwoWeekRange} />
              </div>
              <div className="text-sm font-mono mt-1">
                ${formatPrice(fundamentals.fifty_two_week_low)} – ${formatPrice(fundamentals.fifty_two_week_high)}
              </div>
            </div>
          )}

          <div className="border-t border-border" />
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Investment Simulator */}
      <div id="investment-simulator">
        <InvestmentSimulator
          regression={regression}
          lastPrice={lastPrice}
          ticker={ticker}
        />
      </div>

      {/* Divider */}
      <div className="border-t border-border" />



      {/* More Tools */}
      <div className="space-y-2">
        <label className="label-upper">More Tools</label>
        <Link
          to="/linkages"
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-mono hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        >
          <Activity className="w-4 h-4" />
          Linkage Engine
        </Link>
      </div>


    </aside>
  );
}
