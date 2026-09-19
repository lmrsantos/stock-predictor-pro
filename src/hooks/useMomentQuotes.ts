// hooks/useMomentQuotes.ts
// Live quotes for a list of tickers. Everything shown in Quant Moment's lists
// is a current market price; when a quote can't be reached the row says so
// rather than falling back to a stale number.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LiveQuote {
  ticker: string;
  price: number;
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
  marketState: string | null;
  extendedPrice: number | null;
  extendedLabel: string | null;
  extendedChangePct: number | null;
}

export function useMomentQuotes(tickers: string[]) {
  const key = [...tickers].sort().join(",");

  const query = useQuery({
    queryKey: ["moment-quotes", key],
    enabled: tickers.length > 0,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("moment-quotes", {
        body: { tickers },
      });
      if (error) throw error;
      return (data?.quotes ?? {}) as Record<string, LiveQuote>;
    },
  });

  return {
    quotes: query.data ?? {},
    loading: query.isLoading,
    error: query.error ? "Live prices are unavailable right now." : null,
  };
}
