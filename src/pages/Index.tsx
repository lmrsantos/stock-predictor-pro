import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Sparkles, User, TrendingUp, Briefcase, Table2, FlaskConical, BarChart3, Globe } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAndStoreStockData, getStockDataFromDB, getFundamentalsFromDB } from "@/lib/stock-data";
import { computeLinearRegression, RiskContext } from "@/lib/regression";
import { ChartDataPoint } from "@/lib/types";
import { Sidebar } from "@/components/Sidebar";
import { MarketTicker } from "@/components/MarketTicker";
import { StockHeader } from "@/components/StockHeader";
import { RegressionChart } from "@/components/RegressionChart";
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
import { BacktestModal } from "@/components/BacktestModal";
import type { BacktestResult } from "@/lib/backtest";
import { slopeToAnnualReturn } from "@/lib/regression";

const Index = () => {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { tier } = useSubscription();
  const initialTicker = (searchParams.get("ticker") || "^DJI").toUpperCase();
  const [ticker, setTicker] = useState(initialTicker);
  const [searchInput, setSearchInput] = useState(initialTicker);
  const [period, setPeriod] = useState("1y");
  const [forecastDays, setForecastDays] = useState(30);
  const [showTable, setShowTable] = useState(false);
  const [showBacktest, setShowBacktest] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [activeView, setActiveView] = useState<"chart" | "advisor">("chart");
  const [hotStocksOpen, setHotStocksOpen] = useState(false);
  const [sentimentOpen, setSentimentOpen] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // React to ?ticker= param changes (e.g. navigation from Portfolio)
  useEffect(() => {
    const t = searchParams.get("ticker");
    if (t) {
      const up = t.toUpperCase();
      setTicker(up);
      setSearchInput(up);
    }
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

  // Step 1: Fetch from Yahoo Finance → store in DB
  const { data: meta, isLoading: isFetching, error: fetchError } = useQuery({
    queryKey: ["fetch-stock", ticker, period],
    queryFn: () => fetchAndStoreStockData(ticker, period),
    retry: 1,
    staleTime: 0, // always fetch fresh data
  });

  // Step 2: Read from DB
  const { data: dbStockData, isLoading: isQuerying, error: queryError } = useQuery({
    queryKey: ["stock-db", ticker, period],
    queryFn: () => getStockDataFromDB(ticker, period),
    enabled: !!meta, // Only query DB after fetch completes
    staleTime: 10 * 60 * 1000,
  });

  const stockData = dbStockData?.length ? dbStockData : meta?.prices;

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

  const fundamentals = meta?.fundamentals || dbFundamentals || null;
  const analystRating = meta?.analystRating || null;
  const website = meta?.website || null;
  const irWebsite = meta?.irWebsite || null;

  const isLoading = isFetching || (isQuerying && !meta?.prices?.length);
  const error = fetchError || (stockData?.length ? null : queryError);

  // Build risk context from VIX + geopolitical tension
  const riskContext: RiskContext | undefined = (vixData || tensionData) ? {
    vixLevel: vixData ?? undefined,
    tensionScore: tensionData ?? undefined,
  } : undefined;

  const regression = stockData?.length
    ? computeLinearRegression(stockData, forecastDays, riskContext)
    : null;

  // Build unified chart data
  const chartData: ChartDataPoint[] = [];
  if (regression) {
    regression.historicalFit.forEach((f) => {
      chartData.push({
        date: f.date,
        timestamp: f.timestamp,
        actual: f.actual,
        fitted: f.fitted,
        upper1Sigma: f.upper1Sigma,
        lower1Sigma: f.lower1Sigma,
        upper2Sigma: f.upper2Sigma,
        lower2Sigma: f.lower2Sigma,
        isForecast: false,
      });
    });
    regression.predictions.forEach((p) => {
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

  const lastPrice = stockData?.length
    ? stockData[stockData.length - 1].close
    : 0;
  const prevPrice = stockData?.length && stockData.length > 1
    ? stockData[stockData.length - 2].close
    : lastPrice;
  const priceChange = lastPrice - prevPrice;
  const priceChangePct = prevPrice ? priceChange / prevPrice : 0;

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
        <div className="flex items-center gap-2">
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
            {tier !== "free" && (
              <span className="ml-1 text-[10px] uppercase px-1.5 py-0.5 rounded bg-white/20">
                {tier}
              </span>
            )}
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


      {/* Top ticker bar */}
      <MarketTicker currentTicker={ticker} onSelectTicker={(symbol) => {
        setSearchInput(symbol);
        setTicker(symbol);
      }} />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[280px_1fr] min-h-0 overflow-hidden">


      <Sidebar
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onSearch={handleSearch}
        period={period}
        onPeriodChange={setPeriod}
        forecastDays={forecastDays}
        onForecastDaysChange={setForecastDays}
        regression={regression}
        lastPrice={lastPrice}
        isLoading={isLoading}
        fundamentals={fundamentals}
        ticker={ticker}
      />

      <main className="p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">
        <StockHeader
          ticker={ticker}
          name={meta?.name || ""}
          price={lastPrice}
          change={priceChange}
          changePct={priceChangePct}
          isLoading={isLoading}
          showTable={showTable}
          onToggleTable={() => setShowTable(!showTable)}
          onSelectTicker={(symbol) => {
            setSearchInput(symbol);
            setTicker(symbol);
          }}
          website={website}
          irWebsite={irWebsite}
          onRunBacktest={() => setShowBacktest(true)}
          activeView={activeView}
          onViewChange={setActiveView}
        />
        {error ? (
          <div className="flex-1 chart-surface flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-accent-danger text-sm font-mono">Error loading data</p>
              <p className="text-muted-foreground text-xs">{(error as Error).message}</p>
            </div>
          </div>
        ) : activeView === "advisor" ? (
          <PortfolioAdvisor />
        ) : (
          <>
            <RegressionChart
              data={chartData}
              isLoading={isLoading}
              slopePositive={regression ? regression.slope >= 0 : true}
            />
            <div className="flex justify-end -mt-2">
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
                  predictions={regression.predictions}
                />
              </div>
            )}
          </>
        )}
      </main>
      </div>

      <QuantAgent context={chatContext} />

      <BacktestModal
        isOpen={showBacktest}
        onClose={() => setShowBacktest(false)}
        ticker={ticker}
        onResult={setBacktestResult}
      />
    </div>
  );
};

export default Index;
