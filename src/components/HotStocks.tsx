import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { readCachedLinkages } from "@/lib/run-linkages";

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
  profileLabel: string;
  profileClass: string;
  hot: boolean;
  reason: string;
  linkageTilt?: number;
  linkageNote?: string;
}

interface SymbolData {
  symbol: string;
  sector: string;
  riskTier: number;
  closes: number[];
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

/** Cap picks-per-sector while preserving input order. */
function capPerSector<T extends { sector: string }>(items: T[], perSector: number): T[] {
  const counts: Record<string, number> = {};
  const out: T[] = [];
  for (const it of items) {
    const n = counts[it.sector] ?? 0;
    if (n >= perSector) continue;
    counts[it.sector] = n + 1;
    out.push(it);
  }
  return out;
}

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
  const [filter, setFilter]           = useState<"all" | "hot">("hot");
  const autoRan = useRef(false);

  const discover = useCallback(async () => {
    setIsScanning(true);
    setStocks([]);
    setHasScanned(false);
    setScanStatus("Fetching price data...");

    try {
      // Always fetch the full universe (aggressive covers all risk tiers)
      const { data, error } = await supabase.functions.invoke("hot-stocks", {
        body: { riskProfile: "aggressive" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const symbolData: SymbolData[] = data.symbolData || [];
      if (symbolData.length === 0) throw new Error("No price data available");

      setScanStatus(`Running momentum pre-filter on ${symbolData.length} symbols...`);

      // Pre-filter: compute quickScore for every symbol; keep all, mark rejects.
      const allScored = symbolData.map(s => ({ ...s, qs: quickScore(s.closes) }));

      // Candidates that pass pre-filter (recentReturn > -5%) go to full AE.
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

      setScanStatus(`Training AE on top ${candidates.length} candidates...`);

      // Sector linkage tilt (unchanged)
      const MACRO = new Set(["OIL","GOLD","US10Y","XLY_XLP_RATIO"]);
      const linkCache = readCachedLinkages();
      const sectorTilt: Record<string, { factor: number; note: string }> = {};
      if (linkCache?.results?.length) {
        const sectorRecentReturn: Record<string, number> = {};
        const bySector: Record<string, number[]> = {};
        for (const s of symbolData) {
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
        c: SymbolData,
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
        };
      };

      // Add symbols that were filtered out at the pre-filter stage with reasons.
      for (const s of allScored) {
        if (candidateSet.has(s.symbol)) continue;
        let reason = "";
        if (s.closes.length < 30) {
          reason = "Insufficient price history (<30 days)";
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

      // Full AE scoring on every candidate; record all outcomes.
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        setScanStatus(`AE scoring ${c.symbol} (${i+1}/${candidates.length})...`);
        await new Promise(r => setTimeout(r, 0));

        const scored = scoreStock(c.closes, c.riskTier);
        if (!scored) {
          results.push(buildRow(c, {
            signal: "NO MODEL",
            confidence: 0,
            forecastPct: 0,
            forecastDays: 0,
            forecastLabel: "—",
            walkForwardAccuracy: 0,
            hitRate: 0,
            regime: "NORMAL",
            converged: false,
            hot: false,
            reason: "Model failed to converge or produced invalid forecast",
            breakout: false,
          }));
        } else {
          const tilt = sectorTilt[c.sector];
          const tiltedConfidence = tilt ? Math.min(100, scored.confidence * tilt.factor) : scored.confidence;
          const hot = scored.signal === "BUY";
          let reason = "";
          if (hot) {
            reason = `BUY · conf ${Math.round(tiltedConfidence)}% · hit ${scored.hitRate}% · forecast ${scored.forecastPct >= 0 ? "+" : ""}${scored.forecastPct}%`;
          } else if (scored.signal === "STAY OUT") {
            reason = `Stay out — ${scored.regime === "EXTREME" ? "extreme volatility regime" : `hit rate too low (${scored.hitRate}%)`}`;
          } else if (scored.signal === "SELL") {
            reason = `Bearish forecast (${scored.forecastPct}%) with confidence ${Math.round(tiltedConfidence)}%`;
          } else {
            reason = `Wait — confidence ${Math.round(tiltedConfidence)}% below tier threshold or flat forecast (${scored.forecastPct}%)`;
          }
          results.push(buildRow(c, {
            signal: scored.signal,
            confidence: Math.round(tiltedConfidence * 10) / 10,
            forecastPct: scored.forecastPct,
            forecastDays: scored.forecastDays,
            forecastLabel: scored.forecastLabel,
            walkForwardAccuracy: scored.walkForwardAccuracy,
            hitRate: scored.hitRate,
            regime: scored.regime,
            converged: scored.converged,
            hot,
            reason,
            breakout: c.qs!.breakout && scored.converged,
            linkageTilt: tilt?.factor,
            linkageNote: tilt?.note,
          }));
        }

        // Live update: hot first, then by confidence
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
      setScanStatus(`Scored ${finalSorted.length} symbols · ${hotCount} hot (BUY) · ${finalSorted.length - hotCount} not hot`);

    } catch (e) {
      toast.error((e as Error).message);
      setScanStatus("");
    } finally {
      setIsScanning(false);
    }
  }, []);

  // Auto-run once on mount
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    discover();
  }, [discover]);

  const visible = filter === "hot" ? stocks.filter(s => s.hot) : stocks;
  const hotCount = stocks.filter(s => s.hot).length;

  return (
    <div className="space-y-3">
      <button onClick={() => discover()} disabled={isScanning}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-all disabled:opacity-70">
        {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
        {isScanning ? "Scanning…" : hasScanned ? "Rescan" : "Run Hot Stocks"}
      </button>

      {/* View toggle */}
      {hasScanned && stocks.length > 0 && (
        <div className="flex gap-1.5">
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
            ? "No hot BUY signals in this scan. Switch to 'All results' to see what the model saw."
            : "No results."}
        </p>
      )}

      {visible.length > 0 && (
        <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
          {visible.map((stock, i) => (
            <button key={stock.symbol} onClick={() => onSelectTicker(stock.symbol)}
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
                  {stock.hot ? (
                    <>
                      <span className={`text-xs font-mono font-bold ${stock.forecastPct >= 0 ? "price-positive" : "price-negative"}`}>
                        {stock.forecastPct >= 0 ? "+" : ""}{stock.forecastPct.toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {stock.forecastLabel}
                      </span>
                    </>
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
                        Conf {stock.confidence.toFixed(1)}%
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        Hit {stock.hitRate}%
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
