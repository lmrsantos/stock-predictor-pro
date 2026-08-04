import { Globe, FileText } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { formatPrice } from "@/lib/regression";
import { InfoTooltip, metricInfo } from "./InfoTooltip";

interface ExtendedQuote {
  label: string;
  price: number;
  change: number;
  changePct: number;
}

interface StockHeaderProps {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  isLoading: boolean;
  website?: string | null;
  irWebsite?: string | null;
  extendedQuote?: ExtendedQuote | null;
}

export function StockHeader({
  ticker,
  name,
  price,
  change,
  changePct,
  isLoading,
  website,
  irWebsite,
  extendedQuote,
}: StockHeaderProps) {
  const isPositive = change >= 0;
  const extPositive = (extendedQuote?.change ?? 0) >= 0;

  return (
    <header className="flex items-center gap-3 flex-nowrap shrink-0">
      <div>
        {isLoading ? (
          <div className="flex items-center gap-3 animate-pulse">
            <div className="h-6 w-32 bg-muted rounded" />
            <div className="h-6 w-28 bg-muted rounded" />
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-nowrap">
            <h1 className="text-xl lg:text-2xl font-bold tracking-tight">
              {ticker}{" "}
              <span className="text-muted-foreground font-normal text-sm">{name}</span>
            </h1>
            <span className="text-xl lg:text-2xl font-mono font-bold">
              ${formatPrice(price)}
            </span>
            <InfoTooltip {...metricInfo.price} />
            <span className={`text-sm font-mono ${isPositive ? "price-positive" : "price-negative"}`}>
              {isPositive ? "+" : ""}{formatPrice(change)} ({isPositive ? "+" : ""}{(changePct * 100).toFixed(2)}%)
            </span>
            <InfoTooltip {...metricInfo.dailyChange} />
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
        )}
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>

  );
}
