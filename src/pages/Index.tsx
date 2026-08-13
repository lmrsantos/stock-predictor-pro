import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { Sparkles, User, TrendingUp, Briefcase, Table2, FlaskConical, BarChart3, Globe, Network, LineChart as LineChartIcon, ClipboardList } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAndStoreStockData, getStockDataFromDB, getFundamentalsFromDB, SymbolNotFoundError } from "@/lib/stock-data";
import { computeLinearRegression, RiskContext } from "@/lib/regression";
import { ChartDataPoint } from "@/lib/types";
import { simulateMonteCarlo } from "@/lib/monte-carlo";


import { ChartControls, ForecastModel, forecastModels } from "@/components/ChartControls";
import { MarketTicker } from "@/components/MarketTicker";
import { MacroIndicatorStrip } from "@/components/MacroIndicatorStrip";
import { StockHeader } from "@/components/StockHeader";
import { EarningsAlert } from "@/components/EarningsAlert";
import { RegressionChart } from "@/components/RegressionChart";
import { TrendStructurePanel } from "@/components/TrendStructurePanel";
import { useTrendAnimation } from "@/hooks/useTrendAnimation";
import { DataTable } from "@/components/DataTable";
import { PortfolioAdvisor } from "@/components/PortfolioAdvisor";
import { HotStocks } from "@/components/HotStocks";
import { GlobalSentiment } from "@/components/GlobalSentiment";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { QuantAgent } from "@/components/QuantAgent";
import { QuantAgentGate } from "@/components/QuantAgentGate";
import { FeatureGate } from "@/components/FeatureGate";

import { BacktestModal } from "@/components/BacktestModal";
import { PreInvestmentChecklist } from "@/components/PreInvestmentChecklist";
import { RegressionStatsBar } from "@/components/RegressionStatsBar";
import { backtest, type BacktestResult } from "@/lib/backtest";
import { analyzeCycles } from "@/lib/cycle-analysis";
import { slopeToAnnualReturn } from "@/lib/regression";

const Index = () => {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { tier } = useSubscription();
  const initialTicker = (searchParams.get("ticker") || "^GSPC").toUpperCase();
  const [ticker, setTicker] = useState(initialTicker);
  const [searchInput, setSearchInput] = useState(initialTicker);
  const [period, setPeriod] = useState("1y");
  const [forecastDays, setForecastDays] = useState(30);
  const [forecastModel, setForecastModel] = useState<ForecastModel>("regression");
  
  const [showTable, setShowTable] = useState(false);
  const [showTrendStructure, setShowTrendStructure] = useState(false);
  const [showBacktest, setShowBacktest] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [activeView, setActiveView] = useState<"chart" | "advisor">("chart");
  const [hotStocksOpen, setHotStocksOpen] = useState(false);
  const [sentimentOpen, setSentimentOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);


  // React to ?ticker= param changes (e.g. navigation from Portfolio)
  useEffect(() => {
    const t = searchParams.get("ticker");
    if (t) {
      const up = t.toUpperCase();
      setTicker(up);
      setSearchInput(up);
    }
    const open = searchParams.get("open");
    if (open === "hot_stocks") setHotStocksOpen(true);
    else if (open === "sentiment") setSentimentOpen(true);
    else if (open === "backtest") setShowBacktest(true);
  }, [searchParams]);

  useEffect(() => {
    if (showTable && tableRef.current) {
      tableRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showTable]);

  const handleSearch = useCallback((overrideTicker?: string) => {
    const cleaned = (overrideTicker || searchInput).trim().toUpperCase();
    if (cleaned) {
      setSearchInput(cleaned);
      setTicker(cleaned);
    }
  }, [searchInput]);

  const isIntraday = period === "1d";

  // Step 1: Fetch from Yahoo Finance → store in DB
  const { data: meta, isLoading: isFetching, error: fetchError } = useQuery({
    queryKey: ["fetch-stock", ticker, isIntraday ? "1mo" : period],
    queryFn: () => fetchAndStoreStockData(ticker, isIntraday ? "1mo" : period),
    retry: (count, err) => !(err instanceof SymbolNotFoundError) && count < 1,
    staleTime: 0, // always fetch fresh data
  });

  // Step 2: Read from DB
  const { data: dbStockData, isLoading: isQuerying, error: queryError } = useQuery({
    queryKey: ["stock-db", ticker, period],
    queryFn: () => getStockDataFromDB(ticker, period),
    enabled: !!meta && !isIntraday, // Only query DB after fetch completes
    staleTime: 10 * 60 * 1000,
  });

  // Step 2a: 1-day view uses 5-minute intraday bars instead of daily closes
  const { data: intradayData, isLoading: isIntradayLoading } = useQuery({
    queryKey: ["intraday-chart", ticker],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-intraday", {
        body: { tickers: [ticker] },
      });
      if (error) throw error;
      const s = (data?.series ?? {})[ticker.toUpperCase()] as
        | { points: { t: number; c: number }[] }
        | undefined;
      return (s?.points ?? []).map((p) => ({
        date: new Date(p.t * 1000).toISOString(),
        timestamp: p.t,
        open: p.c,
        high: p.c,
        low: p.c,
        close: p.c,
        volume: 0,
      }));
    },
    enabled: isIntraday && !!ticker,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  const baseStockData = isIntraday
    ? intradayData
    : dbStockData?.length
      ? dbStockData
      : meta?.prices;

  // Step 2b: Extended-session quote. Yahoo's marketState decides whether a
  // pre-market or after-hours print is the relevant "latest" price. During the
  // regular session neither is shown.
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

  const stockData = baseStockData;


  // marketState: PRE / PREPRE (before open), REGULAR (open), POST / POSTPOST / CLOSED (after close)
  const extendedQuote = useMemo(() => {
    const state = (extended?.marketState || "").toUpperCase();
    if (!state || state === "REGULAR") return null;

    const isPre = state === "PRE" || state === "PREPRE";
    const print = isPre ? extended?.pre : extended?.post;
    if (!print?.price) return null;

    const ref = extended?.regularClose;
    const change = ref ? print.price - ref : 0;
    const changePct = ref ? change / ref : 0;

    return {
      label: isPre ? "Pre-market" : "After hours",
      price: print.price,
      change,
      changePct,
    };
  }, [extended]);




  // Step 3: Read fundamentals from DB
  const { data: dbFundamentals } = useQuery({
    queryKey: ["fundamentals-db", ticker],
    queryFn: () => getFundamentalsFromDB(ticker),
    enabled: !!meta,
    staleTime: 10 * 60 * 1000,
  });

  // Step 3.5: Fetch VIX level for risk context
  const { data: vixData } = useQuery({
    queryKey: ["vix-risk"],
    queryFn: async () => {
      // Fetch recent VIX close price from DB (if available)
      const { data } = await supabase
        .from("stock_prices")
        .select("close")
        .eq("ticker", "^VIX")
        .order("date", { ascending: false })
        .limit(1);
      return data?.[0]?.close ? Number(data[0].close) : null;
    },
    staleTime: 30 * 60 * 1000, // 30 min
  });

  // Step 3.6: Fetch geopolitical tension score
  const { data: tensionData } = useQuery({
    queryKey: ["tension-risk"],
    queryFn: async () => {
      const { data } = await supabase
        .from("geopolitical_sentiment")
        .select("tension_score")
        .order("created_at", { ascending: false })
        .limit(1);
      return data?.[0]?.tension_score ?? null;
    },
    staleTime: 30 * 60 * 1000,
  });

  // Step 3.7: Fetch macro indicators (shared with MacroIndicatorStrip via same key)
  const { data: macroIndicators } = useQuery({
    queryKey: ["macro-indicators"],
    queryFn: async () => {
      const { data: cache } = await supabase.from("macro_indicators").select("*");
      return cache ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Step 3.8: Earnings calendar for the active symbol (used by the alert banner)
  const { data: earnings } = useQuery({
    queryKey: ["earnings-calendar", ticker],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-financials", {
        body: { ticker, calendarOnly: true },
      });

      if (error) return null;
      const info = (data as { companyInfo?: Record<string, unknown> } | null)?.companyInfo;
      if (!info) return null;
      return {
        date: (info.nextEarningsDate as string | null) ?? null,
        time: (info.nextEarningsTime as string | null) ?? null,
      };

    },
    staleTime: 6 * 60 * 60 * 1000,
    retry: false,
  });


  const fundamentals = meta?.fundamentals || dbFundamentals || null;
  const analystRating = meta?.analystRating || null;
  const website = meta?.website || null;
  const irWebsite = meta?.irWebsite || null;

  const isLoading = isIntraday
    ? isIntradayLoading
    : isFetching || (isQuerying && !meta?.prices?.length);

  const error = fetchError || (stockData?.length ? null : queryError);

  // Build risk context from VIX + geopolitical tension
  const riskContext: RiskContext | undefined = (vixData || tensionData) ? {
    vixLevel: vixData ?? undefined,
    tensionScore: tensionData ?? undefined,
  } : undefined;

  const regression = stockData?.length
    ? computeLinearRegression(stockData, forecastDays, riskContext)
    : null;

  const lastPrice = stockData?.length ? stockData[stockData.length - 1].close : 0;

  // Build unified chart data
  const chartData: ChartDataPoint[] = [];
  const volumeByDate = new Map<string, { volume: number; up: boolean }>();
  (stockData ?? []).forEach((d, i) => {
    const prev = i > 0 ? stockData![i - 1].close : d.open;
    volumeByDate.set(d.date, { volume: d.volume, up: d.close >= prev });
  });
  if (regression) {
    regression.historicalFit.forEach((f) => {
      const vol = volumeByDate.get(f.date);
      chartData.push({
        date: f.date,
        timestamp: f.timestamp,
        volume: vol?.volume,
        volumeUp: vol?.up,
        actual: f.actual,
        fitted: f.fitted,
        upper1Sigma: f.upper1Sigma,
        lower1Sigma: f.lower1Sigma,
        upper2Sigma: f.upper2Sigma,
        lower2Sigma: f.lower2Sigma,
        isForecast: false,
      });
    });

    // Forward path depends on the selected forecast model
    let forwardPoints = regression.predictions.map((p) => ({
      date: p.date,
      timestamp: p.timestamp,
      predicted: p.predicted,
      upper1Sigma: p.upper1Sigma,
      lower1Sigma: p.lower1Sigma,
      upper2Sigma: p.upper2Sigma,
      lower2Sigma: p.lower2Sigma,
    }));

    if (forecastModel !== "regression" && stockData?.length) {
      try {
        if (forecastModel === "montecarlo") {
          const mc = simulateMonteCarlo(stockData.map((d) => d.close), forecastDays);
          if (mc) {
            forwardPoints = regression.predictions.map((p, i) => {
              const m = mc.points[i];
              return {
                date: p.date,
                timestamp: p.timestamp,
                predicted: m.median,
                upper1Sigma: m.p84,
                lower1Sigma: m.p16,
                upper2Sigma: m.p97_5,
                lower2Sigma: m.p2_5,
              };
            });
          }
        } else if (forecastModel === "calibration") {
          const res = backtest(
            stockData.map((d) => ({ date: d.date, timestamp: d.timestamp, actual: d.close })),
            6,
            forecastDays
          );
          forwardPoints = res.forecastPoints.map((p) => ({
            date: p.date,
            timestamp: p.timestamp,
            predicted: p.mean,
            upper1Sigma: p.upper1,
            lower1Sigma: p.lower1,
            upper2Sigma: p.upper2,
            lower2Sigma: p.lower2,
          }));
        } else {

          // Cycle projection: interpolate toward the next projected turning point
          const cyc = analyzeCycles(
            ticker,
            stockData.map((d) => d.close),
            stockData.map((d) => d.date)
          );
          const proj = cyc.projection;
          const goingUp = proj.currentPosition === "near_trough" || proj.troughTrend === "rising";
          const target = goingUp ? proj.nextPeak : proj.nextTrough;
          const horizon = Math.max(forecastDays, Math.round(proj.cycleLength));
          const band = regression.standardDeviation;
          forwardPoints = regression.predictions.map((p, i) => {
            const t = Math.min(1, (i + 1) / horizon);
            const mean = lastPrice + (target - lastPrice) * t;
            const w = band * Math.sqrt((i + 1) / forecastDays);
            return {
              date: p.date,
              timestamp: p.timestamp,
              predicted: mean,
              upper1Sigma: mean + w,
              lower1Sigma: mean - w,
              upper2Sigma: mean + 2 * w,
              lower2Sigma: mean - 2 * w,
            };
          });
        }
      } catch {
        // fall back to regression predictions
      }
    }

    // Join the forecast line to the last actual bar so it doesn't appear to gap
    if (chartData.length && forwardPoints.length) {
      chartData[chartData.length - 1].predicted = chartData[chartData.length - 1].actual;
    }

    forwardPoints.forEach((p) => {
      chartData.push({
        date: p.date,
        timestamp: p.timestamp,
        predicted: p.predicted,
        fitted: p.predicted,
        upper1Sigma: p.upper1Sigma,
        lower1Sigma: p.lower1Sigma,
        upper2Sigma: p.upper2Sigma,
        lower2Sigma: p.lower2Sigma,
        isForecast: true,
      });
    });
  }


  // Change is measured across the selected period: last close vs. the first
  // bar of the visible series (1d → today's open print, 1y → a year ago, …)
  const refPrice = stockData?.length ? stockData[0].close : lastPrice;
  const priceChange = lastPrice - refPrice;
  const priceChangePct = refPrice ? lastPrice / refPrice - 1 : 0;


  const chatContext = {
    ticker,
    price: lastPrice,
    rSquared: regression?.rSquared,
    annualReturn: regression && lastPrice ? slopeToAnnualReturn(regression.slope, lastPrice) : undefined,
    slope: regression?.slope,
    fundamentals: (fundamentals as unknown as Record<string, unknown>) || undefined,
    website: website || undefined,
    backtestResult: backtestResult ? {
      confidenceScore: backtestResult.confidenceScore,
      signal: backtestResult.forecastPoints.at(-1)?.mean && lastPrice
        ? (backtestResult.forecastPoints.at(-1)!.mean > lastPrice ? "bullish" : "bearish")
        : "neutral",
      walkForwardAccuracy: 100 - backtestResult.walkForward.mape,
      hitRate: backtestResult.walkForward.hitRate,
      regime: backtestResult.regime.outsideDistribution ? "regime-shift" : "stable",
      forecastPct: backtestResult.forecastPoints.at(-1)?.mean && lastPrice
        ? ((backtestResult.forecastPoints.at(-1)!.mean - lastPrice) / lastPrice) * 100
        : 0,
      forecastLabel: `${forecastDays} days`,
    } : undefined,
    macroIndicators: macroIndicators && macroIndicators.length
      ? (macroIndicators as any[]).reduce<Record<string, any>>((acc, r) => {
          acc[r.indicator_key] = {
            value: r.value,
            previous_value: r.previous_value,
            change_30d: r.change_30d,
            as_of_date: r.as_of_date,
          };
          return acc;
        }, {})
      : undefined,
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Top nav bar — brand-aligned with Landing */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-background/70 backdrop-blur-xl">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-400 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold tracking-tight text-sm text-foreground group-hover:text-primary transition-colors">
            QuantForecast
          </span>
          <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-muted-foreground ml-1">
            Terminal
          </span>
        </Link>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={() => setShowBacktest(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
          >
            <FlaskConical className="w-4 h-4" />
            Symbol Backtest
          </button>
          <button
            onClick={() => setChecklistOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
          >
            <ClipboardList className="w-4 h-4" />
            Checklist
          </button>

          <Link
            to="/sectors"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
          >
            <LineChartIcon className="w-4 h-4" />
            Sector Chart
          </Link>
          <Link
            to="/sector-backtest"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
          >
            <BarChart3 className="w-4 h-4" />
            Sector Backtest
          </Link>
          <button
            onClick={() => setHotStocksOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
          >
            <span className="text-sm">🔥</span>
            Hot Stocks
          </button>
          <button
            onClick={() => setSentimentOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
          >
            <Globe className="w-4 h-4" />
            Global Sentiment
          </button>
          <Link
            to="/linkages"
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
          >
            <Network className="w-4 h-4" />
            Linkage Engine
          </Link>
          <Link
            to="/ipo-intelligence"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            IPO Intelligence
          </Link>
          <button
            onClick={() => setActiveView(activeView === "advisor" ? "chart" : "advisor")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeView === "advisor"
                ? "bg-accent text-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-accent"
            }`}
          >
            <span className="text-sm">💼</span>
            Portfolio Insights
          </button>

          <div className="w-px h-6 bg-border mx-2" />

          <Link
            to="/portfolio"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
          >
            <Briefcase className="w-4 h-4" />
            My Portfolio
          </Link>
          
          <Link
            to="/pricing"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white hover:opacity-90 transition-opacity"
          >
            <Sparkles className="w-4 h-4" />
            Plans
          </Link>
          {user ? (
            <Link
              to="/account"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
            >
              <User className="w-4 h-4" />
              Account
            </Link>
          ) : (
            <Link
              to="/auth"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
            >
              <User className="w-4 h-4" />
              Sign in
            </Link>
          )}
        </div>
      </div>


      {/* Macro indicators + regime */}
      <MacroIndicatorStrip />

      {/* Top ticker bar */}
      <MarketTicker currentTicker={ticker} onSelectTicker={(symbol) => {
        setSearchInput(symbol);
        setTicker(symbol);
      }} />


      {/* Symbol + controls — fixed row, never overlaps scrolling content */}
      <div className="shrink-0 border-b border-border bg-background px-4 lg:px-5 py-2 flex items-center gap-2 gap-y-2 flex-wrap overflow-visible relative z-30">
        <div className="shrink-0">
          <StockHeader
            ticker={ticker}
            name={meta?.name || ""}
            price={lastPrice}
            change={priceChange}
            changePct={priceChangePct}
            isLoading={isLoading}
            website={website}
            irWebsite={irWebsite}
            extendedQuote={extendedQuote}
          />
        </div>
        <ChartControls
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          onSearch={handleSearch}
          period={period}
          onPeriodChange={setPeriod}
          forecastDays={forecastDays}
          onForecastDaysChange={setForecastDays}
          forecastModel={forecastModel}
          onForecastModelChange={setForecastModel}
          trendStructure={showTrendStructure}
          onTrendStructureChange={setShowTrendStructure}
        />

      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
      <main ref={mainRef} className="p-4 lg:p-5 pt-3 flex flex-col gap-3 overflow-y-auto h-full">

        {error ? (
          <div className="flex-1 chart-surface flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-accent-danger text-sm font-mono">
                {error instanceof SymbolNotFoundError ? "Symbol not found" : "Error loading data"}
              </p>
              <p className="text-muted-foreground text-xs">{(error as Error).message}</p>
            </div>
          </div>
        ) : activeView === "advisor" ? (
          <FeatureGate feature="portfolio_advisor">
            <PortfolioAdvisor />
          </FeatureGate>
        ) : (
          <>
            <EarningsAlert
              ticker={ticker}
              date={earnings?.date}
              time={earnings?.time}
              windowDays={5}
            />


            <RegressionStatsBar
              regression={regression}
              lastPrice={lastPrice}
              isLoading={isLoading}
            />
            <RegressionChart
              data={chartData}
              isLoading={isLoading}
              slopePositive={regression ? regression.slope >= 0 : true}
              intraday={isIntraday}
              trendOverlay={trendActive ? trendAnim.overlay : null}
            />

            {trendActive && (
              <TrendStructurePanel
                symbol={ticker}
                closes={trendCloses}
                anim={trendAnim}
              />
            )}


            <div className="flex justify-start -mt-2 relative z-20">
              <button
                onClick={() => setShowTable(!showTable)}
                title={showTable ? "Hide data table" : "Show data table"}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-colors ${
                  showTable
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                {showTable ? "Hide data table" : "Data table"}
              </button>
            </div>
            {showTable && regression && (
              <div ref={tableRef}>
                <DataTable
                  historicalFit={regression.historicalFit}
                  predictions={chartData
                    .filter((d) => d.isForecast)
                    .map((d, i) => ({
                      date: d.date,
                      timestamp: d.timestamp,
                      dayIndex: i + 1,
                      predicted: d.predicted ?? 0,
                      upper1Sigma: d.upper1Sigma,
                      lower1Sigma: d.lower1Sigma,
                      upper2Sigma: d.upper2Sigma,
                      lower2Sigma: d.lower2Sigma,
                    }))}
                  modelLabel={forecastModels.find((m) => m.value === forecastModel)?.label ?? "Model"}
                />
              </div>
            )}
          </>
        )}
      </main>
      </div>

      <QuantAgentGate>
        <QuantAgent
          context={chatContext}
          onAction={(a) => {
            if (a.kind === "switch_ticker") {
              setSearchInput(a.symbol);
              setTicker(a.symbol);
              setActiveView("chart");
            } else if (a.kind === "navigate") {
              navigate(a.path);
            } else if (a.kind === "open") {
              if (a.target === "hot_stocks") setHotStocksOpen(true);
              else if (a.target === "sentiment") setSentimentOpen(true);
              else if (a.target === "backtest") setShowBacktest(true);
            }
          }}
        />
      </QuantAgentGate>

      {checklistOpen && (
        <PreInvestmentChecklist
          isOpen={checklistOpen}
          onClose={() => setChecklistOpen(false)}
          symbol={ticker}
          snapshotInput={{
            symbol: ticker,
            sector: fundamentals?.sector ?? undefined,
            companyName: meta?.name || undefined,
            dates: (stockData ?? []).map(d => d.date),
            closes: (stockData ?? []).map(d => d.close),
            forecast: backtestResult,
            baseRates: null,
          }}
        />
      )}

      <BacktestModal
        isOpen={showBacktest}
        onClose={() => setShowBacktest(false)}
        ticker={ticker}
        onResult={setBacktestResult}
      />

      <Dialog open={hotStocksOpen} onOpenChange={setHotStocksOpen}>
        <DialogContent className="sm:max-w-md bg-background border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="text-xl">🔥</span>
              Hot Stocks
            </DialogTitle>
          </DialogHeader>
          <HotStocks onSelectTicker={(symbol) => {
            setSearchInput(symbol);
            setTicker(symbol);
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
    </div>
  );
};

export default Index;
