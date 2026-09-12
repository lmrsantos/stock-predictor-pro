// hooks/useMomentSymbol.ts
// ─────────────────────────────────────────────────────────────────────────────
// One symbol, one fetch, every engine. Cards read from this and each failure
// stays local: a fundamentals error must never blank the chart.
//
// The price pipeline is the same one the main Quant Forecast chart uses
// (src/pages/Index.tsx): fetch-stock-data with staleTime 0 → read stock_prices
// back once that fetch resolved → fall back to the edge response's own prices
// while the cache write is still landing. Extended-session prints come from
// fetch-extended-hours, exactly as on the main chart.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { backtest, type ForecastResult, type BacktestDataPoint } from "@/lib/backtest";
import { fetchAndStoreStockData, getStockDataFromDB, SymbolNotFoundError } from "@/lib/stock-data";
import { computeStructuralLevels, type StructuralLevels } from "@/lib/support-resistance";
import { analyzeTrendTermStructure, type TrendTermStructure } from "@/lib/trend-term-structure";
import { computeTradePlan, type TradePlan } from "@/lib/trade-plan";
import { detectCurrentSetups } from "@/lib/setup-detector";
import {
  runBaseRatePipeline, baseRatesForSymbol, makeSymbolSeries, fetchListingYears,
  type SymbolBaseRates,
} from "@/lib/base-rate-pipeline";
import type { StockDataPoint } from "@/lib/types";

export interface MomentFundamentals {
  peRatio: number | null;
  sectorPe: number | null;
  revenueGrowthYoY: number | null;
  freeCashFlow: number | null;
  sharesChangeYoY: number | null;
}

export interface MomentExtendedQuote {
  label: string;
  price: number;
  change: number;
  changePct: number;
}

export interface MomentData {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  rows: StockDataPoint[];
  points: BacktestDataPoint[];
  forecast: ForecastResult;
  levels: StructuralLevels;
  trend: TrendTermStructure;
  plan: TradePlan | null;
  setups: { name: string; rationale: string }[];
  currentPrice: number;
  dayChangePct: number | null;
  asOfDate: string;
  week52Low: number;
  week52High: number;
}

export function useMomentSymbol(ticker: string | null) {
  const [fundamentals, setFundamentals] = useState<MomentFundamentals | null>(null);
  const [fundamentalsError, setFundamentalsError] = useState<string | null>(null);
  const [fundamentalsLoading, setFundamentalsLoading] = useState(false);

  // Conditioned pattern evidence — the pipeline is cached for the session and
  // only recomputes when prices refresh, so symbol switches are cheap.
  const [baseRates, setBaseRates] = useState<SymbolBaseRates | null>(null);

  // Step 1: Fetch from Yahoo Finance → store in DB (main-chart pipeline).
  const {
    data: meta,
    isLoading: isFetching,
    error: fetchError,
  } = useQuery({
    queryKey: ["fetch-stock", ticker, "2y"],
    queryFn: () => fetchAndStoreStockData(ticker as string, "2y"),
    enabled: !!ticker,
    retry: (count, err) => !(err instanceof SymbolNotFoundError) && count < 1,
    staleTime: 0, // always fetch fresh data
  });

  // Step 2: Read back from DB, only once the fetch/store completed.
  const { data: dbStockData, isLoading: isQuerying } = useQuery({
    queryKey: ["stock-db", ticker, "2y"],
    queryFn: () => getStockDataFromDB(ticker as string, "2y"),
    enabled: !!ticker && !!meta,
    staleTime: 10 * 60 * 1000,
  });

  // Step 2b: Extended-session quote. Yahoo's marketState decides whether a
  // pre-market or after-hours print is the relevant "latest" price.
  const { data: extended } = useQuery({
    queryKey: ["extended-hours", ticker],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-extended-hours", {
        body: { ticker },
      });
      if (error) throw error;
      return data as {
        regularClose: number | null;
        marketState: string | null;
        pre: { price: number; time: number } | null;
        post: { price: number; time: number } | null;
      };
    },
    enabled: !!ticker,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    retry: false,
  });

  const extendedQuote = useMemo<MomentExtendedQuote | null>(() => {
    const state = (extended?.marketState || "").toUpperCase();
    if (!state || state === "REGULAR") return null;

    const isPre = state === "PRE" || state === "PREPRE";
    const print = isPre ? extended?.pre : extended?.post;
    if (!print?.price) return null;

    const ref = extended?.regularClose;
    const change = ref ? print.price - ref : 0;
    const changePct = ref ? change / ref : 0;

    return { label: isPre ? "Pre-market" : "After hours", price: print.price, change, changePct };
  }, [extended]);

  // DB rows win when present; the edge response's own prices cover the window
  // before its background cache write lands.
  const rows: StockDataPoint[] | undefined = dbStockData?.length ? dbStockData : meta?.prices;

  const computed = useMemo<{ data: MomentData | null; error: string | null }>(() => {
    if (!ticker || !rows?.length) return { data: null, error: null };
    try {
      if (rows.length < 60) {
        return {
          data: null,
          error: `We only have ${rows.length} days of price history for ${ticker} — too little to check anything honestly.`,
        };
      }

      const points: BacktestDataPoint[] = rows.map((d) => ({
        date: d.date,
        timestamp: d.timestamp,
        actual: d.close,
      }));
      const closes = rows.map((d) => d.close);
      const dates = rows.map((d) => d.date);

      const forecast = backtest(points, 6, 30);
      const levels = computeStructuralLevels({
        ticker,
        closes,
        dates,
        highs: rows.map((d) => d.high),
        lows: rows.map((d) => d.low),
      });
      if (!levels) {
        return { data: null, error: "Not enough clean price history to place support and resistance." };
      }

      const trend = analyzeTrendTermStructure(closes);
      const plan = computeTradePlan({
        ticker,
        shares: 0,
        avgCost: closes[closes.length - 1],
        data: rows,
        risk: "moderate",
        horizon: "position",
      });

      let setups: { name: string; rationale: string }[] = [];
      try {
        setups = detectCurrentSetups(
          { symbol: ticker, dates, closes, listingYears: null, sector: meta?.fundamentals?.sector ?? "" },
          { sectorCompositeReturns: null },
        );
      } catch {
        setups = [];
      }

      const last = closes[closes.length - 1];
      const prev = closes[closes.length - 2];
      const yearWindow = closes.slice(-252);

      return {
        data: {
          ticker,
          companyName: meta?.name ?? null,
          sector: meta?.fundamentals?.sector ?? null,
          rows,
          points,
          forecast,
          levels,
          trend,
          plan,
          setups,
          currentPrice: last,
          dayChangePct: prev > 0 ? ((last - prev) / prev) * 100 : null,
          asOfDate: dates[dates.length - 1],
          week52Low: Math.min(...yearWindow),
          week52High: Math.max(...yearWindow),
        },
        error: null,
      };
    } catch (e) {
      return { data: null, error: (e as Error).message };
    }
  }, [ticker, rows, meta]);

  const data = computed.data;
  const loading = !!ticker && (isFetching || (isQuerying && !meta?.prices?.length) || (!data && !computed.error && !fetchError));
  const error = computed.error ?? (fetchError ? (fetchError as Error).message : null);

  // Fundamentals live on their own request so they can fail alone.
  useEffect(() => {
    if (!ticker) {
      setFundamentals(null);
      setFundamentalsError(null);
      return;
    }
    let cancelled = false;
    setFundamentalsLoading(true);
    setFundamentals(null);
    setFundamentalsError(null);

    (async () => {
      try {
        const { data: fin, error: err } = await supabase.functions.invoke("fetch-financials", {
          body: { ticker },
        });
        if (err) throw err;
        if (fin?.error) throw new Error(fin.error);
        if (cancelled) return;
        setFundamentals({
          peRatio: num(fin?.peRatio ?? fin?.pe_ratio),
          sectorPe: num(fin?.sectorPe ?? fin?.sectorMedianPe),
          revenueGrowthYoY: num(fin?.revenueGrowthYoY),
          freeCashFlow: num(fin?.freeCashFlow),
          sharesChangeYoY: num(fin?.sharesChangeYoY),
        });
      } catch (e) {
        if (!cancelled) setFundamentalsError((e as Error).message);
      } finally {
        if (!cancelled) setFundamentalsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  // Pattern evidence runs on its own effect — it may take a few seconds the
  // first time while the universe pipeline builds, and must never block or
  // blank the rest of the screen.
  useEffect(() => {
    if (!ticker || !data) {
      setBaseRates(null);
      return;
    }
    let cancelled = false;
    setBaseRates(null);

    (async () => {
      try {
        const pipeline = await runBaseRatePipeline();
        const listingYears = await fetchListingYears(ticker);
        const series = makeSymbolSeries(
          ticker,
          data.rows.map((r) => r.date),
          data.rows.map((r) => r.close),
          data.sector,
          null,
          listingYears,
        );
        const resolved = baseRatesForSymbol(pipeline, ticker, series);
        if (!cancelled) setBaseRates(resolved);
      } catch {
        if (!cancelled) setBaseRates(null);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, data]);

  return {
    data,
    loading,
    error,
    fundamentals,
    fundamentalsError,
    fundamentalsLoading,
    baseRates,
    extendedQuote,
  };
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
