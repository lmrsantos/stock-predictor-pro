import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, TrendingUp, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { readCachedLinkages } from "@/lib/run-linkages";
import { backtest, type BacktestDataPoint } from "@/lib/backtest";
import { SymbolDetailModal } from "@/components/SymbolDetailModal";
import {
  runBaseRatePipeline, baseRatesForSymbol, makeSymbolSeries,
  type SymbolBaseRates,
} from "@/lib/base-rate-pipeline";



// ─── Types ────────────────────────────────────────────────────────────────────

interface HotStock {
  symbol: string;
  price: number;
  dayChange: number;
  sector: string;
  signal: string;
  confidence: number;
  forecastPct: number;
  forecastDays: number;
  forecastLabel: string;
  walkForwardAccuracy: number;
  hitRate: number;
  breakout: boolean;
  sectorHot: boolean;
  thematicHot: boolean;
  regime: string;
  converged: boolean;
  riskTier: number;
  riskLabel: string;
  profileLabel: string;
  profileClass: string;
  hot: boolean;
  reason: string;
  linkageTilt?: number;
  linkageNote?: string;
  // Rolling-window validation
  validationDecisive: boolean;
  dirHitRate: number;
  dirHits: number;
  windowCount: number;
  expectedMovePct: number;
}


interface SymbolData {
  symbol: string;
  sector: string;
  riskTier: number;
  series: { date: string; close: number }[];
  sectorBias: number;
  thematicBias: number;
}

const RISK_LABELS: Record<number, string> = {
  1: "🟢 Low Risk", 2: "🟡 Medium Risk",
  3: "🟠 Medium-High Risk", 4: "🔴 High Risk",
};

const PROFILE_BY_TIER: Record<number, { label: string; cls: string }> = {
  1: { label: "Conservative", cls: "bg-green-500/15 text-green-600 dark:text-green-400" },
  2: { label: "Conservative", cls: "bg-green-500/15 text-green-600 dark:text-green-400" },
  3: { label: "Moderate",     cls: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400" },
  4: { label: "Aggressive",   cls: "bg-red-500/15 text-red-500 dark:text-red-400" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Quick linear regression for the pre-filter momentum gate. */
function linReg(closes: number[]): { slope: number; rSquared: number; annualReturn: number } | null {
  const n = closes.length;
  if (n < 10) return null;
  const xs = Array.from({length:n},(_,i)=>i);
  const sumX=xs.reduce((a,b)=>a+b,0), sumY=closes.reduce((a,b)=>a+b,0);
  const sumXY=xs.reduce((s,x,i)=>s+x*closes[i],0), sumX2=xs.reduce((s,x)=>s+x*x,0);
  const denom=n*sumX2-sumX*sumX;
  if(denom===0) return null;
  const slope=(n*sumXY-sumX*sumY)/denom, intercept=(sumY-slope*sumX)/n;
  const meanY=sumY/n;
  const ssTot=closes.reduce((s,y)=>s+(y-meanY)**2,0);
  const ssRes=closes.reduce((s,y,i)=>s+(y-(slope*i+intercept))**2,0);
  const rSquared=ssTot>0?Math.max(0,1-ssRes/ssTot):0;
  return { slope, rSquared, annualReturn: closes[n-1]>0?(slope*252)/closes[n-1]:0 };
}

function quickScore(closes: number[]) {
  if (closes.length < 30) return null;
  const full   = linReg(closes); if (!full) return null;
  const recent = linReg(closes.slice(-60)); if (!recent) return null;
  const combinedScore = recent.annualReturn*Math.max(0,recent.rSquared)*3 +
                        full.annualReturn*Math.max(0,full.rSquared);
  const breakout = recent.annualReturn > 0 && recent.annualReturn > full.annualReturn*2;
  return { ...full, recentReturn: recent.annualReturn, recentRSquared: recent.rSquared, combinedScore, breakout };
}

/** Turn a {date, close} series into the BacktestDataPoint[] shape backtest() expects. */
function toBacktestPoints(series: { date: string; close: number }[]): BacktestDataPoint[] {
  return series
    .filter(p => Number.isFinite(p.close) && p.close > 0)
    .map(p => ({
      date: p.date,
      timestamp: new Date(p.date).getTime(),
      actual: p.close,
    }));
}

// ─── Component ────────────────────────────────────────────────────────────────

interface HotStocksProps {
  /** Optional — kept for callers that still want the terminal chart to follow. */
  onSelectTicker?: (ticker: string) => void;
}

export function HotStocks({ onSelectTicker }: HotStocksProps) {
  const [stocks, setStocks]           = useState<HotStock[]>([]);
  const [isScanning, setIsScanning]   = useState(false);
  const [hasScanned, setHasScanned]   = useState(false);
  const [scanStatus, setScanStatus]   = useState("");
  const [filter, setFilter]           = useState<"all" | "hot" | "conservative">("hot");
  const [detail, setDetail]           = useState<{ symbol: string; sector?: string } | null>(null);
  const [baseRates, setBaseRates]     = useState<Record<string, SymbolBaseRates | null>>({});
  const [baseRatesLoading, setBaseRatesLoading] = useState(false);
  const seriesRef = useRef<Record<string, { dates: string[]; closes: number[]; sector: string }>>({});
  const autoRan = useRef(false);


  const discover = useCallback(async () => {
    setIsScanning(true);
    setStocks([]);
    setHasScanned(false);
    setScanStatus("Fetching price data...");

    try {
      const { data, error } = await supabase.functions.invoke("hot-stocks", {
        body: { riskProfile: "aggressive" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const symbolData: SymbolData[] = data.symbolData || [];
      if (symbolData.length === 0) throw new Error("No price data available");

      setScanStatus(`Running momentum pre-filter on ${symbolData.length} symbols...`);

      // Pre-filter momentum
      const allScored = symbolData.map(s => ({
        ...s,
        closes: s.series.map(p => p.close),
        qs: quickScore(s.series.map(p => p.close)),
      }));

      // Keep raw series around so the base-rate pipeline can profile every row
      const seriesMap: Record<string, { dates: string[]; closes: number[]; sector: string }> = {};
      for (const s of symbolData) {
        seriesMap[s.symbol] = {
          dates: s.series.map(p => p.date),
          closes: s.series.map(p => p.close),
          sector: s.sector,
        };
      }
      seriesRef.current = seriesMap;


      const preRanked = allScored
        .filter(s => s.qs !== null && s.qs.recentReturn > -0.05)
        .sort((a, b) => {
          const scoreA = (a.qs!.combinedScore) * (a.sectorBias) * (a.thematicBias);
          const scoreB = (b.qs!.combinedScore) * (b.sectorBias) * (b.thematicBias);
          return scoreB - scoreA;
        });
      const perSectorCap: Record<string, number> = {};
      const candidates = preRanked.filter(c => {
        const n = perSectorCap[c.sector] ?? 0;
        if (n >= 6) return false;
        perSectorCap[c.sector] = n + 1;
        return true;
      }).slice(0, 80);
      const candidateSet = new Set(candidates.map(c => c.symbol));

      setScanStatus(`Running Calibration Backtest on top ${candidates.length} candidates...`);

      // Sector linkage tilt (unchanged)
      const MACRO = new Set(["OIL","GOLD","US10Y","XLY_XLP_RATIO"]);
      const linkCache = readCachedLinkages();
      const sectorTilt: Record<string, { factor: number; note: string }> = {};
      if (linkCache?.results?.length) {
        const sectorRecentReturn: Record<string, number> = {};
        const bySector: Record<string, number[]> = {};
        for (const s of allScored) {
          const c = s.closes;
          if (c.length < 6) continue;
          let sum = 0, n = 0;
          for (let i = c.length - 5; i < c.length; i++) {
            if (c[i] > 0 && c[i-1] > 0) { sum += Math.log(c[i]/c[i-1]); n++; }
          }
          if (n === 0) continue;
          (bySector[s.sector] ??= []).push(sum);
        }
        for (const [sec, arr] of Object.entries(bySector)) {
          sectorRecentReturn[sec] = arr.reduce((a,b)=>a+b,0) / arr.length;
        }
        const validated = linkCache.results.filter(r => r.validated && !MACRO.has(String(r.leader)));
        const followers = new Set(validated.map(v => v.follower));
        for (const follower of followers) {
          let raw = 0;
          const pieces: string[] = [];
          for (const v of validated.filter(x => x.follower === follower)) {
            const lr = sectorRecentReturn[v.leader as string];
            if (lr == null) continue;
            const contrib = v.sign * lr * Math.abs(v.coefficient);
            raw += contrib;
            pieces.push(`${v.leader} 5d ${(lr*100).toFixed(1)}%`);
          }
          const factor = 1 + Math.max(-0.15, Math.min(0.15, Math.tanh(raw * 20) * 0.15));
          if (Math.abs(factor - 1) > 0.005) {
            sectorTilt[follower] = {
              factor,
              note: `${pieces.join(", ")} → ${((factor-1)*100).toFixed(1)}% conf tilt`,
            };
          }
        }
      }

      const results: HotStock[] = [];

      const buildRow = (
        c: { symbol: string; sector: string; riskTier: number; closes: number[]; sectorBias: number; thematicBias: number },
        opts: {
          signal: string;
          confidence: number;
          forecastPct: number;
          forecastDays: number;
          forecastLabel: string;
          walkForwardAccuracy: number;
          hitRate: number;
          regime: string;
          converged: boolean;
          hot: boolean;
          reason: string;
          breakout: boolean;
          linkageTilt?: number;
          linkageNote?: string;
          validationDecisive?: boolean;
          dirHitRate?: number;
          dirHits?: number;
          windowCount?: number;
          expectedMovePct?: number;
        }
      ): HotStock => {
        const prof = PROFILE_BY_TIER[c.riskTier] ?? PROFILE_BY_TIER[4];
        return {
          symbol: c.symbol,
          price: c.closes[c.closes.length-1] ?? 0,
          dayChange: 0,
          sector: c.sector,
          signal: opts.signal,
          confidence: opts.confidence,
          forecastPct: opts.forecastPct,
          forecastDays: opts.forecastDays,
          forecastLabel: opts.forecastLabel,
          walkForwardAccuracy: opts.walkForwardAccuracy,
          hitRate: opts.hitRate,
          regime: opts.regime,
          converged: opts.converged,
          riskTier: c.riskTier,
          riskLabel: RISK_LABELS[c.riskTier] ?? "🔴 High Risk",
          profileLabel: prof.label,
          profileClass: prof.cls,
          breakout: opts.breakout,
          sectorHot: c.sectorBias >= 1.5,
          thematicHot: c.thematicBias >= 1.5,
          hot: opts.hot,
          reason: opts.reason,
          linkageTilt: opts.linkageTilt,
          linkageNote: opts.linkageNote,
          validationDecisive: opts.validationDecisive ?? false,
          dirHitRate: opts.dirHitRate ?? 0,
          dirHits: opts.dirHits ?? 0,
          windowCount: opts.windowCount ?? 0,
          expectedMovePct: opts.expectedMovePct ?? 0,
        };
      };


      // Add pre-filter rejects
      for (const s of allScored) {
        if (candidateSet.has(s.symbol)) continue;
        let reason = "";
        if (s.closes.length < 60) {
          reason = "Insufficient price history (<60 days) for backtest engine";
        } else if (!s.qs) {
          reason = "Could not compute momentum score";
        } else if (s.qs.recentReturn <= -0.05) {
          reason = `Recent downtrend (60d return ${(s.qs.recentReturn*100).toFixed(1)}%)`;
        } else {
          reason = "Crowded out by higher-scoring peers in same sector (cap 6/sector, top 80)";
        }
        results.push(buildRow(s, {
          signal: "SKIPPED",
          confidence: 0,
          forecastPct: 0,
          forecastDays: 0,
          forecastLabel: "—",
          walkForwardAccuracy: 0,
          hitRate: 0,
          regime: "NORMAL",
          converged: false,
          hot: false,
          reason,
          breakout: false,
        }));
      }

      // ── Single source of truth: run the same backtest() the modal uses ──
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        setScanStatus(`Calibration Backtest ${c.symbol} (${i+1}/${candidates.length})...`);
        await new Promise(r => setTimeout(r, 0));

        const points = toBacktestPoints(c.series);
        if (points.length < 60) {
          results.push(buildRow(c, {
            signal: "NO MODEL",
            confidence: 0, forecastPct: 0, forecastDays: 0, forecastLabel: "—",
            walkForwardAccuracy: 0, hitRate: 0, regime: "NORMAL", converged: false,
            hot: false, breakout: false,
            reason: "Insufficient clean price points for backtest engine",
          }));
          continue;
        }

        let bt;
        try {
          bt = backtest(points, 6, 30);
        } catch (err) {
          results.push(buildRow(c, {
            signal: "NO MODEL",
            confidence: 0, forecastPct: 0, forecastDays: 0, forecastLabel: "—",
            walkForwardAccuracy: 0, hitRate: 0, regime: "NORMAL", converged: false,
            hot: false, breakout: false,
            reason: `Backtest engine error: ${(err as Error).message}`,
          }));
          continue;
        }

        // Regime label (matches modal semantics)
        const regime: "NORMAL"|"SHIFTED"|"EXTREME" =
          bt.regime.ratio > 2.5 ? "EXTREME" :
          bt.regime.ratio > 1.5 ? "SHIFTED" : "NORMAL";

        // Linkage tilt on confidence
        const tilt = sectorTilt[c.sector];
        const tiltedConfidence = tilt
          ? Math.min(100, bt.confidenceScore * tilt.factor)
          : bt.confidenceScore;

        // Signal mapping — descriptive, never a trade decision:
        //   • extreme regime or very low fit → STAY OUT
        //   • fit above threshold + up-forecast + models agree → SETUP MATCH
        //   • same with down-forecast → BEARISH SETUP
        //   • otherwise → WAIT
        const minConf = c.riskTier === 1 ? 55 : c.riskTier === 2 ? 50 : c.riskTier === 3 ? 45 : 40;
        const stayOutConf = c.riskTier === 1 ? 25 : c.riskTier === 2 ? 22 : 20;
        const agree = bt.ensembleAgreement >= 0.6;
        const v = bt.validation;
        const dirReliable = v.directionHitRate > 0.55;
        const dirHits = Math.round(v.directionHitRate * v.windowCount);
        const band = bt.magnitudeSignal.expectedMovePct;
        const withBand = (pct: number) =>
          `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% over 30d (1σ range ${(pct - band).toFixed(0)}% to ${pct + band >= 0 ? "+" : ""}${(pct + band).toFixed(0)}%)`;
        const validationLine = v.decisive
          ? `Direction correct in ${dirHits} of ${v.windowCount} windows`
          : "No single model validated — showing ensemble mean";

        let signal: "SETUP MATCH"|"BEARISH SETUP"|"WAIT"|"STAY OUT" = "WAIT";
        if (regime === "EXTREME" || tiltedConfidence < stayOutConf) {
          signal = "STAY OUT";
        } else if (dirReliable && tiltedConfidence >= minConf && agree && bt.forecastPct > 0.5) {
          signal = "SETUP MATCH";
        } else if (dirReliable && tiltedConfidence >= minConf && agree && bt.forecastPct < -0.5) {
          signal = "BEARISH SETUP";
        }

        const hot = signal === "SETUP MATCH";
        const winnerErr = bt.winningModel.errorPct;

        let reason = "";
        if (!dirReliable) {
          reason = `Direction not reliable (${dirHits} of ${v.windowCount} windows). Expected move ±${band.toFixed(1)}%.`;
        } else if (hot) {
          reason = `Setup match · ${validationLine} · ${withBand(bt.forecastPct)} · model fit ${Math.round(tiltedConfidence)}/100`;
        } else if (signal === "STAY OUT") {
          reason = regime === "EXTREME"
            ? `Stay out — extreme volatility regime (${bt.regime.ratio.toFixed(1)}× normal)`
            : `Stay out — model fit ${Math.round(tiltedConfidence)}/100 below threshold`;
        } else if (signal === "BEARISH SETUP") {
          reason = `Bearish setup — ${withBand(bt.forecastPct)} · ${validationLine}`;
        } else {
          const bits: string[] = [];
          if (tiltedConfidence < minConf) bits.push(`model fit ${Math.round(tiltedConfidence)}/100 < ${minConf} threshold`);
          if (!agree) bits.push(`only ${Math.round(bt.ensembleAgreement*100)}% of models agree on direction`);
          if (Math.abs(bt.forecastPct) <= 0.5) bits.push(`flat forecast (${withBand(bt.forecastPct)})`);
          reason = `Wait — ${bits.join("; ") || "signal not strong enough"}`;
        }

        results.push(buildRow(c, {
          signal,
          confidence: Math.round(tiltedConfidence * 10) / 10,
          forecastPct: bt.forecastPct,
          forecastDays: 30,
          forecastLabel: "~6 weeks",
          walkForwardAccuracy: Math.max(0, Math.round((100 - winnerErr) * 10) / 10),
          hitRate: Math.round(bt.ensembleAgreement * 1000) / 10,
          regime,
          converged: winnerErr < 2,
          hot,
          reason,
          breakout: c.qs!.breakout && winnerErr < 2 && bt.forecastPct > 0,
          linkageTilt: tilt?.factor,
          linkageNote: tilt?.note,
          validationDecisive: v.decisive,
          dirHitRate: v.directionHitRate,
          dirHits,
          windowCount: v.windowCount,
          expectedMovePct: band,
        }));


        // Live update
        const sorted = [...results].sort((a, b) => {
          if (a.hot !== b.hot) return a.hot ? -1 : 1;
          return b.confidence - a.confidence;
        });
        setStocks(sorted);
        setHasScanned(true);
      }

      const finalSorted = [...results].sort((a, b) => {
        if (a.hot !== b.hot) return a.hot ? -1 : 1;
        return b.confidence - a.confidence;
      });
      setStocks(finalSorted);
      setHasScanned(true);
      const hotCount = finalSorted.filter(s => s.hot).length;
      setScanStatus(`Scored ${finalSorted.length} symbols · ${hotCount} setup matches · ${finalSorted.length - hotCount} no match`);

    } catch (e) {
      toast.error((e as Error).message);
      setScanStatus("");
    } finally {
      setIsScanning(false);
    }
  }, []);

  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    discover();
  }, [discover]);

  // ── Conditioned base rates for every scored symbol ──────────────────────────
  useEffect(() => {
    if (isScanning || !hasScanned || stocks.length === 0) return;
    let cancelled = false;
    setBaseRatesLoading(true);
    (async () => {
      try {
        const pipeline = await runBaseRatePipeline();
        const out: Record<string, SymbolBaseRates | null> = {};
        for (const s of stocks) {
          const raw = seriesRef.current[s.symbol];
          const series = raw
            ? makeSymbolSeries(s.symbol, raw.dates, raw.closes, raw.sector)
            : null;
          out[s.symbol] = baseRatesForSymbol(pipeline, s.symbol, series);
        }
        if (!cancelled) setBaseRates(out);
      } catch (e) {
        console.warn("base-rate pipeline failed", e);
      } finally {
        if (!cancelled) setBaseRatesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isScanning, hasScanned, stocks]);

  const conservativeCount = stocks.filter(s => baseRates[s.symbol]?.anyConservative).length;

  const visible =
    filter === "hot"          ? stocks.filter(s => s.hot)
    : filter === "conservative" ? stocks.filter(s => baseRates[s.symbol]?.anyConservative)
    : stocks;
  const hotCount = stocks.filter(s => s.hot).length;


  const exportToExcel = useCallback(() => {
    if (!visible.length) return;
    const rows = visible.map((s, i) => ({
      Rank: i + 1,
      Symbol: s.symbol,
      Sector: s.sector,
      Signal: s.signal,
      Hot: s.hot ? "YES" : "NO",
      "Price ($)": Number(s.price.toFixed(2)),
      "Forecast (%)": Number(s.forecastPct.toFixed(2)),
      "Forecast Horizon": s.forecastLabel,
      "Confidence (%)": s.confidence,
      "Model Agreement (%)": s.hitRate,
      "Winner Accuracy (%)": s.walkForwardAccuracy,
      Regime: s.regime,
      "Risk Profile": s.profileLabel,
      "Risk Tier": s.riskLabel.replace(/[^\w\s-]/g, "").trim(),
      Breakout: s.breakout ? "YES" : "NO",
      "Hot Sector": s.sectorHot ? "YES" : "NO",
      "Macro Tailwind": s.thematicHot ? "YES" : "NO",
      "Linkage Tilt": s.linkageTilt ? Number(((s.linkageTilt - 1) * 100).toFixed(2)) : "",
      "Linkage Note": s.linkageNote ?? "",
      Reason: s.reason,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(k =>
      ({ wch: k === "Reason" || k === "Linkage Note" ? 60 : Math.max(12, k.length + 2) })
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Hot Stocks");
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    XLSX.writeFile(wb, `hot-stocks-${filter}-${stamp}.xlsx`);
    toast.success(`Exported ${rows.length} rows to Excel`);
  }, [visible, filter]);


  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Link to="/methodology" target="_blank"
          className="text-[10px] font-mono text-primary hover:underline">
          How is this calculated?
        </Link>
      </div>

      <button onClick={() => discover()} disabled={isScanning}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-all disabled:opacity-70">
        {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
        {isScanning ? "Scanning…" : hasScanned ? "Rescan" : "Run Hot Stocks"}
      </button>

      {hasScanned && stocks.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilter("conservative")}
            className={`flex-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-all ${
              filter === "conservative"
                ? "bg-primary text-primary-foreground border-transparent"
                : "bg-card/50 border-border text-muted-foreground hover:text-foreground"
            }`}>
            {baseRatesLoading ? "Conservative only (…)" : `Conservative only (${conservativeCount})`}
          </button>

          <button
            onClick={() => setFilter("hot")}
            className={`flex-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-all ${
              filter === "hot"
                ? "bg-primary text-primary-foreground border-transparent"
                : "bg-card/50 border-border text-muted-foreground hover:text-foreground"
            }`}>
            🔥 Hot only ({hotCount})
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`flex-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-all ${
              filter === "all"
                ? "bg-primary text-primary-foreground border-transparent"
                : "bg-card/50 border-border text-muted-foreground hover:text-foreground"
            }`}>
            All results ({stocks.length})
          </button>
        </div>
      )}

      {hasScanned && visible.length > 0 && !isScanning && (
        <button
          onClick={exportToExcel}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all">
          <Download className="w-3.5 h-3.5" />
          Export to Excel ({visible.length} rows)
        </button>
      )}

      {isScanning && (
        <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse [animation-delay:200ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse [animation-delay:400ms]" />
            </div>
            <span className="text-xs font-mono text-primary">{scanStatus}</span>
          </div>
        </div>
      )}

      {hasScanned && visible.length === 0 && !isScanning && (
        <p className="text-xs text-muted-foreground text-center py-2">
          {filter === "hot"
            ? "No setup matches in this scan. Switch to 'All results' to see what the model saw."
            : "No results."}
        </p>
      )}

      {visible.length > 0 && (
        <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
          {visible.map((stock, i) => (
            <button key={stock.symbol} onClick={() => setDetail({ symbol: stock.symbol, sector: stock.sector })}
              className={`w-full text-left p-3 rounded-lg border transition-all group ${
                stock.hot
                  ? "bg-card/50 border-border hover:border-primary/40 hover:bg-card"
                  : "bg-card/20 border-border/50 hover:border-border opacity-80 hover:opacity-100"
              }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono font-bold text-muted-foreground w-4">#{i+1}</span>
                  <span className="text-sm font-mono font-bold text-foreground group-hover:text-primary transition-colors">
                    {stock.symbol}
                  </span>
                  {stock.hot && <span className="text-[10px]">🔥</span>}
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${stock.profileClass}`}>
                    {stock.profileLabel}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {stock.hot && stock.dirHitRate > 0.55 ? (
                    <>
                      <span className={`text-xs font-mono font-bold ${stock.forecastPct >= 0 ? "price-positive" : "price-negative"}`}>
                        {stock.forecastPct >= 0 ? "+" : ""}{stock.forecastPct.toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        1σ {(stock.forecastPct - stock.expectedMovePct).toFixed(0)}% to {stock.forecastPct + stock.expectedMovePct >= 0 ? "+" : ""}{(stock.forecastPct + stock.expectedMovePct).toFixed(0)}%
                      </span>
                    </>
                  ) : stock.hot ? (
                    <span className="text-[10px] font-mono text-muted-foreground">
                      ±{stock.expectedMovePct.toFixed(1)}% expected move
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide">
                      {stock.signal}
                    </span>
                  )}
                </div>
              </div>
              <div className="ml-6 mt-1 space-y-0.5">
                <div className="flex items-center gap-3 flex-wrap">
                  {stock.sector && (
                    <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                      {stock.sector}
                    </span>
                  )}
                  <span className="text-[10px] font-mono font-semibold">{stock.riskLabel}</span>
                  {stock.hot && (
                    <>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        Model fit {Math.round(stock.confidence)}/100
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {stock.validationDecisive
                          ? `Direction correct in ${stock.dirHits} of ${stock.windowCount} windows`
                          : "No single model validated — ensemble mean"}
                      </span>

                    </>
                  )}
                  {stock.breakout && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-500">
                      🔥 Breakout
                    </span>
                  )}
                  {stock.sectorHot && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-600">
                      ⚡ Hot Sector
                    </span>
                  )}
                  {stock.thematicHot && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/15 text-red-500">
                      🌍 Macro Tailwind
                    </span>
                  )}
                  {stock.regime !== "NORMAL" && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      stock.regime === "EXTREME"
                        ? "bg-red-500/15 text-red-400"
                        : "bg-amber-500/15 text-amber-400"
                    }`}>
                      {stock.regime === "EXTREME" ? "⚠️ Extreme" : "⚡ Shifted"}
                    </span>
                  )}
                </div>
                <p className={`text-[10px] font-mono leading-relaxed pt-0.5 ${stock.hot ? "text-foreground/80" : "text-muted-foreground"}`}>
                  {stock.hot ? "✓ " : "· "}{stock.reason}
                </p>
                {(() => {
                  const br = baseRates[stock.symbol];
                  if (!br) return null;
                  const b = br.best;
                  if (!b) {
                    return (
                      <p className="text-[10px] font-mono text-muted-foreground pt-0.5">
                        No historical setup match · {br.profile.volBucket} volatility
                      </p>
                    );
                  }
                  const r = b.rate;
                  const excess = r.excessHitRatePp;
                  const thin = r.symbolOccurrences < 10;
                  return (
                    <p className="text-[10px] font-mono text-muted-foreground pt-0.5">
                      <span className="text-foreground/80">{b.name}</span>
                      {excess != null && (
                        <> · <span className={excess >= 5 ? "text-green-600 dark:text-green-400" : ""}>
                          {excess >= 0 ? "+" : ""}{excess.toFixed(1)}pp vs {br.profile.volBucket}-vol baseline
                        </span></>
                      )}
                      {" · "}{r.stats?.n ?? 0} occurrences
                      {r.meetsConservativeCriteria && (
                        <span className="ml-1.5 px-1 py-px rounded bg-green-500/15 text-green-600 dark:text-green-400 font-semibold">
                          conservative
                        </span>
                      )}
                      {thin && (
                        <span className="ml-1.5 opacity-80">
                          only {r.symbolOccurrences} for {stock.symbol} itself — too few to mean anything
                        </span>
                      )}
                    </p>
                  );
                })()}
              </div>

            </button>
          ))}
          <p className="text-[9px] text-muted-foreground text-center mt-2 leading-relaxed">
            Powered by the same Calibration Backtest engine as the symbol backtest modal · single source of truth
          </p>
        </div>
      )}

      <SymbolDetailModal
        isOpen={!!detail}
        onClose={() => setDetail(null)}
        symbol={detail?.symbol ?? ""}
        sector={detail?.sector}
      />
    </div>

  );
}
