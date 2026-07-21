import { useState, useMemo, useCallback, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAndStoreStockData, getStockDataFromDB } from "@/lib/stock-data";
import { computeLinearRegression } from "@/lib/regression";
import { TickerSearch } from "@/components/TickerSearch";
import { ArrowLeft, Briefcase, Plus, Trash2, Loader2, LogIn, Pencil, Check, X, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PortfolioIntradaySparkline, usePortfolioIntraday, MiniSparkline } from "@/components/PortfolioIntradaySparkline";

interface Holding {
  id: string;
  ticker: string;
  company_name: string | null;
  shares: number;
  avg_cost: number;
  added_at: string;
  purchase_date: string | null;
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
  projected30dPct: number;
  projected90d: number;
  projected1y: number;
  projected1yPct: number;
  annualReturn: number;
  rSquared: number;
}

function formatHeldFor(dateStr: string | null): string {
  if (!dateStr) return "—";
  const start = new Date(dateStr);
  if (isNaN(start.getTime())) return "—";
  const now = new Date();
  const days = Math.max(0, Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  const years = Math.floor(days / 365);
  const remMonths = Math.floor((days % 365) / 30);
  return remMonths > 0 ? `${years}y ${remMonths}mo` : `${years}y`;
}

function HoldingRow({
  holding,
  onDelete,
  onUpdate,
  onProjection,
  intraday,
}: {
  holding: Holding;
  onDelete: (id: string) => void;
  onUpdate: (id: string, shares: number, avgCost: number, purchaseDate: string | null) => void;
  onProjection: (id: string, p: HoldingProjection | null) => void;
  intraday?: { baseline: number; latest: number; change: number; changePct: number; points: number[] };
}) {
  const [editing, setEditing] = useState(false);
  const [editShares, setEditShares] = useState(String(holding.shares));

  const [editCost, setEditCost] = useState(String(holding.avg_cost));
  const [editDate, setEditDate] = useState(holding.purchase_date || "");


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
    // Use the same risk-adjusted forecast as the main chart (log-space,
    // dampened, momentum, R² scaling, bias-corrected). Forecast a full year
    // so we can pick the 30/90/365 trading-day horizons off the same curve.
    const regression = computeLinearRegression(stockData, 365);
    const currentPrice = stockData[stockData.length - 1].close;
    const totalCost = holding.shares * holding.avg_cost;
    const currentValue = holding.shares * currentPrice;
    const preds = regression.predictions;
    // Predictions skip weekends, so index N ≈ N trading days ahead.
    const priceAt = (tradingDays: number) => {
      if (!preds.length) return currentPrice;
      const idx = Math.min(Math.max(tradingDays - 1, 0), preds.length - 1);
      return preds[idx].predicted;
    };
    // 30 calendar days ≈ 21 trading days; 90 ≈ 63; 365 ≈ 252.
    const price30 = priceAt(21);
    const price90 = priceAt(63);
    const price1y = priceAt(252);
    const projected30d = holding.shares * price30;
    const projected1y = holding.shares * price1y;
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
      projected30d,
      projected30dPct: currentValue > 0 ? (projected30d - currentValue) / currentValue : 0,
      projected90d: holding.shares * price90,
      projected1y,
      projected1yPct: currentValue > 0 ? (projected1y - currentValue) / currentValue : 0,
      annualReturn: currentPrice > 0 ? (price1y - currentPrice) / currentPrice : 0,
      rSquared: regression.rSquared,
    };
  }, [stockData, holding, meta]);

  useEffect(() => {
    onProjection(holding.id, projection);
  }, [projection, holding.id, onProjection]);

  const saveEdit = () => {
    const s = Number(editShares);
    const c = Number(editCost);
    if (s <= 0 || c <= 0 || !isFinite(s) || !isFinite(c)) {
      toast.error("Enter valid values");
      return;
    }
    onUpdate(holding.id, s, c, editDate || null);
    setEditing(false);
  };

  if (!projection) {
    return (
      <tr className="border-b border-border/50">
        <td className="px-4 py-3 font-mono font-bold text-primary">{holding.ticker}</td>
        <td colSpan={10} className="px-4 py-3 text-muted-foreground text-sm">
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
        <Link to={`/terminal?ticker=${p.ticker}`} className="font-mono font-bold text-primary hover:underline">{p.ticker}</Link>
        <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">{p.companyName}</div>
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm">
        {editing ? (
          <input
            type="number" step="0.01" min="0.01" value={editShares}
            onChange={(e) => setEditShares(e.target.value)}
            className="w-20 bg-secondary border border-border rounded px-2 py-1 text-right text-xs"
          />
        ) : p.shares}
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm">
        {editing ? (
          <input
            type="number" step="0.01" min="0.01" value={editCost}
            onChange={(e) => setEditCost(e.target.value)}
            className="w-24 bg-secondary border border-border rounded px-2 py-1 text-right text-xs"
          />
        ) : `$${p.avgCost.toFixed(2)}`}
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm">
        {editing ? (
          <input
            type="date" value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
            className="w-32 bg-secondary border border-border rounded px-2 py-1 text-right text-xs"
          />
        ) : (
          <div>
            <div>{holding.purchase_date ? new Date(holding.purchase_date).toLocaleDateString() : "—"}</div>
            <div className="text-[10px] text-muted-foreground">{formatHeldFor(holding.purchase_date)}</div>
          </div>
        )}
      </td>
      <td className="pl-4 pr-2 py-3 text-right font-mono text-sm">${p.currentPrice.toFixed(2)}</td>
      <td className={`pl-3 pr-4 py-3 text-right font-mono text-sm border-l border-border/40 ${(intraday?.change ?? 0) >= 0 ? "price-positive" : "price-negative"}`}>
        {intraday ? (
          <>
            {(intraday.change >= 0 ? "+" : "-")}${Math.abs(intraday.change).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            <div className="text-[10px]">
              {(intraday.changePct >= 0 ? "+" : "")}{intraday.changePct.toFixed(2)}%
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm">${p.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
      <td className={`px-4 py-3 text-right font-mono text-sm ${gl ? "price-positive" : "price-negative"}`}>
        {gl ? "+" : ""}${p.gainLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        <div className="text-[10px]">{gl ? "+" : ""}{(p.gainLossPct * 100).toFixed(1)}%</div>
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm border-l border-border/40">
        ${p.projected30d.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        <div className={`text-[10px] ${p.projected30dPct >= 0 ? "price-positive" : "price-negative"}`}>
          {p.projected30dPct >= 0 ? "+" : ""}{(p.projected30dPct * 100).toFixed(1)}%
        </div>
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm">
        ${p.projected1y.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        <div className={`text-[10px] ${p.projected1yPct >= 0 ? "price-positive" : "price-negative"}`}>
          {p.projected1yPct >= 0 ? "+" : ""}{(p.projected1yPct * 100).toFixed(1)}%
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-1">
          {editing ? (
            <>
              <button onClick={saveEdit} className="p-1 rounded hover:bg-primary/10 text-primary" title="Save">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => { setEditing(false); setEditShares(String(holding.shares)); setEditCost(String(holding.avg_cost)); setEditDate(holding.purchase_date || ""); }} className="p-1 rounded hover:bg-muted text-muted-foreground" title="Cancel">
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground" title="Edit">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onDelete(holding.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
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
  const [newDate, setNewDate] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [projections, setProjections] = useState<Record<string, HoldingProjection | null>>({});
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const { data: holdings = [], isLoading } = useQuery({
    queryKey: ["portfolio-holdings", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("portfolio_holdings").select("*").order("added_at", { ascending: false });
      if (error) throw error;
      return data as Holding[];
    },
    enabled: !!user,
  });

  const addMutation = useMutation({
    mutationFn: async ({ ticker, shares, avgCost, purchaseDate, companyName }: { ticker: string; shares: number; avgCost: number; purchaseDate: string | null; companyName?: string }) => {
      const { error } = await supabase.from("portfolio_holdings").insert({
        user_id: user!.id, ticker: ticker.toUpperCase(), shares, avg_cost: avgCost, purchase_date: purchaseDate, company_name: companyName || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio-holdings"] });
      setNewTicker(""); setNewShares(""); setNewCost(""); setNewDate(""); setShowAdd(false);
      toast.success("Holding added to portfolio");
    },
    onError: (err: any) => {
      if (err.message?.includes("duplicate")) toast.error("This ticker is already in your portfolio");
      else toast.error("Failed to add holding");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, shares, avgCost, purchaseDate }: { id: string; shares: number; avgCost: number; purchaseDate: string | null }) => {
      const { error } = await supabase.from("portfolio_holdings").update({ shares, avg_cost: avgCost, purchase_date: purchaseDate } as any).eq("id", id);
      if (error) throw error;

    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio-holdings"] });
      toast.success("Holding updated");
    },
    onError: () => toast.error("Failed to update holding"),
  });

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
    addMutation.mutate({ ticker, shares, avgCost, purchaseDate: newDate || null });
  };

  const handleProjection = useCallback((id: string, p: HoldingProjection | null) => {
    setProjections((prev) => (prev[id] === p ? prev : { ...prev, [id]: p }));
  }, []);

  const refreshPrices = async () => {
    await queryClient.invalidateQueries({ queryKey: ["portfolio-fetch"] });
    await queryClient.invalidateQueries({ queryKey: ["portfolio-db"] });
    toast.success("Refreshing latest prices…");
  };

  // Aggregate totals
  const totals = useMemo(() => {
    const valid = holdings.map(h => projections[h.id]).filter(Boolean) as HoldingProjection[];
    if (!valid.length) return null;
    const totalCost = valid.reduce((s, p) => s + p.totalCost, 0);
    const currentValue = valid.reduce((s, p) => s + p.currentValue, 0);
    const projected30d = valid.reduce((s, p) => s + p.projected30d, 0);
    const projected1y = valid.reduce((s, p) => s + p.projected1y, 0);
    const gainLoss = currentValue - totalCost;
    const weightedReturn = currentValue > 0
      ? valid.reduce((s, p) => s + p.annualReturn * p.currentValue, 0) / currentValue
      : 0;
    const weightedR2 = currentValue > 0
      ? valid.reduce((s, p) => s + p.rSquared * p.currentValue, 0) / currentValue
      : 0;
    return {
      totalCost, currentValue, gainLoss,
      gainLossPct: totalCost > 0 ? gainLoss / totalCost : 0,
      projected30d,
      projected30dPct: currentValue > 0 ? (projected30d - currentValue) / currentValue : 0,
      projected1y,
      projected1yPct: currentValue > 0 ? (projected1y - currentValue) / currentValue : 0,
      weightedReturn, weightedR2,
      count: valid.length, allLoaded: valid.length === holdings.length,
    };
  }, [holdings, projections]);

  const analysis = useMemo(() => {
    if (!totals || !totals.allLoaded) return null;
    const valid = holdings.map(h => projections[h.id]).filter(Boolean) as HoldingProjection[];
    const byReturn = [...valid].sort((a, b) => b.annualReturn - a.annualReturn);
    const bestPerformer = byReturn[0];
    const worstPerformer = byReturn[byReturn.length - 1];
    const concentration = valid.map(p => ({ ticker: p.ticker, pct: p.currentValue / totals.currentValue }))
      .sort((a, b) => b.pct - a.pct);
    const topHolding = concentration[0];
    const concentrationRisk = topHolding.pct > 0.4 ? "high" : topHolding.pct > 0.25 ? "moderate" : "low";
    const laggards = valid.filter(p => p.annualReturn < 0);
    const modelConfidence = totals.weightedR2 > 0.6 ? "high" : totals.weightedR2 > 0.3 ? "moderate" : "low";
    return { bestPerformer, worstPerformer, topHolding, concentration, concentrationRisk, laggards, modelConfidence };
  }, [totals, holdings, projections]);

  const intraday = usePortfolioIntraday(
    useMemo(() => holdings.map((h) => ({ ticker: h.ticker, shares: h.shares })), [holdings]),
  );

  if (authLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border px-6 py-4 flex items-center gap-4">
          <Link to="/terminal" className="text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" /></Link>
          <div className="flex items-center gap-2"><Briefcase className="w-4 h-4 text-primary" /><h1 className="text-sm font-mono font-bold tracking-widest uppercase">Portfolio</h1></div>
        </header>
        <div className="max-w-md mx-auto mt-24 text-center space-y-4 px-6">
          <Briefcase className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-xl font-bold">Sign in to access your Portfolio</h2>
          <p className="text-sm text-muted-foreground">Track your holdings and see projected performance.</p>
          <button onClick={() => navigate("/auth")} className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-mono font-bold hover:bg-primary/90 transition-colors"><LogIn className="w-4 h-4" />Sign In</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/terminal" className="text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" /></Link>
          <div className="flex items-center gap-2"><Briefcase className="w-4 h-4 text-primary" /><h1 className="text-sm font-mono font-bold tracking-widest uppercase">My Portfolio</h1></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshPrices} className="px-3 py-2 border border-border rounded-lg text-xs font-mono hover:bg-accent transition-colors flex items-center gap-2" title="Refresh latest prices">
            <RefreshCw className="w-3.5 h-3.5" />Refresh
          </button>
          {holdings.length > 0 && (
            <button onClick={() => setAnalysisOpen(true)} disabled={!totals?.allLoaded} className="px-4 py-2 bg-secondary border border-primary/30 text-primary rounded-lg text-sm font-mono font-bold hover:bg-primary/10 transition-colors flex items-center gap-2 disabled:opacity-50">
              <Sparkles className="w-4 h-4" />Analyze Portfolio
            </button>
          )}
          <button onClick={() => setShowAdd(!showAdd)} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-mono font-bold hover:bg-primary/90 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />Add Holding
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {showAdd && (
          <div className="chart-surface p-5 space-y-4">
            <h3 className="text-sm font-mono font-bold">Add New Holding</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Ticker</label>
                <TickerSearch value={newTicker} onChange={setNewTicker} onSelect={(symbol) => setNewTicker(symbol)} />
              </div>
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Shares</label>
                <input type="number" value={newShares} onChange={(e) => setNewShares(e.target.value)} placeholder="100" min="0.01" step="0.01" className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono input-focus" />
              </div>
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Avg Cost per Share ($)</label>
                <input type="number" value={newCost} onChange={(e) => setNewCost(e.target.value)} placeholder="150.00" min="0.01" step="0.01" className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono input-focus" />
              </div>
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Purchase Date</label>
                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} max={new Date().toISOString().split("T")[0]} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono input-focus" />
              </div>

              <div className="flex items-end">
                <button onClick={handleAdd} disabled={addMutation.isPending} className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-mono font-bold hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Add"}
                </button>
              </div>
            </div>
          </div>
        )}

        {holdings.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="stat-card"><div className="text-xs text-muted-foreground">Holdings</div><div className="text-2xl font-mono mt-1">{holdings.length}</div></div>
            <div className="stat-card"><div className="text-xs text-muted-foreground">Total Invested</div><div className="text-2xl font-mono mt-1">${(totals?.totalCost ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div></div>
            <div className="stat-card"><div className="text-xs text-muted-foreground">Current Value</div><div className="text-2xl font-mono mt-1">${(totals?.currentValue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div></div>
            <div className="stat-card"><div className="text-xs text-muted-foreground">Total Gain/Loss</div>
              <div className={`text-2xl font-mono mt-1 ${(totals?.gainLoss ?? 0) >= 0 ? "price-positive" : "price-negative"}`}>
                {(totals?.gainLoss ?? 0) >= 0 ? "+" : ""}${(totals?.gainLoss ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                <span className="text-xs ml-2">({((totals?.gainLossPct ?? 0) * 100).toFixed(1)}%)</span>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="chart-surface p-8 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary mr-2" /><span className="text-sm text-muted-foreground">Loading portfolio…</span></div>
        ) : holdings.length === 0 ? (
          <div className="chart-surface p-12 text-center space-y-3">
            <Briefcase className="w-10 h-10 text-muted-foreground mx-auto" />
            <h3 className="text-lg font-bold">Your portfolio is empty</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">Add your stock holdings to see projected performance powered by our regression model.</p>
            <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-mono hover:bg-primary/90 transition-colors"><Plus className="w-4 h-4" />Add Your First Holding</button>
          </div>
        ) : (
          <div className="chart-surface overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Ticker</th>
                  <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Shares</th>
                  <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Avg Cost</th>
                  <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Purchased / Held</th>
                  <th className="text-right pl-4 pr-2 py-3 font-bold uppercase tracking-widest text-[10px]">Current</th>
                  <th className="text-right pl-3 pr-4 py-3 font-bold uppercase tracking-widest text-[10px] border-l border-border/40">Intraday G/L</th>
                  <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Value</th>
                  <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Gain/Loss</th>
                  <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px] border-l border-border/40">30d Proj</th>
                  <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">1Y Proj</th>
                  <th className="text-center px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <HoldingRow
                    key={h.id}
                    holding={h}
                    onDelete={(id) => {
                      const h2 = holdings.find((x) => x.id === id);
                      const label = h2 ? `${h2.ticker} (${h2.shares} shares)` : "this holding";
                      if (window.confirm(`Remove ${label} from your portfolio? This cannot be undone.`)) {
                        deleteMutation.mutate(id);
                      }
                    }}
                    onUpdate={(id, shares, avgCost, purchaseDate) => updateMutation.mutate({ id, shares, avgCost, purchaseDate })}
                    onProjection={handleProjection}
                    intraday={intraday.perHolding[h.ticker.toUpperCase()]}
                  />
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="border-t-2 border-primary/40 bg-secondary/40 font-bold">
                    <td colSpan={4} className="px-4 py-3 align-middle">
                      <span className="text-[11px] uppercase tracking-widest text-primary">Total</span>
                    </td>
                    <td className="pl-4 pr-2 py-3 text-right text-sm align-bottom">
                      {intraday.ready && (
                        <>
                          <span>${(totals.currentValue - intraday.change).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                          <div className="text-[9px] text-muted-foreground font-normal uppercase tracking-wider">
                            Day open
                          </div>
                        </>
                      )}
                    </td>
                    <td className="pl-3 pr-4 py-2 text-right border-l border-border/40">
                      {intraday.ready ? (
                        <div className="flex justify-end">
                          <PortfolioIntradaySparkline
                            holdings={holdings.map((h) => ({ ticker: h.ticker, shares: h.shares }))}
                            currentValue={totals.currentValue}
                            width={140}
                            height={34}
                            compact
                          />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <span>${totals.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      {intraday.ready && (
                        <div className={`text-[10px] font-normal mt-0.5 ${intraday.change >= 0 ? "price-positive" : "price-negative"}`}>
                          {intraday.change >= 0 ? "+" : "-"}${Math.abs(intraday.change).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          {" "}({intraday.change >= 0 ? "+" : ""}{intraday.changePct.toFixed(2)}%)
                        </div>
                      )}
                    </td>


                    <td className={`px-4 py-3 text-right text-sm ${totals.gainLoss >= 0 ? "price-positive" : "price-negative"}`}>
                      {totals.gainLoss >= 0 ? "+" : ""}${totals.gainLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      <div className="text-[10px]">{totals.gainLoss >= 0 ? "+" : ""}{(totals.gainLossPct * 100).toFixed(1)}%</div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm border-l border-border/40">
                      ${totals.projected30d.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      <div className={`text-[10px] ${totals.projected30dPct >= 0 ? "price-positive" : "price-negative"}`}>
                        {totals.projected30dPct >= 0 ? "+" : ""}{(totals.projected30dPct * 100).toFixed(1)}%
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      ${totals.projected1y.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      <div className={`text-[10px] ${totals.projected1yPct >= 0 ? "price-positive" : "price-negative"}`}>
                        {totals.projected1yPct >= 0 ? "+" : ""}{(totals.projected1yPct * 100).toFixed(1)}%
                      </div>
                    </td>
                    <td className="px-4 py-3"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        <div className="text-[10px] text-muted-foreground text-center">
          Projections are based on the Enhanced-V2 regression model. Past performance does not guarantee future results. Not financial advice.
        </div>
      </main>

      {analysisOpen && analysis && totals && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setAnalysisOpen(false)}>
          <div className="bg-background border border-border rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-mono font-bold">Portfolio Analysis</h2>
              </div>
              <button onClick={() => setAnalysisOpen(false)} className="p-1 rounded hover:bg-accent"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-5 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="stat-card"><div className="text-[10px] uppercase text-muted-foreground">Weighted 1Y Projected Trend</div>
                  <div className={`text-xl font-mono mt-1 ${totals.weightedReturn >= 0 ? "price-positive" : "price-negative"}`}>
                    {totals.weightedReturn >= 0 ? "+" : ""}{(totals.weightedReturn * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="stat-card"><div className="text-[10px] uppercase text-muted-foreground">Model Confidence (R²)</div>
                  <div className="text-xl font-mono mt-1">{(totals.weightedR2 * 100).toFixed(0)}%</div>
                  <div className="text-[10px] text-muted-foreground capitalize">{analysis.modelConfidence}</div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Best Projected Trend</h3>
                <div className="p-3 rounded border border-border bg-secondary/30">
                  <span className="font-mono font-bold text-primary">{analysis.bestPerformer.ticker}</span>
                  <span className="text-xs text-muted-foreground ml-2">{analysis.bestPerformer.companyName}</span>
                  <div className="text-xs mt-1 price-positive">Projected 1Y trend: +{(analysis.bestPerformer.annualReturn * 100).toFixed(1)}%</div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Weakest Projected Trend</h3>
                <div className="p-3 rounded border border-border bg-secondary/30">
                  <span className="font-mono font-bold text-primary">{analysis.worstPerformer.ticker}</span>
                  <span className="text-xs text-muted-foreground ml-2">{analysis.worstPerformer.companyName}</span>
                  <div className={`text-xs mt-1 ${analysis.worstPerformer.annualReturn >= 0 ? "price-positive" : "price-negative"}`}>
                    Projected 1Y trend: {analysis.worstPerformer.annualReturn >= 0 ? "+" : ""}{(analysis.worstPerformer.annualReturn * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Concentration ({analysis.concentrationRisk} risk)</h3>
                <div className="space-y-1">
                  {analysis.concentration.slice(0, 5).map(c => (
                    <div key={c.ticker} className="flex items-center gap-2 text-xs">
                      <span className="font-mono w-16">{c.ticker}</span>
                      <div className="flex-1 bg-secondary rounded h-2 overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${c.pct * 100}%` }} />
                      </div>
                      <span className="font-mono w-12 text-right">{(c.pct * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
                {analysis.concentrationRisk === "high" && (
                  <p className="text-[11px] text-muted-foreground">Historically, portfolios with &gt;40% in a single name show larger drawdowns during single-stock shocks.</p>
                )}
              </div>

              {analysis.laggards.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Negative Trend Holdings ({analysis.laggards.length})</h3>
                  <div className="flex flex-wrap gap-2">
                    {analysis.laggards.map(l => (
                      <span key={l.ticker} className="px-2 py-1 rounded bg-destructive/10 text-destructive font-mono text-[11px]">
                        {l.ticker} {(l.annualReturn * 100).toFixed(1)}%
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-border pt-4 text-[10px] text-muted-foreground leading-relaxed">
                <strong>Educational only.</strong> This analysis is based on the Enhanced-V2 linear regression model applied to each holding's 1-year price history.
                It describes historical trend and dispersion — it is not a recommendation, forecast guarantee, or advice to buy, hold, or sell.
                Consult a licensed financial advisor before making investment decisions.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
