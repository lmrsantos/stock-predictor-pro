// supabase/functions/run-hot-stocks-scan/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hot stocks background scanner — called by pg_cron every 30 min
//
// Architecture (proven reliable):
//   - Linear regression for direction + momentum scoring (fast, deterministic)
//   - Lightweight AE (8 epochs) for confidence scoring only
//   - Sector bias (FMP live data) + thematic bias (geo tension)
//   - Processes ONE profile per call to stay within resource limits
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Universe (85 symbols) ────────────────────────────────────────────────────

const SECTOR_UNIVERSES: Record<string, string[]> = {
  Technology:            ["NVDA","AAPL","MSFT","AMD","AVGO","META","GOOGL","QCOM","AMAT","INTC","TSLA","AMZN","TSM"],
  "Quantum Computing":   ["IONQ","ARQQ","RGTI","QBTS","QUBT"],
  "Aerospace & Defense": ["LMT","RTX","RKLB","PLTR","NOC","AXON","LUNR","KTOS"],
  Biotech:               ["LLY","ABBV","VRTX","REGN","AMGN","MRK","ISRG","MRNA"],
  Consumer:              ["WMT","COST","PG","KO","MCD"],
  "Utilities & Energy":  ["NEE","CEG","VST","XEL","ETR","XOM","CVX"],
  Financials:            ["JPM","V","GS","BLK","SPGI"],
  "Fixed Income":        ["TLT","IEF","BIL","AGG","LQD","SGOV","SHV","VCSH","VGSH","IUSB"],
  "Real Assets":         ["GLD","IAU","VNQ","AMT","O","IGSB","IGIB","IGLB"],
  "Income & Dividends":  ["SCHD","VYM","JEPI","HDV","PFFD","DVY","QDIV","DGRW"],
  "Commodities & Sectors": ["XLE","XLK","XLF","XLV","XLI","IYW","IYE","IYH"],
};

const RISK_TIERS: Record<string, number> = {
  TLT:1,IEF:1,BIL:1,AGG:1,LQD:1,SGOV:1,SHV:1,VCSH:1,VGSH:1,IUSB:1,
  GLD:2,IAU:2,VNQ:2,AMT:2,O:2,IGSB:2,IGIB:2,IGLB:2,
  VYM:2,SCHD:2,DVY:2,HDV:2,PFF:2,PFFD:2,QDIV:2,DGRW:2,
  JEPI:3,XLK:3,XLF:3,XLV:3,XLE:3,XLI:3,IYW:3,IYE:3,IYH:3,
  IONQ:4,ARQQ:4,RGTI:4,QBTS:4,QUBT:4,
};

const RISK_LABELS: Record<number,string> = {
  1:"🟢 Low Risk",2:"🟡 Medium Risk",3:"🟠 Medium-High Risk",4:"🔴 High Risk",
};

const RISK_PROFILE_TIERS: Record<string,number[]> = {
  conservative:[1,2], moderate:[1,2,3], aggressive:[1,2,3,4],
};

// ─── Math helpers ─────────────────────────────────────────────────────────────

function linReg(closes: number[]): {
  slope:number; rSquared:number; annualReturn:number;
} | null {
  const n = closes.length;
  if (n < 10) return null;
  const xs = Array.from({length:n},(_,i)=>i);
  const sumX=xs.reduce((a,b)=>a+b,0), sumY=closes.reduce((a,b)=>a+b,0);
  const sumXY=xs.reduce((s,x,i)=>s+x*closes[i],0);
  const sumX2=xs.reduce((s,x)=>s+x*x,0);
  const denom=n*sumX2-sumX*sumX;
  if(denom===0) return null;
  const slope=(n*sumXY-sumX*sumY)/denom;
  const intercept=(sumY-slope*sumX)/n;
  const meanY=sumY/n;
  const ssTot=closes.reduce((s,y)=>s+(y-meanY)**2,0);
  const ssRes=closes.reduce((s,y,i)=>s+(y-(slope*i+intercept))**2,0);
  const rSquared=ssTot>0?Math.max(0,1-ssRes/ssTot):0;
  const annualReturn=closes[n-1]>0?(slope*252)/closes[n-1]:0;
  return {slope,rSquared,annualReturn};
}

function quickScore(closes: number[]): {
  annualReturn:number; rSquared:number;
  recentReturn:number; recentRSquared:number;
  combinedScore:number; breakout:boolean;
} | null {
  if(closes.length<30) return null;
  const full=linReg(closes);
  if(!full) return null;
  const recent60=closes.slice(-60);
  const recent=linReg(recent60.length>=20?recent60:closes.slice(-30));
  if(!recent) return null;
  const fullScore=full.annualReturn*Math.max(0,full.rSquared);
  const recentScore=recent.annualReturn*Math.max(0,recent.rSquared);
  const combinedScore=recentScore*3+fullScore;
  const breakout=recent.annualReturn>0&&full.annualReturn>=0&&
    recent.annualReturn>full.annualReturn*2;
  return {
    annualReturn:full.annualReturn, rSquared:full.rSquared,
    recentReturn:recent.annualReturn, recentRSquared:recent.rSquared,
    combinedScore, breakout,
  };
}

const avg=(a:number[])=>a.reduce((s,v)=>s+v,0)/a.length;
const sd=(a:number[])=>{const m=avg(a);return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length);};

// ─── Full AE scoring (200 epochs on Small compute tier) ──────────────────────

const relu=(x:number)=>Math.max(0,x);
const reluGrad=(x:number)=>(x>0?1:0);
function affine(W:number[][],b:number[],v:number[]):number[]{
  return W.map((row,i)=>row.reduce((s,w,j)=>s+w*v[j],0)+b[i]);
}
function randMat(r:number,c:number):number[][]{
  const sc=Math.sqrt(2/(r+c));
  return Array.from({length:r},()=>Array.from({length:c},()=>(Math.random()*2-1)*sc));
}
const zeros=(n:number)=>new Array(n).fill(0);
const WS=20,HS=12,LS=4,FS=45;

interface AEW{
  We1:number[][];be1:number[];We2:number[][];be2:number[];
  Wd1:number[][];bd1:number[];Wd2:number[][];bd2:number[];
  Wf1:number[][];bf1:number[];Wf2:number[][];bf2:number[];
}
function initAE():AEW{return{
  We1:randMat(HS,WS),be1:zeros(HS),We2:randMat(LS,HS),be2:zeros(LS),
  Wd1:randMat(HS,LS),bd1:zeros(HS),Wd2:randMat(WS,HS),bd2:zeros(WS),
  Wf1:randMat(HS,LS),bf1:zeros(HS),Wf2:randMat(FS,HS),bf2:zeros(FS),
};}
function fwd(input:number[],w:AEW){
  const he1pre=affine(w.We1,w.be1,input),he1=he1pre.map(relu);
  const latent=affine(w.We2,w.be2,he1);
  const hd1pre=affine(w.Wd1,w.bd1,latent),hd1=hd1pre.map(relu);
  const recon=affine(w.Wd2,w.bd2,hd1);
  const hf1pre=affine(w.Wf1,w.bf1,latent),hf1=hf1pre.map(relu);
  const forecast=affine(w.Wf2,w.bf2,hf1);
  return{he1pre,he1,latent,hd1pre,hd1,recon,hf1pre,hf1,forecast};
}
function bwd(input:number[],f:ReturnType<typeof fwd>,w:AEW,lr:number):AEW{
  const n=input.length,dR=f.recon.map((r,i)=>(2/n)*(r-input[i]));
  const dWd2=dR.map(g=>f.hd1.map(h=>g*h));
  const dHd1=f.hd1.map((_,j)=>dR.reduce((s,g,i)=>s+g*w.Wd2[i][j],0));
  const dHd1p=dHd1.map((g,i)=>g*reluGrad(f.hd1pre[i]));
  const dWd1=dHd1p.map(g=>f.latent.map(l=>g*l));
  const dLat=f.latent.map((_,j)=>dHd1p.reduce((s,g,i)=>s+g*w.Wd1[i][j],0));
  const dWe2=dLat.map(g=>f.he1.map(h=>g*h));
  const dHe1=f.he1.map((_,j)=>dLat.reduce((s,g,i)=>s+g*w.We2[i][j],0));
  const dHe1p=dHe1.map((g,i)=>g*reluGrad(f.he1pre[i]));
  const dWe1=dHe1p.map(g=>input.map(x=>g*x));
  const up=(M:number[][],dM:number[][])=>M.map((r,i)=>r.map((v,j)=>v-lr*dM[i][j]));
  const upV=(b:number[],db:number[])=>b.map((v,i)=>v-lr*db[i]);
  return{
    We1:up(w.We1,dWe1),be1:upV(w.be1,dHe1p),
    We2:up(w.We2,dWe2),be2:upV(w.be2,dLat),
    Wd1:up(w.Wd1,dWd1),bd1:upV(w.bd1,dHd1p),
    Wd2:up(w.Wd2,dWd2),bd2:upV(w.bd2,dR),
    Wf1:w.Wf1,bf1:w.bf1,Wf2:w.Wf2,bf2:w.bf2,
  };
}
function trainFwd(wins:number[][],tgts:number[][],w:AEW,lr:number):AEW{
  let wt={...w};
  for(let e=0;e<80;e++){
    for(let i=0;i<wins.length;i++){
      const f=fwd(wins[i],wt);
      const dF=f.forecast.map((v,j)=>(2/tgts[i].length)*(v-tgts[i][j]));
      const dWf2=dF.map(g=>f.hf1.map(h=>g*h));
      const dHf1=f.hf1.map((_,j)=>dF.reduce((s,g,i)=>s+g*wt.Wf2[i][j],0));
      const dHf1p=dHf1.map((g,i)=>g*reluGrad(f.hf1pre[i]));
      const dWf1=dHf1p.map(g=>f.latent.map(l=>g*l));
      wt={...wt,
        Wf1:wt.Wf1.map((r,i)=>r.map((v,j)=>v-lr*dWf1[i][j])),
        bf1:wt.bf1.map((v,i)=>v-lr*dHf1p[i]),
        Wf2:wt.Wf2.map((r,i)=>r.map((v,j)=>v-lr*dWf2[i][j])),
        bf2:wt.bf2.map((v,i)=>v-lr*dF[i]),
      };
    }
  }
  return wt;
}
function normPx(prices:number[]){
  const mn=Math.min(...prices),mx=Math.max(...prices),rng=mx-mn||1;
  return{n:prices.map(p=>(p-mn)/rng),mn,mx};
}
const dn=(v:number,mn:number,mx:number)=>v*(mx-mn)+mn;

interface ScoreResult {
  signal:"BUY"|"SELL"|"WAIT"|"STAY OUT";
  confidence:number;forecastPct:number;
  forecastDays:number;forecastLabel:string;
  walkForwardAccuracy:number;hitRate:number;
  regime:"NORMAL"|"SHIFTED"|"EXTREME";
  converged:boolean;
}

function scoreStock(closes:number[],riskTier=4): ScoreResult|null {
  const FD=riskTier===1?45:riskTier===2?30:riskTier===3?20:15;
  const FL=FD>=45?"~2 months":FD>=30?"~6 weeks":FD>=20?"~1 month":"~3 weeks";
  const minData=WS+FD+20;
  if(closes.length<minData) return null;

  const{n:nm,mn,mx}=normPx(closes);

  // ── Train AE — 200 epochs (Small compute has headroom) ────────────
  const wins:number[][]=[];
  for(let i=0;i+WS<=nm.length;i++) wins.push(nm.slice(i,i+WS));
  let W=initAE(),lr=0.001,converged=false;
  const curNorm=nm[nm.length-1];

  for(let e=0;e<200;e++){
    const shuffled=[...wins].sort(()=>Math.random()-0.5);
    for(const win of shuffled){const f=fwd(win,W);W=bwd(win,f,W,lr);}
    const lw=nm.slice(nm.length-WS),f=fwd(lw,W);
    const err=Math.abs((f.recon[f.recon.length-1]-curNorm)/(curNorm||1))*100;
    if(err<1.0&&e>20){converged=true;break;}
    if(e===80) lr*=0.5;
    if(e===150) lr*=0.5;
  }

  // ── Train forecaster ──────────────────────────────────────────────
  const fwWins:number[][]=[], fwTgts:number[][]=[];
  for(let i=0;i+WS+FD<=nm.length;i++){
    fwWins.push(nm.slice(i,i+WS));
    fwTgts.push(nm.slice(i+WS,i+WS+FD));
  }
  if(fwWins.length>0) W=trainFwd(fwWins,fwTgts,W,0.0003);

  // ── Walk-forward validation ───────────────────────────────────────
  const HOLD=20;
  const trainC=closes.slice(0,closes.length-HOLD);
  const held=closes.slice(closes.length-HOLD);
  const{n:tNm,mn:tMn,mx:tMx}=normPx(trainC);

  let Wv=initAE(),vlr=0.001;
  const vWins:number[][]=[];
  for(let i=0;i+WS<=tNm.length;i++) vWins.push(tNm.slice(i,i+WS));
  for(let e=0;e<150;e++){
    const sh=[...vWins].sort(()=>Math.random()-0.5);
    for(const win of sh){const f=fwd(win,Wv);Wv=bwd(win,f,Wv,vlr);}
    if(e===75) vlr*=0.5;
  }
  const vFwWins:number[][]=[], vFwTgts:number[][]=[];
  for(let i=0;i+WS+HOLD<=tNm.length;i++){
    vFwWins.push(tNm.slice(i,i+WS));
    vFwTgts.push(tNm.slice(i+WS,i+WS+HOLD));
  }
  if(vFwWins.length>0) Wv=trainFwd(vFwWins,vFwTgts,Wv,0.0003);

  const lastWin=tNm.slice(tNm.length-WS),valF=fwd(lastWin,Wv);
  const predPx=valF.forecast.slice(0,HOLD).map(v=>dn(v,tMn,tMx));
  const lastTrainPx=trainC[trainC.length-1];

  let mapeSum=0,hits=0;
  const cnt=Math.min(predPx.length,held.length);
  for(let i=0;i<cnt;i++){
    if(held[i]>0) mapeSum+=Math.abs((predPx[i]-held[i])/held[i]);
    const pd=predPx[i]>(i===0?lastTrainPx:predPx[i-1]);
    const ad=held[i]>(i===0?lastTrainPx:held[i-1]);
    if(pd===ad) hits++;
  }
  const mape=cnt>0?(mapeSum/cnt)*100:50;
  const hitRate=cnt>0?(hits/cnt)*100:50;
  const wfAcc=Math.max(0,100-mape);

  // ── Regime detection ──────────────────────────────────────────────
  const rets=closes.slice(1).map((p,i)=>(p-closes[i])/closes[i]);
  const cVol=sd(rets.slice(-20))*Math.sqrt(252);
  const tVol=sd(rets.slice(0,-20))*Math.sqrt(252);
  const ratio=tVol>0?cVol/tVol:1;
  const regime:"NORMAL"|"SHIFTED"|"EXTREME"=
    ratio>2.5?"EXTREME":ratio>1.5?"SHIFTED":"NORMAL";

  // ── Forecast direction ────────────────────────────────────────────
  const finalW=nm.slice(nm.length-WS),finalF=fwd(finalW,W);
  const fPx=finalF.forecast.slice(0,FD).map(v=>dn(v,mn,mx));
  const curPx=closes[closes.length-1];
  // Anchor shift: align forecast to current price
  const anchorShift=curPx-dn(nm[nm.length-1],mn,mx);
  const anchoredFinal=fPx[fPx.length-1]+anchorShift;
  const fPct=curPx>0?((anchoredFinal-curPx)/curPx)*100:0;

  // ── Confidence score ──────────────────────────────────────────────
  const s1=Math.max(0,1-mape/10)*30;
  const s2=Math.max(0,(hitRate-50)/50)*25;
  const s3=converged?20:5;
  const s4=regime==="NORMAL"?15:regime==="SHIFTED"?5:0;
  const s5=Math.max(0,1-mape/20)*10;
  const pen=regime==="EXTREME"?-25:regime==="SHIFTED"?-10:0;
  const confidence=Math.min(100,Math.max(0,s1+s2+s3+s4+s5+pen));

  // ── Signal thresholds ─────────────────────────────────────────────
  const minConf=riskTier===1?20:riskTier===2?25:30;
  const minHit=riskTier===1?45:riskTier===2?48:52;
  const stayOut=riskTier===1?35:riskTier===2?38:42;

  let signal:"BUY"|"SELL"|"WAIT"|"STAY OUT"="WAIT";
  if(regime==="EXTREME"||hitRate<stayOut)                    signal="STAY OUT";
  else if(confidence>=minConf&&fPct>0&&hitRate>=minHit)      signal="BUY";
  else if(confidence>=minConf&&fPct<0&&hitRate>=minHit)      signal="SELL";

  return{
    signal,
    confidence:Math.round(confidence*10)/10,
    forecastPct:Math.round(fPct*10)/10,
    forecastDays:FD,forecastLabel:FL,
    walkForwardAccuracy:Math.round(wfAcc*10)/10,
    hitRate:Math.round(hitRate*10)/10,
    regime,converged,
  };
}

// ─── Sector + thematic bias ───────────────────────────────────────────────────

async function fetchSectorBias(fmpKey:string):Promise<Record<string,number>>{
  const bias:Record<string,number>={
    Technology:1.0,"Aerospace & Defense":1.0,Biotech:1.0,Consumer:1.0,
    "Utilities & Energy":1.0,Financials:1.0,"Fixed Income":1.0,
    "Real Assets":1.0,"Income & Dividends":1.0,"Commodities & Sectors":1.0,
    "Quantum Computing":1.0,
  };
  try{
    const r=await fetch(`https://financialmodelingprep.com/stable/sector-performance?apikey=${fmpKey}`);
    if(!r.ok){await r.text();return bias;}
    const data=await r.json();
    if(!Array.isArray(data)) return bias;
    const map:Record<string,string[]>={
      Technology:["Technology","Information Technology"],
      "Utilities & Energy":["Energy","Utilities"],
      Financials:["Financials","Financial Services"],
      Consumer:["Consumer Defensive","Consumer Cyclical"],
      Biotech:["Healthcare"],"Real Assets":["Real Estate"],
      "Commodities & Sectors":["Materials","Industrials"],
      "Aerospace & Defense":["Industrials"],
    };
    for(const item of data){
      const pct=parseFloat(item.changesPercentage||item.changePercentage||"0");
      for(const [our,fmpNames] of Object.entries(map)){
        if(fmpNames.some(n=>item.sector?.includes(n))){
          if(pct>2) bias[our]=Math.max(bias[our],2.0);
          else if(pct>1) bias[our]=Math.max(bias[our],1.5);
          else if(pct<-1) bias[our]=Math.min(bias[our],0.7);
        }
      }
    }
  }catch(e){console.error("Sector bias failed:",e);}
  return bias;
}

async function fetchThematicBias(
  supabase:ReturnType<typeof createClient>
):Promise<Record<string,number>>{
  const bias:Record<string,number>={
    Technology:1.0,"Aerospace & Defense":1.0,Biotech:1.0,Consumer:1.0,
    "Utilities & Energy":1.0,Financials:1.0,"Fixed Income":1.0,
    "Real Assets":1.0,"Income & Dividends":1.0,"Commodities & Sectors":1.0,
    "Quantum Computing":1.0,
  };
  try{
    const {data}=await supabase.from("geopolitical_sentiment")
      .select("tension_score,key_events")
      .order("created_at",{ascending:false}).limit(1);
    if(!data?.length) return bias;
    const score=Number(data[0].tension_score)||50;
    const events=(data[0].key_events||[]) as {region:string;impact:string}[];
    if(score>=60){
      bias["Aerospace & Defense"]=score>=75?2.0:1.6;
      bias["Utilities & Energy"]=score>=75?1.8:1.4;
      bias["Real Assets"]=score>=75?1.5:1.3;
      bias["Commodities & Sectors"]=1.4;
      bias["Technology"]=score>=75?0.8:0.9;
      bias["Quantum Computing"]=1.3;
    } else if(score>=30){
      bias["Aerospace & Defense"]=1.2;
      bias["Technology"]=1.1;
      bias["Utilities & Energy"]=1.1;
      bias["Quantum Computing"]=1.2;
    } else {
      bias["Technology"]=1.4;
      bias["Quantum Computing"]=1.5;
      bias["Biotech"]=1.3;
      bias["Consumer"]=1.2;
    }
    if(events.some(e=>e.region?.toLowerCase().includes("middle east")&&e.impact==="high")){
      bias["Utilities & Energy"]=Math.max(bias["Utilities & Energy"],1.8);
      bias["Real Assets"]=Math.max(bias["Real Assets"],1.4);
    }
    if(events.some(e=>(e.region?.toLowerCase().includes("europe")||
      e.region?.toLowerCase().includes("eastern"))&&e.impact==="high")){
      bias["Aerospace & Defense"]=Math.max(bias["Aerospace & Defense"],1.8);
    }
  }catch(e){console.error("Thematic bias failed:",e);}
  return bias;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

const fmtCap=(v:number)=>v>=1e12?`${(v/1e12).toFixed(1)}T`:
  v>=1e9?`${(v/1e9).toFixed(1)}B`:v>=1e6?`${(v/1e6).toFixed(0)}M`:`${v}`;

serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response(null,{headers:corsHeaders});

  try{
    const FMP_API_KEY=Deno.env.get("FMP_API_KEY");
    if(!FMP_API_KEY) throw new Error("FMP_API_KEY not configured");

    const supabase=createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Accept single profile per call
    let body:{riskProfile?:string;triggered_by?:string}={};
    try{body=await req.json();}catch{/*no body*/}
    const riskProfile=["conservative","moderate","aggressive"]
      .includes(body.riskProfile||"")? body.riskProfile!:"aggressive";
    const allowedTiers=RISK_PROFILE_TIERS[riskProfile];

    console.log(`Starting scan: profile=${riskProfile}`);

    // ── Fetch prices from DB ──────────────────────────────────────────
    const allSymbols:{symbol:string;sector:string;riskTier:number}[]=[];
    for(const [sector,syms] of Object.entries(SECTOR_UNIVERSES)){
      for(const sym of syms){
        const riskTier=RISK_TIERS[sym]??4;
        if(allowedTiers.includes(riskTier))
          allSymbols.push({symbol:sym,sector,riskTier});
      }
    }

    const allTickers=[...new Set(allSymbols.map(s=>s.symbol))];
    const oneYearAgo=new Date(Date.now()-365*24*60*60*1000).toISOString().split("T")[0];

    // Paginate — PostgREST caps responses at ~1000 rows regardless of .limit()
    const priceRows: { ticker: string; close: number }[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data: page, error } = await supabase
        .from("stock_prices").select("ticker,close")
        .in("ticker", allTickers).gte("date", oneYearAgo)
        .order("date", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) { console.error("price page error:", error.message); break; }
      if (!page || page.length === 0) break;
      priceRows.push(...page);
      if (page.length < PAGE) break;
    }
    console.log(`Fetched ${priceRows.length} price rows across ${allTickers.length} tickers`);

    const closesByTicker:Record<string,number[]>={};
    for(const row of (priceRows||[])){
      if(!closesByTicker[row.ticker]) closesByTicker[row.ticker]=[];
      closesByTicker[row.ticker].push(Number(row.close));
    }
    console.log(`DB: ${Object.keys(closesByTicker).length}/${allTickers.length} symbols with data`);

    // ── Fetch biases ──────────────────────────────────────────────────
    const [sectorBias,thematicBias]=await Promise.all([
      fetchSectorBias(FMP_API_KEY),
      fetchThematicBias(supabase),
    ]);

    // ── Step 1: Linear regression pre-filter — rank ALL symbols ─────
    const candidates:{symbol:string;sector:string;riskTier:number;
      closes:number[];combinedScore:number;breakout:boolean}[]=[];

    let noData=0, tooShort=0, noQS=0, passed=0;
    for(const {symbol,sector,riskTier} of allSymbols){
      const closes=closesByTicker[symbol];
      if(!closes){noData++;continue;}
      if(closes.length<30){tooShort++;continue;}
      const qs=quickScore(closes);
      if(!qs){noQS++;continue;}
      // Log first few symbols to diagnose
      if(passed<5||noData===0&&tooShort===0&&noQS===0)
        console.log(`  ${symbol}: ${closes.length} bars, recentRet=${qs.recentReturn.toFixed(3)}, annualRet=${qs.annualReturn.toFixed(3)}, combinedScore=${qs.combinedScore.toFixed(3)}`);
      passed++;
      candidates.push({symbol,sector,riskTier,closes,
        combinedScore:qs.combinedScore,breakout:qs.breakout});
    }
    console.log(`Pre-filter: ${passed} passed, ${noData} no-data, ${tooShort} too-short, ${noQS} no-qs → top 20 for AE`);

    // Sort by momentum × biases, take top 20 for full AE
    candidates.sort((a,b)=>{
      const biasA=(sectorBias[a.sector]??1.0)*(thematicBias[a.sector]??1.0);
      const biasB=(sectorBias[b.sector]??1.0)*(thematicBias[b.sector]??1.0);
      return(b.combinedScore*biasB)-(a.combinedScore*biasA);
    });
    const shortlist=candidates.slice(0,20);
    console.log(`Pre-filter: ${candidates.length} candidates → top ${shortlist.length} for AE`);

    // ── Step 2: Full AE scoring on top 20 candidates ─────────────────
    const buySignals:unknown[]=[];

    for(const {symbol,sector,riskTier,closes:fullCloses,breakout} of shortlist){
      // Cap to last 120 bars (~6 months) to keep AE scoring within worker CPU budget
      const closes = fullCloses.length > 120 ? fullCloses.slice(-120) : fullCloses;
      const qs=quickScore(closes);
      if(!qs) continue;

      console.log(`  AE: ${symbol} (${closes.length} bars)...`);
      const scored: ScoreResult|null=scoreStock(closes,riskTier);
      if(!scored) continue;

      console.log(`  ${symbol}: ${scored.signal} conf=${scored.confidence} hit=${scored.hitRate}% fPct=${scored.forecastPct}%`);

      if(scored.signal!=="BUY") continue;

      // Get display info from FMP
      let name=symbol,price=closes[closes.length-1],dayChange=0,marketCap=0;
      try{
        const qr=await fetch(
          `https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${FMP_API_KEY}`,
          {signal:AbortSignal.timeout(3000)}
        );
        if(qr.ok){
          const qd=await qr.json();
          if(Array.isArray(qd)&&qd.length>0){
            name=qd[0].companyName||symbol;
            price=qd[0].price||price;
            dayChange=qd[0].changes||0;
            marketCap=qd[0].mktCap||0;
          }
        } else { await qr.text(); }
      }catch{/*use defaults*/}

      buySignals.push({
        symbol,name,price,dayChange,sector,
        marketCap:fmtCap(marketCap),
        signal:scored.signal,
        confidence:scored.confidence,
        forecastPct:scored.forecastPct,
        forecastDays:scored.forecastDays,
        forecastLabel:scored.forecastLabel,
        walkForwardAccuracy:scored.walkForwardAccuracy,
        hitRate:scored.hitRate,
        regime:scored.regime,
        converged:scored.converged,
        riskTier,
        riskLabel:RISK_LABELS[riskTier]??"🔴 High Risk",
        breakout:qs.breakout&&scored.converged,
        sectorHot:(sectorBias[sector]??1.0)>=1.5,
        thematicHot:(thematicBias[sector]??1.0)>=1.5,
      });
    }

    // Sort by confidence × biases, take top 10
    (buySignals as {confidence:number;sector:string}[]).sort((a,b)=>{
      const biasA=(sectorBias[a.sector]??1.0)*(thematicBias[a.sector]??1.0);
      const biasB=(sectorBias[b.sector]??1.0)*(thematicBias[b.sector]??1.0);
      return (b.confidence*biasB)-(a.confidence*biasA);
    });
    const top10=buySignals.slice(0,10);

    console.log(`Done: ${buySignals.length} BUY signals → storing top ${top10.length}`);

    if(top10.length>0){
      await supabase.from("market_updates").insert({
        content:JSON.stringify(top10),
        ticker:null,
        signal_type:`ae_hot_v4_${riskProfile}_all`,
      });
    }

    return new Response(
      JSON.stringify({success:true,profile:riskProfile,buySignals:buySignals.length,stored:top10.length}),
      {headers:{...corsHeaders,"Content-Type":"application/json"}}
    );

  }catch(error){
    console.error("Scan error:",error);
    return new Response(
      JSON.stringify({error:error instanceof Error?error.message:"Unknown error"}),
      {status:500,headers:{...corsHeaders,"Content-Type":"application/json"}}
    );
  }
});
