import { Table2 } from "lucide-react";
import { formatPrice } from "@/lib/regression";
import { InfoTooltip, metricInfo } from "./InfoTooltip";

interface StockHeaderProps {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  isLoading: boolean;
  showTable: boolean;
  onToggleTable: () => void;
}

export function StockHeader({
  ticker,
  name,
  price,
  change,
  changePct,
  isLoading,
  showTable,
  onToggleTable,
}: StockHeaderProps) {
  const isPositive = change >= 0;

  return (
    <header className="flex justify-between items-end flex-wrap gap-4">
      <div>
        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-10 w-36 bg-muted rounded" />
          </div>
        ) : (
          <>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
              {ticker}{" "}
              <span className="text-muted-foreground font-normal text-lg">{name}</span>
            </h1>
            <div className="flex items-baseline gap-3 mt-2">
              <span className="text-3xl lg:text-4xl font-mono font-bold">
                ${formatPrice(price)}
              </span>
              <InfoTooltip {...metricInfo.price} />
              <span className={`text-sm font-mono ${isPositive ? "price-positive" : "price-negative"}`}>
                {isPositive ? "+" : ""}{formatPrice(change)} ({isPositive ? "+" : ""}{(changePct * 100).toFixed(2)}%)
              </span>
              <InfoTooltip {...metricInfo.dailyChange} />
            </div>
          </>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onToggleTable}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            showTable
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-accent"
          }`}
        >
          <Table2 className="w-4 h-4" />
          Data Table
        </button>
      </div>
    </header>
  );
}
