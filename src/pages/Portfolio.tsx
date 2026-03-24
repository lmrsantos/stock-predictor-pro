import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAndStoreStockData, getStockDataFromDB } from "@/lib/stock-data";
import { computeLinearRegression } from "@/lib/regression";
import { TickerSearch } from "@/components/TickerSearch";
import { ArrowLeft, Briefcase, Plus, Trash2, Loader2, LogIn, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";

interface Holding {
  id: string;
  ticker: string;
  company_name: string | null;
  shares: number;
  avg_cost: number;
  added_at: string;
}

interface HoldingProjection {
  ticker: string;
  companyName: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  totalCost: number;
  currentValue: number;
  gainLoss: number;
  gainLossPct: number;
  projected30d: number;
  projected90d: number;
  projected1y: number;
  annualReturn: number;
  rSquared: number;
}

function HoldingRow({ holding, onDelete }: { holding: Holding; onDelete: (id: string) => void }) {
  const { data: meta } = useQuery({
    queryKey: ["portfolio-fetch", holding.ticker],
    queryFn: () => fetchAndStoreStockData(holding.ticker, "1y"),
    retry: 1,
    staleTime: 30 * 60 * 1000,
  });

  const { data: stockData } = useQuery({
    queryKey: ["portfolio-db", holding.ticker],
    queryFn: () => getStockDataFromDB(holding.ticker, "1y"),
    enabled: !!meta,
    staleTime: 30 * 60 * 1000,
  });

  const projection = useMemo((): HoldingProjection | null => {
    if (!stockData?.length) return null;

    const regression = computeLinearRegression(stockData, 365);
    const currentPrice = stockData[stockData.length - 1].close;
    const totalCost = holding.shares * holding.avg_cost;
    const currentValue = holding.shares * currentPrice;
    const dailySlope = regression.slope;

    const project = (days: number) => holding.shares * (currentPrice + dailySlope * days);

    return {
      ticker: holding.ticker,
      companyName: holding.company_name || meta?.name || holding.ticker,
      shares: holding.shares,
      avgCost: holding.avg_cost,
      currentPrice,
      totalCost,
      currentValue,
      gainLoss: currentValue - totalCost,
      gainLossPct: totalCost > 0 ? (currentValue - totalCost) / totalCost : 0,
      projected30d: project(30),
      projected90d: project(90),
      projected1y: project(365),
      annualReturn: currentPrice > 0 ? (dailySlope * 252) / currentPrice : 0,
      rSquared: regression.rSquared,
    };
  }, [stockData, holding, meta]);

  if (!projection) {
    return (
      <tr className="border-b border-border/50">
        <td className="px-4 py-3 font-mono font-bold text-primary">{holding.ticker}</td>
        <td colSpan={8} className="px-4 py-3 text-muted-foreground text-sm">
          <Loader2 className="w-3 h-3 animate-spin inline mr-2" />Loading…
        </td>
      </tr>
    );
  }

  const p = projection;
  const gl = p.gainLoss >= 0;

  return (
    <tr className="border-b border-border/50 hover:bg-accent/30 transition-colors">
      <td className="px-4 py-3">
        <Link to={`/?ticker=${p.ticker}`} className="font-mono font-bold text-primary hover:underline">{p.ticker}</Link>
        <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">{p.companyName}</div>
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm">{p.shares}</td>
      <td className="px-4 py-3 text-right font-mono text-sm">${p.avgCost.toFixed(2)}</td>
      <td className="px-4 py-3 text-right font-mono text-sm">${p.currentPrice.toFixed(2)}</td>
      <td className="px-4 py-3 text-right font-mono text-sm">${p.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
      <td className={`px-4 py-3 text-right font-mono text-sm ${gl ? "price-positive" : "price-negative"}`}>
        {gl ? "+" : ""}${p.gainLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        <div className="text-[10px]">{gl ? "+" : ""}{(p.gainLossPct * 100).toFixed(1)}%</div>
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm">${p.projected30d.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
      <td className="px-4 py-3 text-right font-mono text-sm">${p.projected1y.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
      <td className={`px-4 py-3 text-right font-mono text-sm ${p.annualReturn >= 0 ? "price-positive" : "price-negative"}`}>
        {p.annualReturn >= 0 ? "+" : ""}{(p.annualReturn * 100).toFixed(1)}%
      </td>
      <td className="px-4 py-3 text-center">
        <button onClick={() => onDelete(holding.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

export default function Portfolio() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [newTicker, setNewTicker] = useState("");
  const [newShares, setNewShares] = useState("");
  const [newCost, setNewCost] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  // Fetch holdings
  const { data: holdings = [], isLoading } = useQuery({
    queryKey: ["portfolio-holdings", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portfolio_holdings")
        .select("*")
        .order("added_at", { ascending: false });
      if (error) throw error;
      return data as Holding[];
    },
    enabled: !!user,
  });

  // Add holding
  const addMutation = useMutation({
    mutationFn: async ({ ticker, shares, avgCost, companyName }: { ticker: string; shares: number; avgCost: number; companyName?: string }) => {
      const { error } = await supabase.from("portfolio_holdings").insert({
        user_id: user!.id,
        ticker: ticker.toUpperCase(),
        shares,
        avg_cost: avgCost,
        company_name: companyName || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio-holdings"] });
      setNewTicker("");
      setNewShares("");
      setNewCost("");
      setShowAdd(false);
      toast.success("Holding added to portfolio");
    },
    onError: (err: any) => {
      if (err.message?.includes("duplicate")) {
        toast.error("This ticker is already in your portfolio");
      } else {
        toast.error("Failed to add holding");
      }
    },
  });

  // Delete holding
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("portfolio_holdings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio-holdings"] });
      toast.success("Holding removed");
    },
  });

  const handleAdd = () => {
    const ticker = newTicker.trim().toUpperCase();
    const shares = Number(newShares);
    const avgCost = Number(newCost);
    if (!ticker || shares <= 0 || avgCost <= 0) {
      toast.error("Please fill in all fields with valid values");
      return;
    }
    addMutation.mutate({ ticker, shares, avgCost });
  };

  // Portfolio totals
  const totalCost = holdings.reduce((sum, h) => sum + h.shares * h.avg_cost, 0);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border px-6 py-4 flex items-center gap-4">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-primary" />
            <h1 className="text-sm font-mono font-bold tracking-widest uppercase">Portfolio</h1>
          </div>
        </header>
        <div className="max-w-md mx-auto mt-24 text-center space-y-4 px-6">
          <Briefcase className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-xl font-bold">Sign in to access your Portfolio</h2>
          <p className="text-sm text-muted-foreground">
            Track your holdings, see projected performance using our regression model, and simulate investment outcomes.
          </p>
          <button
            onClick={() => navigate("/auth")}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-mono font-bold hover:bg-primary/90 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-primary" />
            <h1 className="text-sm font-mono font-bold tracking-widest uppercase">My Portfolio</h1>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-mono font-bold hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Holding
        </button>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Add Form */}
        {showAdd && (
          <div className="chart-surface p-5 space-y-4">
            <h3 className="text-sm font-mono font-bold">Add New Holding</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Ticker</label>
                <TickerSearch
                  value={newTicker}
                  onChange={setNewTicker}
                  onSelect={(symbol) => setNewTicker(symbol)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Shares</label>
                <input
                  type="number"
                  value={newShares}
                  onChange={(e) => setNewShares(e.target.value)}
                  placeholder="100"
                  min="0.01"
                  step="0.01"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono input-focus"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Avg Cost per Share ($)</label>
                <input
                  type="number"
                  value={newCost}
                  onChange={(e) => setNewCost(e.target.value)}
                  placeholder="150.00"
                  min="0.01"
                  step="0.01"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono input-focus"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleAdd}
                  disabled={addMutation.isPending}
                  className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-mono font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Add"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        {holdings.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="stat-card">
              <div className="text-xs text-muted-foreground">Holdings</div>
              <div className="text-2xl font-mono mt-1">{holdings.length}</div>
            </div>
            <div className="stat-card">
              <div className="text-xs text-muted-foreground">Total Invested</div>
              <div className="text-2xl font-mono mt-1">${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </div>
            <div className="stat-card col-span-2">
              <div className="text-xs text-muted-foreground">Model-Powered Projections</div>
              <div className="text-sm text-muted-foreground mt-1">
                Each holding is analyzed using our Enhanced-V2 regression model with momentum, volatility, and risk adjustments.
              </div>
            </div>
          </div>
        )}

        {/* Holdings Table */}
        {isLoading ? (
          <div className="chart-surface p-8 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
            <span className="text-sm text-muted-foreground">Loading portfolio…</span>
          </div>
        ) : holdings.length === 0 ? (
          <div className="chart-surface p-12 text-center space-y-3">
            <Briefcase className="w-10 h-10 text-muted-foreground mx-auto" />
            <h3 className="text-lg font-bold">Your portfolio is empty</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Add your stock holdings to see projected performance powered by our regression model. 
              Track gains, losses, and future projections all in one place.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-mono hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Your First Holding
            </button>
          </div>
        ) : (
          <div className="chart-surface overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Ticker</th>
                  <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Shares</th>
                  <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Avg Cost</th>
                  <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Current</th>
                  <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Value</th>
                  <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Gain/Loss</th>
                  <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">30d Proj</th>
                  <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">1Y Proj</th>
                  <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Ann. Return</th>
                  <th className="text-center px-4 py-3 font-bold uppercase tracking-widest text-[10px]"></th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <HoldingRow key={h.id} holding={h} onDelete={(id) => deleteMutation.mutate(id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="text-[10px] text-muted-foreground text-center">
          Projections are based on the Enhanced-V2 regression model. Past performance does not guarantee future results. Not financial advice.
        </div>
      </main>
    </div>
  );
}
