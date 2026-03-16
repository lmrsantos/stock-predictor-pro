import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAndStoreStockData, getStockDataFromDB, getFundamentalsFromDB } from "@/lib/stock-data";
import { computeLinearRegression } from "@/lib/regression";
import { ChartDataPoint } from "@/lib/types";
import { Sidebar } from "@/components/Sidebar";
import { MarketTicker } from "@/components/MarketTicker";
import { StockHeader } from "@/components/StockHeader";
import { RegressionChart } from "@/components/RegressionChart";
import { DataTable } from "@/components/DataTable";
import { InvestmentRecommendation } from "@/components/InvestmentRecommendation";

const Index = () => {
  const [ticker, setTicker] = useState("^DJI");
  const [searchInput, setSearchInput] = useState("^DJI");
  const [period, setPeriod] = useState("1y");
  const [forecastDays, setForecastDays] = useState(30);
  const [showTable, setShowTable] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

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
    staleTime: 10 * 60 * 1000, // 10 min cache
  });

  // Step 2: Read from DB
  const { data: stockData, isLoading: isQuerying, error: queryError } = useQuery({
    queryKey: ["stock-db", ticker, period],
    queryFn: () => getStockDataFromDB(ticker, period),
    enabled: !!meta, // Only query DB after fetch completes
    staleTime: 10 * 60 * 1000,
  });

  // Step 3: Read fundamentals from DB
  const { data: dbFundamentals } = useQuery({
    queryKey: ["fundamentals-db", ticker],
    queryFn: () => getFundamentalsFromDB(ticker),
    enabled: !!meta,
    staleTime: 10 * 60 * 1000,
  });

  const fundamentals = meta?.fundamentals || dbFundamentals || null;
  const analystRating = meta?.analystRating || null;

  const isLoading = isFetching || isQuerying;
  const error = fetchError || queryError;

  const regression = stockData?.length
    ? computeLinearRegression(stockData, forecastDays)
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

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Top ticker bar */}
      <MarketTicker currentTicker={ticker} />

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
        />

        <InvestmentRecommendation
          regression={regression}
          fundamentals={fundamentals}
          analystRating={analystRating}
          lastPrice={lastPrice}
          ticker={ticker}
          isLoading={isLoading}
        />

        {error ? (
          <div className="flex-1 chart-surface flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-accent-danger text-sm font-mono">Error loading data</p>
              <p className="text-muted-foreground text-xs">{(error as Error).message}</p>
            </div>
          </div>
        ) : (
          <>
            <RegressionChart
              data={chartData}
              isLoading={isLoading}
              slopePositive={regression ? regression.slope >= 0 : true}
            />
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
    </div>
  );
};

export default Index;
