import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, TrendingUp } from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HotStock {
  symbol: string;
  name?: string;
  price: number;
  dayChange: number;
  sector: string;
  marketCap?: string;
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
}

interface SymbolData {
  symbol: string;
  sector: string;
  riskTier: number;
  closes: number[];
  sectorBias: number;
  thematicBias: number;
}

type RiskProfile = "conservative" | "moderate" | "aggressive";

const RISK_LABELS: Record<number, string> = {
  1: "🟢 Low Risk", 2: "🟡 Medium Risk",
  3: "🟠 Medium-High Risk", 4: "🔴 High Risk",
};

const RISK_PROFILES: { value: RiskProfile; label: string; color: string; selectedBg: string; selectedText: string }[] = [
  { value: "conservative", label: "Conservative", color: "border-green-500/40 text-green-600 dark:text-green-400", selectedBg: "bg-green-600 dark:bg-green-500", selectedText: "text-white" },
  { value: "moderate",     label: "Moderate",     color: "border-yellow-500/40 text-yellow-600 dark:text-yellow-400", selectedBg: "bg-yellow-500", selectedText: "text-white dark:text-black" },
  { value: "aggressive",   label: "Aggressive",   color: "border-red-500/40 text-red-600 dark:text-red-400", selectedBg: "bg-red-600 dark:bg-red-500", selectedText: "text-white" },
];

// ─── AE + Scoring (identical to BacktestModal — proven in browser) ─────────────

const relu     = (x: number) => Math.max(0, x);
const reluGrad = (x: number) => (x > 0 ? 1 : 0);

function affine(W: number[][], b: number[], v: number[]): number[] {
  return W.map((row, i) => row.reduce((s, w, j) => s + w * v[j], 0) + b[i]);
}
function randMat(r: number, c: number): number[][] {
  const sc = Math.sqrt(2 / (r + c));
  return Array.from({ length: r }, () => Array.from({ length: c }, () => (Math.random() * 2 - 1) * sc));
}
const zeros = (n: number) => new Array(n).fill(0);
const WS = 20, HS = 12, LS = 4, FS = 45;

interface AEW {
  We1: number[][]; be1: number[]; We2: number[][]; be2: number[];
  Wd1: number[][]; bd1: number[]; Wd2: number[][]; bd2: number[];
  Wf1: number[][]; bf1: number[]; Wf2: number[][]; bf2: number[];
}
function initAE(): AEW {
  return {
    We1: randMat(HS,WS), be1: zeros(HS), We2: randMat(LS,HS), be2: zeros(LS),
    Wd1: randMat(HS,LS), bd1: zeros(HS), Wd2: randMat(WS,HS), bd2: zeros(WS),
    Wf1: randMat(HS,LS), bf1: zeros(HS), Wf2: randMat(FS,HS), bf2: zeros(FS),
  };
}
function fwd(input: number[], w: AEW) {
  const he1pre = affine(w.We1, w.be1, input), he1 = he1pre.map(relu);
  const latent  = affine(w.We2, w.be2, he1);
  const hd1pre  = affine(w.Wd1, w.bd1, latent), hd1 = hd1pre.map(relu);
  const recon   = affine(w.Wd2, w.bd2, hd1);
  const hf1pre  = affine(w.Wf1, w.bf1, latent), hf1 = hf1pre.map(relu);
  const forecast = affine(w.Wf2, w.bf2, hf1);
  return { he1pre, he1, latent, hd1pre, hd1, recon, hf1pre, hf1, forecast };
}
const cw = (x: number) => Math.max(-3, Math.min(3, x));
function bwd(input: number[], f: ReturnType<typeof fwd>, w: AEW, lr: number): AEW {
  const clip = (x: number) => Math.max(-1, Math.min(1, x));
  const n = input.length, dR = f.recon.map((r, i) => clip((2/n)*(r - input[i])));
  const dWd2  = dR.map(g => f.hd1.map(h => g*h));
  const dHd1  = f.hd1.map((_,j) => dR.reduce((s,g,i) => s+g*w.Wd2[i][j], 0));
  const dHd1p = dHd1.map((g,i) => clip(g*reluGrad(f.hd1pre[i])));
  const dWd1  = dHd1p.map(g => f.latent.map(l => g*l));
  const dLat  = f.latent.map((_,j) => clip(dHd1p.reduce((s,g,i) => s+g*w.Wd1[i][j], 0)));
  const dWe2  = dLat.map(g => f.he1.map(h => g*h));
  const dHe1  = f.he1.map((_,j) => dLat.reduce((s,g,i) => s+g*w.We2[i][j], 0));
  const dHe1p = dHe1.map((g,i) => clip(g*reluGrad(f.he1pre[i])));
  const dWe1  = dHe1p.map(g => input.map(x => g*x));
  const up  = (M: number[][], dM: number[][]) => M.map((r,i) => r.map((v,j) => cw(v - lr*clip(dM[i][j]))));
  const upV = (b: number[], db: number[]) => b.map((v,i) => cw(v - lr*clip(db[i])));
  return {
    We1:up(w.We1,dWe1), be1:upV(w.be1,dHe1p),
    We2:up(w.We2,dWe2), be2:upV(w.be2,dLat),
    Wd1:up(w.Wd1,dWd1), bd1:upV(w.bd1,dHd1p),
    Wd2:up(w.Wd2,dWd2), bd2:upV(w.bd2,dR),
    Wf1:w.Wf1, bf1:w.bf1, Wf2:w.Wf2, bf2:w.bf2,
  };
}


function trainFwd(wins: number[][], tgts: number[][], w: AEW, lr: number): AEW {
  const clip = (x: number) => Math.max(-1, Math.min(1, x));
  let wt = { ...w };
  for (let e = 0; e < 80; e++) {
    for (let i = 0; i < wins.length; i++) {
      const f = fwd(wins[i], wt);
      const tlen = tgts[i].length;
      const dF = f.forecast.map((v,j) => j < tlen ? clip((2/tlen)*(v - tgts[i][j])) : 0);

      const dWf2  = dF.map(g => f.hf1.map(h => g*h));
      const dHf1  = f.hf1.map((_,j) => dF.reduce((s,g,i) => s+g*wt.Wf2[i][j], 0));
      const dHf1p = dHf1.map((g,i) => clip(g*reluGrad(f.hf1pre[i])));
      const dWf1  = dHf1p.map(g => f.latent.map(l => g*l));
      wt = { ...wt,
        Wf1: wt.Wf1.map((r,i) => r.map((v,j) => cw(v - lr*clip(dWf1[i][j])))),
        bf1: wt.bf1.map((v,i) => cw(v - lr*clip(dHf1p[i]))),
        Wf2: wt.Wf2.map((r,i) => r.map((v,j) => cw(v - lr*clip(dWf2[i][j])))),
        bf2: wt.bf2.map((v,i) => cw(v - lr*clip(dF[i]))),
      };

    }
  }
  return wt;
}


function normPx(prices: number[]) {
  let mn = Infinity, mx = -Infinity;
  for (const p of prices) { if (p < mn) mn = p; if (p > mx) mx = p; }
  const rng = mx - mn || 1;
  return { n: prices.map(p => (p-mn)/rng), mn, mx };
}

const dn = (v: number, mn: number, mx: number) => v*(mx-mn)+mn;
const avg = (a: number[]) => a.reduce((s,v) => s+v, 0)/a.length;
const sd  = (a: number[]) => { const m = avg(a); return Math.sqrt(a.reduce((s,v) => s+(v-m)**2, 0)/a.length); };

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

function scoreStock(closes: number[], riskTier = 4): {
  signal: "BUY"|"SELL"|"WAIT"|"STAY OUT";
  confidence: number; forecastPct: number;
  forecastDays: number; forecastLabel: string;
  walkForwardAccuracy: number; hitRate: number;
  regime: "NORMAL"|"SHIFTED"|"EXTREME"; converged: boolean;
} | null {
  const FD = riskTier===1?45:riskTier===2?30:riskTier===3?20:15;
  const FL = FD>=45?"~2 months":FD>=30?"~6 weeks":FD>=20?"~1 month":"~3 weeks";
  if (closes.length < WS+FD+20) return null;

  const { n: nm, mn, mx } = normPx(closes);
  const wins: number[][] = [];
  for (let i = 0; i+WS <= nm.length; i++) wins.push(nm.slice(i, i+WS));

  let W = initAE(), lr = 0.0003, converged = false;
  const curNorm = nm[nm.length-1];
  for (let e = 0; e < 200; e++) {
    const shuffled = [...wins].sort(() => Math.random()-0.5);
    for (const win of shuffled) { const f = fwd(win, W); W = bwd(win, f, W, lr); }
    const lw = nm.slice(nm.length-WS), f = fwd(lw, W);
    const err = Math.abs((f.recon[f.recon.length-1] - curNorm)/(curNorm||1))*100;
    if (!Number.isFinite(err)) return null;
    if (err < 1.0 && e > 20) { converged = true; break; }
    if (e === 80)  lr *= 0.5;
    if (e === 150) lr *= 0.5;
  }


  const fwWins: number[][] = [], fwTgts: number[][] = [];
  for (let i = 0; i+WS+FD <= nm.length; i++) {
    fwWins.push(nm.slice(i, i+WS));
    fwTgts.push(nm.slice(i+WS, i+WS+FD));
  }
  if (fwWins.length > 0) W = trainFwd(fwWins, fwTgts, W, 0.0003);

  const HOLD = 20;
  const trainC = closes.slice(0, closes.length-HOLD);
  const held   = closes.slice(closes.length-HOLD);
  const { n: tNm, mn: tMn, mx: tMx } = normPx(trainC);
  let Wv = initAE(), vlr = 0.0003;
  const vWins: number[][] = [];
  for (let i = 0; i+WS <= tNm.length; i++) vWins.push(tNm.slice(i, i+WS));
  for (let e = 0; e < 150; e++) {
    const sh = [...vWins].sort(() => Math.random()-0.5);
    for (const win of sh) { const f = fwd(win, Wv); Wv = bwd(win, f, Wv, vlr); }
    if (e === 75) vlr *= 0.5;
  }
  const vFwWins: number[][] = [], vFwTgts: number[][] = [];
  for (let i = 0; i+WS+HOLD <= tNm.length; i++) {
    vFwWins.push(tNm.slice(i, i+WS));
    vFwTgts.push(tNm.slice(i+WS, i+WS+HOLD));
  }
  if (vFwWins.length > 0) Wv = trainFwd(vFwWins, vFwTgts, Wv, 0.0003);

  const lastWin = tNm.slice(tNm.length-WS), valF = fwd(lastWin, Wv);
  const predPx  = valF.forecast.slice(0, HOLD).map(v => dn(v, tMn, tMx));
  const lastTrainPx = trainC[trainC.length-1];
  let mapeSum = 0, hits = 0;
  const cnt = Math.min(predPx.length, held.length);
  for (let i = 0; i < cnt; i++) {
    if (held[i] > 0) mapeSum += Math.abs((predPx[i]-held[i])/held[i]);
    const pd = predPx[i] > (i===0 ? lastTrainPx : predPx[i-1]);
    const ad = held[i]   > (i===0 ? lastTrainPx : held[i-1]);
    if (pd === ad) hits++;
  }
  const mape = cnt>0?(mapeSum/cnt)*100:50;
  const hitRate = cnt>0?(hits/cnt)*100:50;
  const wfAcc = Math.max(0, 100-mape);

  const rets = closes.slice(1).map((p,i) => (p-closes[i])/closes[i]);
  const cVol = sd(rets.slice(-20))*Math.sqrt(252);
  const tVol = sd(rets.slice(0,-20))*Math.sqrt(252);
  const ratio = tVol>0?cVol/tVol:1;
  const regime: "NORMAL"|"SHIFTED"|"EXTREME" = ratio>2.5?"EXTREME":ratio>1.5?"SHIFTED":"NORMAL";

  const finalW = nm.slice(nm.length-WS), finalF = fwd(finalW, W);
  const fPx    = finalF.forecast.slice(0, FD).map(v => dn(v, mn, mx));
  const curPx  = closes[closes.length-1];
  const anchorShift = curPx - dn(nm[nm.length-1], mn, mx);
  const fPct   = curPx>0?((fPx[fPx.length-1]+anchorShift-curPx)/curPx)*100:0;
  // debug removed



  const s1 = Math.max(0, 1-mape/10)*30;
  const s2 = Math.max(0, (hitRate-50)/50)*25;
  const s3 = converged?20:5;
  const s4 = regime==="NORMAL"?15:regime==="SHIFTED"?5:0;
  const s5 = Math.max(0, 1-mape/20)*10;
  const pen = regime==="EXTREME"?-25:regime==="SHIFTED"?-10:0;
  const confidence = Number.isFinite(s1+s2+s3+s4+s5+pen) ? Math.min(100, Math.max(0, s1+s2+s3+s4+s5+pen)) : 0;
  if (!Number.isFinite(fPct)) return null;


  const minConf  = riskTier===1?10:riskTier===2?12:15;
  const minHit   = riskTier===1?38:riskTier===2?40:42;
  const stayOut  = riskTier===1?25:riskTier===2?27:30;

  // ── Dip-buying override ──────────────────────────────────────────
  // If full-year trend is very strong but recent pullback < 15%,
  // treat as consolidation not reversal → lower bar for BUY
  const qs2 = quickScore(closes);
  const fullYearStrong = qs2 && qs2.annualReturn > 0.25 && qs2.rSquared > 0.5;
  const recentPullback = qs2 && qs2.recentReturn < 0 && qs2.recentReturn > -0.15;
  const isDipBuying = fullYearStrong && recentPullback;

  let signal: "BUY"|"SELL"|"WAIT"|"STAY OUT" = "WAIT";
  if (regime==="EXTREME"||hitRate<stayOut)                                         signal = "STAY OUT";
  else if (isDipBuying && confidence >= minConf*0.7 && hitRate >= minHit*0.9)      signal = "BUY"; // dip buy
  else if (confidence>=minConf&&fPct>0&&hitRate>=minHit)                           signal = "BUY";
  else if (confidence>=minConf&&fPct<0&&hitRate>=minHit)                           signal = "SELL";

  return {
    signal, confidence: Math.round(confidence*10)/10,
    forecastPct: Math.round(fPct*10)/10, forecastDays: FD, forecastLabel: FL,
    walkForwardAccuracy: Math.round(wfAcc*10)/10,
    hitRate: Math.round(hitRate*10)/10, regime, converged,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface HotStocksProps {
  onSelectTicker: (ticker: string) => void;
}

export function HotStocks({ onSelectTicker }: HotStocksProps) {
  const [stocks, setStocks]           = useState<HotStock[]>([]);
  const [isScanning, setIsScanning]   = useState(false);
  const [hasScanned, setHasScanned]   = useState(false);
  const [scanStatus, setScanStatus]   = useState("");
  const [riskProfile, setRiskProfile] = useState<RiskProfile>("aggressive");

  const discover = useCallback(async (profile?: RiskProfile) => {
    const activeProfile = profile ?? riskProfile;
    setIsScanning(true);
    setStocks([]);
    setHasScanned(false);
    setScanStatus("Fetching price data...");

    try {
      // Step 1: Fetch raw price data from edge function
      const { data, error } = await supabase.functions.invoke("hot-stocks", {
        body: { riskProfile: activeProfile },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const symbolData: SymbolData[] = data.symbolData || [];
      if (symbolData.length === 0) throw new Error("No price data available");

      setScanStatus(`Running momentum pre-filter on ${symbolData.length} symbols...`);

      // Step 2: Browser-side quickScore pre-filter → top 20 candidates
      const candidates = symbolData
        .map(s => ({ ...s, qs: quickScore(s.closes) }))
        .filter(s => s.qs !== null && s.qs.recentReturn > -0.05)
        .sort((a, b) => {
          const scoreA = (a.qs!.combinedScore) * (a.sectorBias) * (a.thematicBias);
          const scoreB = (b.qs!.combinedScore) * (b.sectorBias) * (b.thematicBias);
          return scoreB - scoreA;
        })
        .slice(0, 40);

      setScanStatus(`Training AE on top ${candidates.length} candidates...`);

      // Step 3: Full 200-epoch AE on each candidate (browser — no limits)
      const buySignals: HotStock[] = [];

      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        setScanStatus(`AE scoring ${c.symbol} (${i+1}/${candidates.length})...`);

        // yield to browser to keep UI responsive
        await new Promise(r => setTimeout(r, 0));

        const scored = scoreStock(c.closes, c.riskTier);
        console.log(`${c.symbol}: ${scored?.signal} conf=${scored?.confidence} hit=${scored?.hitRate} fPct=${scored?.forecastPct}`);
        if (!scored) continue;
        // Include BUY signals AND strong WAIT signals (top momentum)
        if (scored.signal !== "BUY" && scored.signal !== "WAIT") continue;
        if (scored.signal === "WAIT" && scored.confidence < 20) continue;
        // Tag signal strength for UI
        const effectiveSignal = scored.signal;
        if (effectiveSignal !== "BUY") continue; // strict BUY only for now

        buySignals.push({
          symbol:              c.symbol,
          price:               c.closes[c.closes.length-1],
          dayChange:           0,
          sector:              c.sector,
          signal:              scored.signal,
          confidence:          scored.confidence,
          forecastPct:         scored.forecastPct,
          forecastDays:        scored.forecastDays,
          forecastLabel:       scored.forecastLabel,
          walkForwardAccuracy: scored.walkForwardAccuracy,
          hitRate:             scored.hitRate,
          regime:              scored.regime,
          converged:           scored.converged,
          riskTier:            c.riskTier,
          riskLabel:           RISK_LABELS[c.riskTier] ?? "🔴 High Risk",
          breakout:            c.qs!.breakout && scored.converged,
          sectorHot:           c.sectorBias >= 1.5,
          thematicHot:         c.thematicBias >= 1.5,
        });

        // Show results progressively as they come in
        const sorted = [...buySignals].sort((a,b) => b.confidence - a.confidence);
        setStocks(sorted.slice(0, 10));
        setHasScanned(true);
      }

      // Final sort
      const final = buySignals
        .sort((a,b) => {
          const biasA = (data.sectorBias[a.sector]??1) * (data.thematicBias[a.sector]??1);
          const biasB = (data.sectorBias[b.sector]??1) * (data.thematicBias[b.sector]??1);
          return (b.confidence*biasB) - (a.confidence*biasA);
        })
        .slice(0, 10);

      setStocks(final);
      setHasScanned(true);
      setScanStatus(`Found ${buySignals.length} BUY signals`);

    } catch (e) {
      toast.error((e as Error).message);
      setScanStatus("");
    } finally {
      setIsScanning(false);
    }
  }, [riskProfile]);

  const handleProfileChange = (profile: RiskProfile) => {
    setRiskProfile(profile);
    if (hasScanned || stocks.length > 0) discover(profile);
  };

  return (
    <div className="space-y-3">
      {/* Risk Profile Toggle */}
      <div className="flex gap-1.5">
        {RISK_PROFILES.map(p => {
          const isSelected = riskProfile === p.value;
          return (
            <button key={p.value} onClick={() => handleProfileChange(p.value)}
              disabled={isScanning}
              className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-semibold border transition-all disabled:opacity-60 ${
                isSelected
                  ? `${p.selectedBg} ${p.selectedText} border-transparent shadow-sm`
                  : `bg-card/50 ${p.color} border hover:opacity-80`
              }`}>
              {p.label}
            </button>
          );
        })}
      </div>

      <button onClick={() => discover()} disabled={isScanning}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-all disabled:opacity-70">
        {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
        {isScanning ? "Scanning…" : hasScanned ? "Scan Again" : "Discover Hot Stocks"}
      </button>

      {/* Live progress */}
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
          {/* Show partial results while scanning */}
          {stocks.length > 0 && (
            <p className="text-[10px] font-mono text-zinc-500">
              {stocks.length} BUY signal{stocks.length !== 1 ? "s" : ""} found so far...
            </p>
          )}
        </div>
      )}

      {/* No results */}
      {hasScanned && stocks.length === 0 && !isScanning && (
        <p className="text-xs text-muted-foreground text-center py-2">
          No strong BUY signals found. Market conditions may be mixed — try again or switch profiles.
        </p>
      )}

      {/* Results */}
      {stocks.length > 0 && (
        <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
          {stocks.map((stock, i) => (
            <button key={stock.symbol} onClick={() => onSelectTicker(stock.symbol)}
              className="w-full text-left p-3 rounded-lg bg-card/50 border border-border hover:border-primary/40 hover:bg-card transition-all group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-muted-foreground w-4">#{i+1}</span>
                  <span className="text-sm font-mono font-bold text-foreground group-hover:text-primary transition-colors">
                    {stock.symbol}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono font-bold ${stock.forecastPct >= 0 ? "price-positive" : "price-negative"}`}>
                    {stock.forecastPct >= 0 ? "+" : ""}{stock.forecastPct.toFixed(1)}%
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {stock.forecastLabel}
                  </span>
                </div>
              </div>
              <div className="ml-6 mt-1 space-y-0.5">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    Confidence {stock.confidence.toFixed(1)}%
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    Hit {stock.hitRate}%
                  </span>
                  {stock.sector && (
                    <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                      {stock.sector}
                    </span>
                  )}
                  <span className="text-[10px] font-mono font-semibold">{stock.riskLabel}</span>
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
              </div>
            </button>
          ))}
          <p className="text-[9px] text-muted-foreground text-center mt-2 leading-relaxed">
            Ranked by QuantPulse™ AE · momentum × sector performance × thematic bias
          </p>
        </div>
      )}
    </div>
  );
}
