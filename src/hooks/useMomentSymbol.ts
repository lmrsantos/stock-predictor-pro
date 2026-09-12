// hooks/useMomentSymbol.ts
// ─────────────────────────────────────────────────────────────────────────────
// One symbol, one fetch, every engine. Cards read from this and each failure
// stays local: a fundamentals error must never blank the chart.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { backtest, type ForecastResult, type BacktestDataPoint } from "@/lib/backtest";
import { fetchAndStoreStockData, getStockDataFromDB } from "@/lib/stock-data";
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
  const [data, setData] = useState<MomentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fundamentals, setFundamentals] = useState<MomentFundamentals | null>(null);
  const [fundamentalsError, setFundamentalsError] = useState<string | null>(null);
  const [fundamentalsLoading, setFundamentalsLoading] = useState(false);

  // Conditioned pattern evidence — the pipeline is cached for the session and
  // only recomputes when prices refresh, so symbol switches are cheap.
  const [baseRates, setBaseRates] = useState<SymbolBaseRates | null>(null);

  useEffect(() => {
    if (!ticker) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    (async () => {
      try {
        const fetched = await fetchAndStoreStockData(ticker, "2y").catch(() => null);
        let rows = await getStockDataFromDB(ticker, "2y");
        if (!rows || rows.length < 60) rows = await getStockDataFromDB(ticker, "5y");

        // The edge function writes its cache in the background, so the stored
        // rows we just read can lag the live response by a session or more.
        // Overlay the freshly fetched bars so the newest close always wins.
        rows = mergeLive(rows ?? [], fetched?.prices ?? []);

        if (!rows || rows.length < 60) {
          throw new Error(
            `We only have ${rows?.length ?? 0} days of price history for ${ticker} — too little to check anything honestly.`,
          );
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
        if (!levels) throw new Error("Not enough clean price history to place support and resistance.");

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
            { symbol: ticker, dates, closes, listingYears: null, sector: fetched?.fundamentals?.sector ?? "" },
            { sectorCompositeReturns: null },
          );
        } catch {
          setups = [];
        }

        const last = closes[closes.length - 1];
        const prev = closes[closes.length - 2];
        const yearWindow = closes.slice(-252);

        if (cancelled) return;
        setData({
          ticker,
          companyName: fetched?.name ?? null,
          sector: fetched?.fundamentals?.sector ?? null,
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
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ticker]);

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

  return { data, loading, error, fundamentals, fundamentalsError, fundamentalsLoading, baseRates };
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
