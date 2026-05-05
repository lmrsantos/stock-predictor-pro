// supabase/functions/find-hot-stocks/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Risk tiers ───────────────────────────────────────────────────────────────
// 1 = Low Risk (green)   → Treasuries, Money Market, IG Bonds
// 2 = Medium Risk (yellow) → Dividend ETFs, REITs, Preferred Stocks
// 3 = Medium-High (orange) → Covered Calls, Commodities, Sector ETFs
// 4 = High Risk (red)    → Individual Stocks

const RISK_TIERS: Record<string, number> = {
  // ── Fixed Income (tier 1) ──────────────────────────────────────────
  "TLT":1, "IEF":1, "SHV":1, "BIL":1, "SGOV":1, "TIPS":1,
  "LQD":1, "AGG":1, "BND":1, "VCSH":1, "VGSH":1,
  // ── Real Assets / REITs (tier 2) ──────────────────────────────────
  "VNQ":2, "O":2, "AMT":2, "PLD":2, "REGL":2, "XLRE":2,
  "GLD":2, "SLV":2, "IAU":2, "DJP":2, "PDBC":2,
  // ── Income ETFs / Preferred / Dividend (tier 2) ────────────────────
  "VYM":2, "SCHD":2, "DVY":2, "HDV":2, "PFF":2, "PFFD":2,
  // ── Covered Call ETFs (tier 3) ─────────────────────────────────────
  "JEPI":3, "QQQI":3, "RYLD":3, "QYLD":3, "XYLD":3,
  // ── Commodity ETFs (tier 3) ────────────────────────────────────────
  "USO":3, "UNG":3, "CORN":3, "WEAT":3, "CPER":3,
  // ── Sector ETFs (tier 3) ───────────────────────────────────────────
  "XLK":3, "XLF":3, "XLV":3, "XLE":3, "XLU":3, "XLI":3,
  // ── Individual Stocks (tier 4) — all below default to 4 ───────────
};

const RISK_LABELS: Record<number,string> = {
  1: "🟢 Low Risk",
  2: "🟡 Medium Risk",
  3: "🟠 Medium-High Risk",
  4: "🔴 High Risk",
};

// Risk profile → which tiers are included
const RISK_PROFILE_TIERS: Record<string, number[]> = {
  conservative:  [1, 2],
  moderate:      [1, 2, 3],
  aggressive:    [1, 2, 3, 4],
};

const SECTOR_UNIVERSES: Record<string, string[]> = {
  // ── Equities ──────────────────────────────────────────────────────
  Technology: [
    "AAPL","MSFT","GOOGL","META","NVDA","AMD","AVGO","CRM","ADBE",
    "ORCL","INTC","CSCO","IBM","NOW","QCOM","TXN","AMAT","MU","PANW","SNPS",
  ],
  "Aerospace & Defense": [
    "LMT","RTX","BA","NOC","GD","LHX","HII","TDG","HWM",
    "AXON","LDOS","KTOS","RKLB","LUNR","PLTR","SPR","ERJ","TXT","CW",
  ],
  Biotech: [
    "LLY","ABBV","JNJ","MRK","PFE","AMGN","GILD","REGN","VRTX",
    "BMY","MRNA","BIIB","ILMN","ISRG","DXCM","ALGN","HOLX","EXAS","SGEN","ALNY",
  ],
  Consumer: [
    "PG","KO","PEP","WMT","COST","MCD","NKE","SBUX","TGT",
    "CL","GIS","K","HSY","KMB","CHD","SJM","CAG","MKC","CLX","KHC",
  ],
  "Utilities & Energy": [
    "NEE","DUK","SO","D","AEP","SRE","EXC","XEL","WEC",
    "ES","ED","AWK","ATO","CMS","DTE","ETR","FE","PEG","PPL","CEG",
  ],
  Financials: [
    "JPM","V","MA","BAC","WFC","GS","MS","BLK","SCHW",
    "AXP","SPGI","ICE","CME","MCO","CB","AON","MMC","TFC","PNC","USB",
  ],
  // ── Fixed Income (Low Risk) ────────────────────────────────────────
  "Fixed Income": [
    "TLT","IEF","SHV","BIL","SGOV","TIPS","LQD","AGG","BND","VCSH","VGSH",
  ],
  // ── Real Assets (Medium Risk) ──────────────────────────────────────
  "Real Assets": [
    "VNQ","O","AMT","PLD","REGL","XLRE","GLD","SLV","IAU","DJP","PDBC",
  ],
  // ── Income ETFs (Medium Risk) ──────────────────────────────────────
  "Income & Dividends": [
    "VYM","SCHD","DVY","HDV","PFF","PFFD","JEPI","QQQI","RYLD","QYLD","XYLD",
  ],
  // ── Commodity & Sector ETFs (Medium-High Risk) ─────────────────────
  "Commodities & Sectors": [
    "USO","UNG","GLD","SLV","CPER","XLK","XLF","XLV","XLE","XLU","XLI",
  ],
};

// ─── Fast momentum pre-filter (no ML, just math) ──────────────────────────────
// Returns annualized return and R² from simple linear regression.
// Used to shortlist candidates before running the autoencoder.

function quickScore(closes: number[]): { annualReturn: number; rSquared: number } | null {
  const n = closes.length;
  if (n < 30) return null;
  const xs = Array.from({ length: n }, (_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = closes.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * closes[i], 0);
  const sumX2 = xs.reduce((s, x) => s + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const ssTot = closes.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const ssRes = closes.reduce((s, y, i) => s + (y - (slope * i + intercept)) ** 2, 0);
  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  const lastPrice = closes[n - 1];
  const annualReturn = lastPrice > 0 ? (slope * 252) / lastPrice : 0;
  return { annualReturn, rSquared };
}

// ─── Minimal autoencoder ──────────────────────────────────────────────────────

const relu = (x: number) => Math.max(0, x);
const reluGrad = (x: number) => (x > 0 ? 1 : 0);

function affine(W: number[][], b: number[], v: number[]): number[] {
  return W.map((row, i) => row.reduce((s, w, j) => s + w * v[j], 0) + b[i]);
}

function randMat(rows: number, cols: number): number[][] {
  const scale = Math.sqrt(2 / (rows + cols));
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (Math.random() * 2 - 1) * scale)
  );
}

const zeros = (n: number): number[] => new Array(n).fill(0);

const WS = 20; // window
const HS = 10; // hidden
const LS = 4;  // latent
const FS = 15; // forecast days

interface AEW {
  We1: number[][]; be1: number[];
  We2: number[][]; be2: number[];
  Wd1: number[][]; bd1: number[];
  Wd2: number[][]; bd2: number[];
  Wf1: number[][]; bf1: number[];
  Wf2: number[][]; bf2: number[];
}

function initAE(): AEW {
  return {
    We1: randMat(HS,WS), be1: zeros(HS),
    We2: randMat(LS,HS), be2: zeros(LS),
    Wd1: randMat(HS,LS), bd1: zeros(HS),
    Wd2: randMat(WS,HS), bd2: zeros(WS),
    Wf1: randMat(HS,LS), bf1: zeros(HS),
    Wf2: randMat(FS,HS), bf2: zeros(FS),
  };
}

function fwd(input: number[], w: AEW) {
  const he1pre = affine(w.We1, w.be1, input);
  const he1    = he1pre.map(relu);
  const latent = affine(w.We2, w.be2, he1);
  const hd1pre = affine(w.Wd1, w.bd1, latent);
  const hd1    = hd1pre.map(relu);
  const recon  = affine(w.Wd2, w.bd2, hd1);
  const hf1pre = affine(w.Wf1, w.bf1, latent);
  const hf1    = hf1pre.map(relu);
  const forecast = affine(w.Wf2, w.bf2, hf1);
  return { he1pre, he1, latent, hd1pre, hd1, recon, hf1pre, hf1, forecast };
}

function bwd(input: number[], f: ReturnType<typeof fwd>, w: AEW, lr: number): AEW {
  const n    = input.length;
  const dR   = f.recon.map((r,i) => (2/n)*(r-input[i]));
  const dWd2 = dR.map(g => f.hd1.map(h => g*h));
  const dHd1 = f.hd1.map((_,j) => dR.reduce((s,g,i) => s+g*w.Wd2[i][j], 0));
  const dHd1p= dHd1.map((g,i) => g*reluGrad(f.hd1pre[i]));
  const dWd1 = dHd1p.map(g => f.latent.map(l => g*l));
  const dLat = f.latent.map((_,j) => dHd1p.reduce((s,g,i) => s+g*w.Wd1[i][j], 0));
  const dWe2 = dLat.map(g => f.he1.map(h => g*h));
  const dHe1 = f.he1.map((_,j) => dLat.reduce((s,g,i) => s+g*w.We2[i][j], 0));
  const dHe1p= dHe1.map((g,i) => g*reluGrad(f.he1pre[i]));
  const dWe1 = dHe1p.map(g => input.map(x => g*x));
  const up   = (M:number[][], dM:number[][]) => M.map((r,i) => r.map((v,j) => v-lr*dM[i][j]));
  const upV  = (b:number[], db:number[])     => b.map((v,i) => v-lr*db[i]);
  return {
    We1:up(w.We1,dWe1), be1:upV(w.be1,dHe1p),
    We2:up(w.We2,dWe2), be2:upV(w.be2,dLat),
    Wd1:up(w.Wd1,dWd1), bd1:upV(w.bd1,dHd1p),
    Wd2:up(w.Wd2,dWd2), bd2:upV(w.bd2,dR),
    Wf1:w.Wf1, bf1:w.bf1, Wf2:w.Wf2, bf2:w.bf2,
  };
}

function trainFwd(wins: number[][], tgts: number[][], w: AEW, lr: number): AEW {
  let wt = {...w};
  for (let e=0; e<40; e++) {
    for (let i=0; i<wins.length; i++) {
      const f  = fwd(wins[i], wt);
      const dF = f.forecast.map((v,j) => (2/FS)*(v-tgts[i][j]));
      const dWf2=dF.map(g => f.hf1.map(h => g*h));
      const dHf1=f.hf1.map((_,j) => dF.reduce((s,g,i) => s+g*wt.Wf2[i][j],0));
      const dHf1p=dHf1.map((g,i) => g*reluGrad(f.hf1pre[i]));
      const dWf1=dHf1p.map(g => f.latent.map(l => g*l));
      wt = {
        ...wt,
        Wf1:wt.Wf1.map((r,i)=>r.map((v,j)=>v-lr*dWf1[i][j])),
        bf1:wt.bf1.map((v,i)=>v-lr*dHf1p[i]),
        Wf2:wt.Wf2.map((r,i)=>r.map((v,j)=>v-lr*dWf2[i][j])),
        bf2:wt.bf2.map((v,i)=>v-lr*dF[i]),
      };
    }
  }
  return wt;
}

function norm(prices: number[]) {
  const mn = Math.min(...prices), mx = Math.max(...prices);
  const rng = mx-mn || 1;
  return { n: prices.map(p=>(p-mn)/rng), mn, mx };
}
const dn = (v:number,mn:number,mx:number) => v*(mx-mn)+mn;
const avg = (a:number[]) => a.reduce((s,v)=>s+v,0)/a.length;
const sd  = (a:number[]) => { const m=avg(a); return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length); };

// ─── Score one stock with lightweight AE (60 epochs only) ────────────────────

function scoreStock(closes: number[]): {
  signal: "BUY"|"SELL"|"WAIT"|"STAY OUT";
  confidence: number;
  forecastPct: number;
  walkForwardAccuracy: number;
  hitRate: number;
  regime: "NORMAL"|"SHIFTED"|"EXTREME";
  converged: boolean;
} | null {
  if (closes.length < WS+FS+25) return null;

  const HOLD = 15;
  const { n: nm, mn, mx } = norm(closes);

  // Build windows
  const wins: number[][] = [];
  for (let i=0; i+WS<=nm.length; i++) wins.push(nm.slice(i,i+WS));

  // Train AE — 60 epochs (lighter than full modal)
  let W = initAE();
  const curNorm = nm[nm.length-1];
  let converged = false;
  let lr = 0.001;

  for (let e=0; e<60; e++) {
    // deterministic order (no shuffle) — avoids any randomness issues in Deno
    for (const win of wins) {
      const f = fwd(win, W);
      W = bwd(win, f, W, lr);
    }
    const lw  = nm.slice(nm.length-WS);
    const f   = fwd(lw, W);
    const err = Math.abs((f.recon[f.recon.length-1]-curNorm)/(curNorm||1))*100;
    if (err<1.5 && e>10) { converged=true; break; }
    if (e===30) lr*=0.5;
  }

  // Train forecaster
  const fwWins:number[][]=[], fwTgts:number[][]=[];
  for (let i=0; i+WS+FS<=nm.length; i++) {
    fwWins.push(nm.slice(i,i+WS));
    fwTgts.push(nm.slice(i+WS,i+WS+FS));
  }
  if (fwWins.length>0) W = trainFwd(fwWins,fwTgts,W,0.0005);

  // Walk-forward on held-out HOLD days
  const trainC = closes.slice(0,closes.length-HOLD);
  const held   = closes.slice(closes.length-HOLD);
  const { n:tNm, mn:tMn, mx:tMx } = norm(trainC);
  let Wv = initAE();
  const vWins:number[][]=[];
  for (let i=0; i+WS<=tNm.length; i++) vWins.push(tNm.slice(i,i+WS));
  for (let e=0; e<50; e++) {
    for (const win of vWins) { const f=fwd(win,Wv); Wv=bwd(win,f,Wv,0.001); }
  }
  const vFwWins:number[][]=[], vFwTgts:number[][]=[];
  for (let i=0; i+WS+HOLD<=tNm.length; i++) {
    vFwWins.push(tNm.slice(i,i+WS));
    vFwTgts.push(tNm.slice(i+WS,i+WS+HOLD));
  }
  if (vFwWins.length>0) Wv=trainFwd(vFwWins,vFwTgts,Wv,0.0005);

  const lw     = tNm.slice(tNm.length-WS);
  const vF     = fwd(lw, Wv);
  const predNm = vF.forecast.slice(0,HOLD);
  const predPx = predNm.map(v=>dn(v,tMn,tMx));

  let mapeSum=0, hits=0;
  const lastTrain = trainC[trainC.length-1];
  const cnt = Math.min(predPx.length,held.length);
  for (let i=0; i<cnt; i++) {
    mapeSum += Math.abs((predPx[i]-held[i])/held[i]);
    const pd = predPx[i]>(i===0?lastTrain:predPx[i-1]);
    const ad = held[i]>(i===0?lastTrain:held[i-1]);
    if (pd===ad) hits++;
  }
  const mape    = cnt>0 ? (mapeSum/cnt)*100 : 50;
  const hitRate = cnt>0 ? (hits/cnt)*100     : 50;
  const wfAcc   = Math.max(0,100-mape);

  // Regime
  const rets   = closes.slice(1).map((p,i)=>(p-closes[i])/closes[i]);
  const cVol   = sd(rets.slice(-20))*Math.sqrt(252);
  const tVol   = sd(rets.slice(0,-20))*Math.sqrt(252);
  const ratio  = tVol>0 ? cVol/tVol : 1;
  const regime: "NORMAL"|"SHIFTED"|"EXTREME" =
    ratio>2.5 ? "EXTREME" : ratio>1.5 ? "SHIFTED" : "NORMAL";

  // Forecast direction
  const lastWin  = nm.slice(nm.length-WS);
  const finalFwd = fwd(lastWin, W);
  const fPx      = finalFwd.forecast.map(v=>dn(v,mn,mx));
  const curPx    = closes[closes.length-1];
  const fPct     = ((fPx[fPx.length-1]-curPx)/curPx)*100;
  const up       = fPct>0;

  // Confidence
  const s1 = Math.max(0,1-mape/10)*30;
  const s2 = Math.max(0,(hitRate-50)/50)*20;
  const s3 = converged ? 15 : 0;
  const s4 = regime==="NORMAL"?15:regime==="SHIFTED"?5:0;
  const s5 = Math.max(0,1-mape/20)*20;
  const pen= regime==="EXTREME"?-25:regime==="SHIFTED"?-10:0;
  const confidence = Math.min(100,Math.max(0,s1+s2+s3+s4+s5+pen));

  // Signal
  let signal: "BUY"|"SELL"|"WAIT"|"STAY OUT" = "WAIT";
  if (regime==="EXTREME" || hitRate<45)              signal="STAY OUT";
  else if (confidence>=40 && up    && hitRate>=50)   signal="BUY";
  else if (confidence>=40 && !up   && hitRate>=50)   signal="SELL";

  return { signal, confidence, forecastPct:Math.round(fPct*10)/10,
           walkForwardAccuracy:Math.round(wfAcc*10)/10,
           hitRate:Math.round(hitRate*10)/10, regime, converged };
}

function fmtCap(v:number):string {
  if (v>=1e12) return `${(v/1e12).toFixed(1)}T`;
  if (v>=1e9)  return `${(v/1e9).toFixed(1)}B`;
  if (v>=1e6)  return `${(v/1e6).toFixed(0)}M`;
  return `${v}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method==="OPTIONS") return new Response(null,{headers:corsHeaders});

  try {
    const FMP_API_KEY = Deno.env.get("FMP_API_KEY");
    if (!FMP_API_KEY) throw new Error("FMP_API_KEY not configured in Supabase secrets");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase    = createClient(supabaseUrl,supabaseKey);

    let sectorFilter:string|null=null, topN=10, riskProfile="aggressive";
    try {
      const body = await req.json();
      sectorFilter  = body.sector||null;
      riskProfile   = body.riskProfile||"aggressive";
      if (body.limit) topN=Math.min(body.limit,20);
    } catch { /* no body — fine */ }

    // Validate risk profile
    if (!["conservative","moderate","aggressive"].includes(riskProfile)) riskProfile="aggressive";
    const allowedTiers = RISK_PROFILE_TIERS[riskProfile];

    const cacheKey = sectorFilter
      ? `ae_hot_v2_${riskProfile}_${sectorFilter}`
      : `ae_hot_v2_${riskProfile}_all`;

    // Cache check (30 min)
    const since = new Date(Date.now()-30*60*1000).toISOString();
    const { data:cached } = await supabase
      .from("market_updates").select("content")
      .eq("signal_type",cacheKey).gte("created_at",since)
      .order("created_at",{ascending:false}).limit(1);

    if (cached?.length) {
      try {
        const p=JSON.parse(cached[0].content);
        if (Array.isArray(p)&&p.length>0)
          return new Response(JSON.stringify({stocks:p,cached:true}),
            {headers:{...corsHeaders,"Content-Type":"application/json"}});
      } catch { /* fall through */ }
    }

    const sectorsToScan = sectorFilter
      ? {[sectorFilter]:SECTOR_UNIVERSES[sectorFilter]||[]}
      : SECTOR_UNIVERSES;

    const allSymbols:{symbol:string;sector:string;riskTier:number}[] = [];
    for (const [sector,syms] of Object.entries(sectorsToScan)) {
      for (const sym of syms) {
        const riskTier = RISK_TIERS[sym] ?? 4; // default to tier 4 (stocks)
        if (allowedTiers.includes(riskTier)) {
          allSymbols.push({symbol:sym, sector, riskTier});
        }
      }
    }

    console.log(`Step 1: Quick momentum scan of ${allSymbols.length} stocks (profile: ${riskProfile}, tiers: ${allowedTiers.join(",")})`);

    // ── STEP 1: Fast momentum pre-filter — fetch prices + quick score all ──────
    const candidates:{symbol:string;sector:string;riskTier:number;closes:number[];qs:{annualReturn:number;rSquared:number}}[]=[];

    for (let i=0; i<allSymbols.length; i+=8) {
      const batch=allSymbols.slice(i,i+8);
      const res=await Promise.allSettled(batch.map(async ({symbol,sector,riskTier})=>{
        let closes:number[]=[];
        const {data:db}=await supabase.from("stock_prices").select("close")
          .eq("ticker",symbol).order("date",{ascending:true}).limit(260);
        if (db&&db.length>=50) {
          closes=db.map((p:{close:number})=>Number(p.close));
        } else {
          const r=await fetch(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&apikey=${FMP_API_KEY}`);
          if (r.ok) {
            const d=await r.json();
            if (Array.isArray(d)&&d.length>=50)
              closes=d.slice(0,252).reverse().map((x:{close:number})=>x.close);
          } else { await r.text(); }
        }
        if (closes.length<50) return null;
        const qs=quickScore(closes);
        if (!qs||qs.annualReturn<=0||qs.rSquared<0.1) return null;
        return {symbol,sector,riskTier,closes,qs};
      }));
      for (const r of res)
        if (r.status==="fulfilled"&&r.value) candidates.push(r.value);
    }

    // Sort by momentum score, keep top 15 for AE scoring
    candidates.sort((a,b)=>(b.qs.annualReturn*b.qs.rSquared)-(a.qs.annualReturn*a.qs.rSquared));
    const shortlist=candidates.slice(0,30);
    console.log(`Step 2: AE scoring ${shortlist.length} shortlisted stocks (top 30 by momentum)`);

    // ── STEP 2: Run autoencoder on shortlist only ─────────────────────────────
    const buySignals:{
      symbol:string; name:string; price:number; dayChange:number;
      sector:string; marketCap:string; signal:string; confidence:number;
      forecastPct:number; walkForwardAccuracy:number; hitRate:number;
      regime:string; converged:boolean; riskTier:number; riskLabel:string;
    }[]=[];

    for (const {symbol,sector,riskTier,closes} of shortlist) {
      try {
        const scored=scoreStock(closes);
        if (!scored||scored.signal!=="BUY") continue;

        // Get display info
        let name=symbol, price=closes[closes.length-1], dayChange=0, marketCap=0;
        try {
          const qr=await fetch(`https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${FMP_API_KEY}`);
          if (qr.ok) {
            const qd=await qr.json();
            if (Array.isArray(qd)&&qd.length>0) {
              name=qd[0].companyName||symbol;
              price=qd[0].price||price;
              dayChange=qd[0].changes||0;
              marketCap=qd[0].mktCap||0;
            }
          } else { await qr.text(); }
        } catch { /* use defaults */ }

        buySignals.push({
          symbol,name,price,dayChange,sector,
          marketCap:fmtCap(marketCap),
          signal:scored.signal,
          confidence:scored.confidence,
          forecastPct:scored.forecastPct,
          walkForwardAccuracy:scored.walkForwardAccuracy,
          hitRate:scored.hitRate,
          regime:scored.regime,
          converged:scored.converged,
          riskTier,
          riskLabel: RISK_LABELS[riskTier] ?? "🔴 High Risk",
        });
      } catch(e) {
        console.error(`AE error for ${symbol}:`,e);
      }
    }

    buySignals.sort((a,b)=>b.confidence-a.confidence);
    const top=buySignals.slice(0,topN);

    console.log(`Done: ${buySignals.length} BUY signals (profile: ${riskProfile}), returning top ${top.length}`);

    if (top.length>0) {
      await supabase.from("market_updates").insert({
        content:JSON.stringify(top), ticker:null, signal_type:cacheKey,
      });
    }

    return new Response(
      JSON.stringify({
        stocks: top,
        cached: false,
        totalBuySignals: buySignals.length,
        sectorsScanned: Object.keys(sectorsToScan),
        riskProfile,
        allowedTiers,
      }),
      {headers:{...corsHeaders,"Content-Type":"application/json"}}
    );

  } catch(error) {
    console.error("Hot stocks error:",error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : null,
      }),
      {status:500, headers:{...corsHeaders,"Content-Type":"application/json"}}
    );
  }
});
