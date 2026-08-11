import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { primarySectorOf } from "@/lib/sector-universes";
import type { SectorName } from "@/lib/sector-universes";
import { PieChart } from "lucide-react";

interface HoldingProjection {
  ticker: string;
  currentValue: number;
}

interface SectorBreakdownItem {
  sector: string;
  value: number;
  pct: number;
  count: number;
}

interface PortfolioSectorBreakdownProps {
  holdings: { id: string; ticker: string }[];
  projections: Record<string, HoldingProjection | null>;
}

export function PortfolioSectorBreakdown({ holdings, projections }: PortfolioSectorBreakdownProps) {
  const tickers = useMemo(() => holdings.map((h) => h.ticker.toUpperCase()), [holdings]);

  const { data: fundamentals } = useQuery({
    queryKey: ["portfolio-sector-fundamentals", tickers],
    queryFn: async () => {
      if (!tickers.length) return [];
      const { data, error } = await supabase
        .from("stock_fundamentals")
        .select("ticker, sector")
        .in("ticker", tickers);
      if (error) throw error;
      return data ?? [];
    },
    enabled: tickers.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  const sectorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of fundamentals ?? []) {
      if (f.sector) map[f.ticker.toUpperCase()] = f.sector;
    }
    return map;
  }, [fundamentals]);

  const breakdown = useMemo((): SectorBreakdownItem[] => {
    const bySector: Record<string, { value: number; count: number }> = {};
    let totalValue = 0;

    for (const h of holdings) {
      const p = projections[h.id];
      if (!p || p.currentValue <= 0) continue;
      const ticker = h.ticker.toUpperCase();
      const sector = (sectorMap[ticker] as SectorName) || primarySectorOf(ticker) || "Unknown";
      bySector[sector] ??= { value: 0, count: 0 };
      bySector[sector].value += p.currentValue;
      bySector[sector].count += 1;
      totalValue += p.currentValue;
    }

    if (totalValue <= 0) return [];

    return Object.entries(bySector)
      .map(([sector, { value, count }]) => ({
        sector,
        value,
        count,
        pct: value / totalValue,
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdings, projections, sectorMap]);

  if (!breakdown.length) return null;

  return (
    <div className="chart-surface p-5 space-y-4">
      <div className="flex items-center gap-2">
        <PieChart className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-mono font-bold uppercase tracking-widest">Portfolio Sector Distribution</h3>
      </div>
      <div className="space-y-3">
        {breakdown.map((item) => (
          <div key={item.sector} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{item.sector}</span>
              <span className="font-mono text-muted-foreground">
                {(item.pct * 100).toFixed(1)}% · ${item.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                <span className="ml-1 text-[10px]">({item.count} {item.count === 1 ? "holding" : "holdings"})</span>
              </span>
            </div>
            <div className="flex-1 bg-secondary rounded h-2.5 overflow-hidden">
              <div
                className="h-full bg-primary rounded"
                style={{ width: `${item.pct * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
