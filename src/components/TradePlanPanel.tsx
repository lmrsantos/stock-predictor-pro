import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStockDataFromDB } from "@/lib/stock-data";
import { computeTradePlan, type RiskTolerance, type Horizon, type TradePlan } from "@/lib/trade-plan";
import { Target, Loader2, ChevronDown, ChevronRight, ShieldAlert, X } from "lucide-react";

const RISKS: RiskTolerance[] = ["conservative", "moderate", "aggressive"];
const HORIZONS: { key: Horizon; label: string }[] = [
  { key: "swing", label: "Swing (2–6 wks)" },
  { key: "position", label: "Position (1–6 mo)" },
  { key: "long", label: "Long (6 mo+)" },
];

const ACTION_STYLE: Record<TradePlan["action"], string> = {
  accumulate: "bg-primary/15 text-primary border-primary/40",
  hold: "bg-secondary text-foreground border-border",
  trim: "bg-amber-500/15 text-amber-500 border-amber-500/40",
  exit: "bg-destructive/15 text-destructive border-destructive/40",
  wait: "bg-muted text-muted-foreground border-border",
};

const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

function PlanRow({
  ticker,
  shares,
  avgCost,
  risk,
  horizon,
  hidePosition,
}: {
  ticker: string;
  shares: number;
  avgCost: number;
  risk: RiskTolerance;
  horizon: Horizon;
  hidePosition?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data: stockData, isLoading } = useQuery({
    queryKey: ["portfolio-db", ticker],
    queryFn: () => getStockDataFromDB(ticker, "1y"),
    staleTime: 30 * 60 * 1000,
  });

  const plan = useMemo(() => {
    if (!stockData?.length) return null;
    return computeTradePlan({ ticker, shares, avgCost, data: stockData, risk, horizon });
  }, [stockData, ticker, shares, avgCost, risk, horizon]);

  if (isLoading || !plan) {
    return (
      <tr className="border-b border-border/50">
        <td className="px-4 py-3 font-mono font-bold text-primary">{ticker}</td>
        <td colSpan={8} className="px-4 py-3 text-muted-foreground text-xs">
          {isLoading ? (
            <><Loader2 className="w-3 h-3 animate-spin inline mr-2" />Computing levels…</>
          ) : (
            "Not enough price history to build a plan"
          )}
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="border-b border-border/50 hover:bg-accent/30 transition-colors">
        <td className="px-4 py-3">
          <button onClick={() => setOpen(!open)} className="flex items-center gap-1 font-mono font-bold text-primary">
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {plan.ticker}
          </button>
          {!hidePosition && (
            <div className="text-[10px] text-muted-foreground">{plan.shares} sh @ ${plan.avgCost.toFixed(2)}</div>
          )}
        </td>
        <td className="px-4 py-3 text-center">
          <span className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold uppercase tracking-wider ${ACTION_STYLE[plan.action]}`}>
            {plan.action}
          </span>
        </td>
        <td className="px-4 py-3 text-right font-mono">${plan.currentPrice.toFixed(2)}</td>
        <td className="px-4 py-3 text-right font-mono">
          ${plan.entryLow.toFixed(2)} – ${plan.entryHigh.toFixed(2)}
        </td>
        <td className="px-4 py-3 text-right font-mono price-negative">
          ${plan.stop.toFixed(2)}
          <div className="text-[10px]">{pct(plan.stopPct)}</div>
        </td>
        <td className="px-4 py-3 text-right font-mono price-positive">
          ${plan.target1.toFixed(2)}
          <div className="text-[10px]">{pct(plan.target1Pct)}</div>
        </td>
        <td className="px-4 py-3 text-right font-mono price-positive">
          ${plan.target2.toFixed(2)}
          <div className="text-[10px]">{pct(plan.target2Pct)}</div>
        </td>
        <td className="px-4 py-3 text-right font-mono">
          {plan.riskReward.toFixed(2)}:1
        </td>
        <td className="px-4 py-3 text-center font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {plan.confidence}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-border/50 bg-secondary/30">
          <td colSpan={9} className="px-6 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] font-mono mb-3">
              <div><span className="text-muted-foreground">Support</span><div>${plan.support.toFixed(2)}</div></div>
              <div><span className="text-muted-foreground">Resistance</span><div>${plan.resistance.toFixed(2)}</div></div>
              <div><span className="text-muted-foreground">30d expected</span><div>${plan.expected30d.toFixed(2)} ({pct(plan.expected30dPct)})</div></div>
              {!hidePosition && (
                <div><span className="text-muted-foreground">Unrealized</span><div>{pct(plan.unrealizedPct)}</div></div>
              )}
            </div>
            <ul className="space-y-1 text-[11px] text-muted-foreground list-disc pl-4">
              {plan.rationale.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

export function TradePlanPanel({
  holdings,
  onClose,
  hidePosition,
  title = "Trade Plan",
  subtitle = "Recomputed from live prices",
}: {
  holdings: { id: string; ticker: string; shares: number; avg_cost: number }[];
  onClose?: () => void;
  hidePosition?: boolean;
  title?: string;
  subtitle?: string;
}) {

  const [risk, setRisk] = useState<RiskTolerance>(
    () => (localStorage.getItem("tradeplan.risk") as RiskTolerance) || "moderate",
  );
  const [horizon, setHorizon] = useState<Horizon>(
    () => (localStorage.getItem("tradeplan.horizon") as Horizon) || "position",
  );

  useEffect(() => {
    localStorage.setItem("tradeplan.risk", risk);
    localStorage.setItem("tradeplan.horizon", horizon);
  }, [risk, horizon]);

  if (!holdings.length) return null;

  return (
    <section className="chart-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest">{title}</h2>
          <span className="text-[10px] text-muted-foreground">{subtitle}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {RISKS.map((r) => (
              <button
                key={r}
                onClick={() => setRisk(r)}
                className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                  risk === r ? "bg-primary text-primary-foreground font-bold" : "bg-secondary text-foreground hover:bg-accent"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <select
            value={horizon}
            onChange={(e) => setHorizon(e.target.value as Horizon)}
            className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-[11px] font-mono input-focus"
          >
            {HORIZONS.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
          </select>
          {onClose && (
            <button
              onClick={onClose}
              className="px-2 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent transition-colors"
              aria-label="Hide trade plan"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Symbol</th>
              <th className="text-center px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Action</th>
              <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Price</th>
              <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Entry zone</th>
              <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Stop</th>
              <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Target 1</th>
              <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Target 2</th>
              <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">R:R</th>
              <th className="text-center px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Conf.</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <PlanRow
                key={h.id}
                ticker={h.ticker}
                shares={h.shares}
                avgCost={h.avg_cost}
                risk={risk}
                horizon={horizon}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-start gap-2 px-4 py-3 border-t border-border text-[10px] text-muted-foreground">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>
          Rule-based and illustrative: stops and targets are ATR(14) multiples clamped by cycle
          support/resistance, with the 30-day calibration ensemble as the directional input.
          Educational only — not investment advice.
        </p>
      </div>
    </section>
  );
}
