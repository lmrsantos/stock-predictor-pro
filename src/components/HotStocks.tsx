import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, TrendingUp } from "lucide-react";
import { toast } from "sonner";

interface HotStock {
  symbol: string;
  name: string;
  price: number;
  dayChange: number;
  sector?: string;
  marketCap?: string;
  signal: string;
  confidence: number;
  forecastPct: number;
  walkForwardAccuracy: number;
  hitRate: number;
  regime: string;
  converged: boolean;
  riskTier: number;
  riskLabel: string;
}

const scanMessages = [
  "Initializing QuantPulse™ Engine…",
  "Scanning 80+ stocks across NYSE & NASDAQ…",
  "Fetching historical price data…",
  "Running linear regression on each candidate…",
  "Computing R² trend reliability…",
  "Evaluating momentum & annual return signals…",
  "Scoring trend consistency × momentum synergy…",
  "Ranking top opportunities…",
];

interface HotStocksProps {
  onSelectTicker: (ticker: string) => void;
}

export function HotStocks({ onSelectTicker }: HotStocksProps) {
  const [stocks, setStocks] = useState<HotStock[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [hasScanned, setHasScanned] = useState(false);
  const [message, setMessage] = useState("");

  const discover = async () => {
    setIsScanning(true);
    setStocks([]);
    setHasScanned(false);
    setMessage("");

    let msgIndex = 0;
    setScanMessage(scanMessages[0]);
    const interval = setInterval(() => {
      msgIndex = (msgIndex + 1) % scanMessages.length;
      setScanMessage(scanMessages[msgIndex]);
    }, 2200);

    try {
      const { data, error } = await supabase.functions.invoke("hot-stocks");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.message) setMessage(data.message);
      if (data?.stocks) {
        setStocks(data.stocks);
        setHasScanned(true);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      clearInterval(interval);
      setIsScanning(false);
      setScanMessage("");
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={discover}
        disabled={isScanning}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-all disabled:opacity-70"
      >
        {isScanning ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <TrendingUp className="w-4 h-4" />
        )}
        {isScanning ? "Scanning…" : hasScanned ? "Scan Again" : "Discover Hot Stocks"}
      </button>

      {/* Scanning animation */}
      {isScanning && (
        <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse [animation-delay:200ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse [animation-delay:400ms]" />
            </div>
            <span className="text-xs font-mono text-primary animate-pulse">
              {scanMessage}
            </span>
          </div>
          <div className="h-1 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary/60 rounded-full animate-[scan_3s_ease-in-out_infinite]" />
          </div>
        </div>
      )}

      {/* No results */}
      {hasScanned && stocks.length === 0 && !isScanning && (
        <p className="text-xs text-muted-foreground text-center py-2">
          {message || "No strong candidates found right now. Try again later."}
        </p>
      )}

      {/* Results */}
      {stocks.length > 0 && (
        <div className="space-y-1.5">
          {stocks.map((stock, i) => (
            <button
              key={stock.symbol}
              onClick={() => onSelectTicker(stock.symbol)}
              className="w-full text-left p-3 rounded-lg bg-card/50 border border-border hover:border-primary/40 hover:bg-card transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-muted-foreground w-4">
                    #{i + 1}
                  </span>
                  <span className="text-sm font-mono font-bold text-foreground group-hover:text-primary transition-colors">
                    {stock.symbol}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {stock.marketCap && stock.marketCap !== "0" && (
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {stock.marketCap}
                    </span>
                  )}
                  <span className={`text-xs font-mono font-semibold ${stock.forecastPct >= 0 ? "price-positive" : "price-negative"}`}>
                    {stock.forecastPct >= 0 ? "+" : ""}{stock.forecastPct.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="ml-6 mt-1 space-y-0.5">
                <div className="text-[10px] text-muted-foreground truncate max-w-[220px]">
                  {stock.name}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    Confidence {stock.confidence.toFixed(1)}%
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    Hit {stock.hitRate}%
                  </span>
                  {stock.sector && (
                    <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                      {stock.sector}
                    </span>
                  )}
                  <span className={`text-[10px] font-mono font-semibold ${
                    stock.riskTier <= 2 ? "price-positive" : "text-destructive"
                  }`}>
                    {stock.riskLabel}
                  </span>
                </div>
              </div>
            </button>
          ))}
          <p className="text-[9px] text-muted-foreground text-center mt-2 leading-relaxed">
            Ranked by QuantPulse™ AE — autoencoder confidence × walk-forward accuracy<br />
            across 160+ stocks with risk-tiered screening
          </p>
        </div>
      )}
    </div>
  );
}
