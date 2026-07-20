import { useState } from "react";
import { Link } from "react-router-dom";
import { Table2, Globe, FileText, FlaskConical, BarChart3 } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { formatPrice } from "@/lib/regression";
import { InfoTooltip, metricInfo } from "./InfoTooltip";
import { HotStocks } from "./HotStocks";
import { GlobalSentiment } from "./GlobalSentiment";
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
  irWebsite?: string | null;
  onRunBacktest?: () => void;
  activeView?: "chart" | "advisor";
  onViewChange?: (view: "chart" | "advisor") => void;
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
  website,
  irWebsite,
  onRunBacktest,
  activeView = "chart",
  onViewChange,
}: StockHeaderProps) {
  const isPositive = change >= 0;
  const [hotStocksOpen, setHotStocksOpen] = useState(false);
  const [sentimentOpen, setSentimentOpen] = useState(false);

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
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
                  {ticker}{" "}
                  <span className="text-muted-foreground font-normal text-lg">{name}</span>
                </h1>
                {(website || irWebsite) && (
                  <div className="flex items-center gap-1.5">
                    {website && (
                      <a
                        href={website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        title="Company Website"
                      >
                        <Globe className="w-3 h-3" />
                        Website
                      </a>
                    )}
                    {irWebsite && (
                      <a
                        href={irWebsite}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-accent text-accent-foreground hover:bg-accent/80 transition-colors"
                        title="Investor Relations"
                      >
                        <FileText className="w-3 h-3" />
                        IR
                      </a>
                    )}
                  </div>
                )}
              </div>
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
          {onRunBacktest && (
            <button
              onClick={onRunBacktest}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <FlaskConical className="w-4 h-4" />
              Symbol Backtest
            </button>
          )}
          <Link
            to="/sector-backtest"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
          >
            <BarChart3 className="w-4 h-4" />
            Sector Backtest
          </Link>
          <button
            onClick={() => setHotStocksOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
          >
            <span className="text-base">🔥</span>
            Hot Stocks
          </button>
          <button
            onClick={() => setSentimentOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
          >
            <Globe className="w-4 h-4" />
            Global Sentiment
          </button>
          {onViewChange && (
            <button
              onClick={() => onViewChange(activeView === "advisor" ? "chart" : "advisor")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeView === "advisor"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent"
              }`}
            >
              <span className="text-base">💼</span>
              Portfolio Insights
            </button>
          )}
        </div>
      </header>

      <Dialog open={hotStocksOpen} onOpenChange={setHotStocksOpen}>
        <DialogContent className="sm:max-w-md bg-background border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="text-xl">🔥</span>
              Hot Stocks
            </DialogTitle>
          </DialogHeader>
          <HotStocks onSelectTicker={(symbol) => {
            onSelectTicker(symbol);
            setHotStocksOpen(false);
          }} />
        </DialogContent>
      </Dialog>

      <Dialog open={sentimentOpen} onOpenChange={setSentimentOpen}>
        <DialogContent className="sm:max-w-md bg-background border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Globe className="w-5 h-5" />
              Global Sentiment
            </DialogTitle>
          </DialogHeader>
          <GlobalSentiment />
        </DialogContent>
      </Dialog>
    </>
  );
}
