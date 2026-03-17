import { useState } from "react";
import { Table2, Globe, FileText } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { formatPrice } from "@/lib/regression";
import { InfoTooltip, metricInfo } from "./InfoTooltip";
import { HotStocks } from "./HotStocks";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

interface StockHeaderProps {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  isLoading: boolean;
  showTable: boolean;
  onToggleTable: () => void;
  onSelectTicker: (ticker: string) => void;
  website?: string | null;
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
  onSelectTicker,
}: StockHeaderProps) {
  const isPositive = change >= 0;
  const [hotStocksOpen, setHotStocksOpen] = useState(false);

  return (
    <>
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
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setHotStocksOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
          >
            <span className="text-base">🔥</span>
            Hot Stocks
          </button>
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
          <button
            onClick={() => {
              const el = document.getElementById("investment-simulator");
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
          >
            💰 Simulator
          </button>
        </div>
      </header>

      <Dialog open={hotStocksOpen} onOpenChange={setHotStocksOpen}>
        <DialogContent className="sm:max-w-md bg-background border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="text-xl">🔥</span>
              QuantPulse™ Hot Stocks
            </DialogTitle>
          </DialogHeader>
          <HotStocks onSelectTicker={(symbol) => {
            onSelectTicker(symbol);
            setHotStocksOpen(false);
          }} />
        </DialogContent>
      </Dialog>
    </>
  );
}
