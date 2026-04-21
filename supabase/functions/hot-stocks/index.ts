// supabase/functions/find-hot-stocks/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Autoencoder-powered hot stock screener
//
// Replaces simple linear regression scoring with evidence-based signals:
//   - Walk-forward accuracy (proven on held-out data)
//   - Direction hit rate (was up/down correct?)
//   - Regime detection (is model operating in known conditions?)
//   - Ensemble-style convergence check
//
// Only returns BUY signals, ranked by autoencoder confidence score.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Curated stock universes (unchanged) ──────────────────────────────────────
const SECTOR_UNIVERSES: Record<string, string[]> = {
  Technology: [
    "AAPL", "MSFT", "GOOGL", "META", "NVDA", "AMD", "AVGO", "CRM", "ADBE",
    "ORCL", "INTC", "CSCO", "IBM", "NOW", "QCOM", "TXN", "AMAT", "MU",
    "PANW", "SNPS",
  ],
  "Aerospace & Defense": [
    "LMT", "RTX", "BA", "NOC", "GD", "LHX", "HII", "TDG", "HWM",
    "AXON", "LDOS", "KTOS", "RKLB", "LUNR", "PLTR", "SPR", "ERJ",
    "TXT", "CW",
  ],
  Biotech: [
    "LLY", "ABBV", "JNJ", "MRK", "PFE", "AMGN", "GILD", "REGN", "VRTX",
    "BMY", "MRNA", "BIIB", "ILMN", "ISRG", "DXCM", "ALGN", "HOLX",
    "EXAS", "SGEN", "ALNY",
  ],
  Consumer: [
    "PG", "KO", "PEP", "WMT", "COST", "MCD", "NKE", "SBUX", "TGT",
    "CL", "GIS", "K", "HSY", "KMB", "CHD", "SJM", "CAG", "MKC",
    "CLX", "KHC",
  ],
  "Utilities & Energy": [
    "NEE", "DUK", "SO", "D", "AEP", "SRE", "EXC", "XEL", "WEC",
    "ES", "ED", "AWK", "ATO", "CMS", "DTE", "ETR", "FE", "PEG",
    "PPL", "CEG",
  ],
  Financials: [
    "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "BLK", "SCHW",
    "AXP", "SPGI", "ICE", "CME", "MCO", "CB", "AON", "MMC", "TFC",
    "PNC", "USB",
  ],
};

// ─── Minimal autoencoder (pure math, no deps) ─────────────────────────────────

const relu = (x: number) => Math.max(0, x);
const reluGrad = (x: number) => (x > 0 ? 1 : 0);

function mse(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length;
}

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

interface AEWeights {
  We1: number[][]; be1: number[];
  We2: number[][]; be2: number[];
  Wd1: number[][]; bd1: number[];
  Wd2: number[][]; bd2: number[];
  Wf1: number[][]; bf1: number[];
  Wf2: number[][]; bf2: number[];
}

const W_SIZE = 20; // window size
const H_SIZE = 10; // hidden
const L_SIZE = 4;  // latent
const F_SIZE = 15; // forecast days

function initAE(): AEWeights {
  return {
    We1: randMat(H_SIZE, W_SIZE), be1: zeros(H_SIZE),
    We2: randMat(L_SIZE, H_SIZE), be2: zeros(L_SIZE),
    Wd1: randMat(H_SIZE, L_SIZE), bd1: zeros(H_SIZE),
    Wd2: randMat(W_SIZE, H_SIZE), bd2: zeros(W_SIZE),
    Wf1: randMat(H_SIZE, L_SIZE), bf1: zeros(H_SIZE),
    Wf2: randMat(F_SIZE, H_SIZE), bf2: zeros(F_SIZE),
  };
}

function forward(input: number[], w: AEWeights) {
  const he1pre = affine(w.We1, w.be1, input);
  const he1 = he1pre.map(relu);
  const latent = affine(w.We2, w.be2, he1);
  const hd1pre = affine(w.Wd1, w.bd1, latent);
  const hd1 = hd1pre.map(relu);
  const recon = affine(w.Wd2, w.bd2, hd1);
  const hf1pre = affine(w.Wf1, w.bf1, latent);
  const hf1 = hf1pre.map(relu);
  const forecast = affine(w.Wf2, w.bf2, hf1);
  return { he1pre, he1, latent, hd1pre, hd1, recon, hf1pre, hf1, forecast };
}

function backward(input: number[], fwd: ReturnType<typeof forward>, w: AEWeights, lr: number): AEWeights {
  const n = input.length;
  const dRecon = fwd.recon.map((r, i) => (2 / n) * (r - input[i]));
  const dWd2 = dRecon.map((g) => fwd.hd1.map((h) => g * h));
  const dHd1 = fwd.hd1.map((_, j) => dRecon.reduce((s, g, i) => s + g * w.Wd2[i][j], 0));
  const dHd1pre = dHd1.map((g, i) => g * reluGrad(fwd.hd1pre[i]));
  const dWd1 = dHd1pre.map((g) => fwd.latent.map((l) => g * l));
  const dLatent = fwd.latent.map((_, j) => dHd1pre.reduce((s, g, i) => s + g * w.Wd1[i][j], 0));
  const dWe2 = dLatent.map((g) => fwd.he1.map((h) => g * h));
  const dHe1 = fwd.he1.map((_, j) => dLatent.reduce((s, g, i) => s + g * w.We2[i][j], 0));
  const dHe1pre = dHe1.map((g, i) => g * reluGrad(fwd.he1pre[i]));
  const dWe1 = dHe1pre.map((g) => input.map((x) => g * x));
  const upd = (M: number[][], dM: number[][]) => M.map((r, i) => r.map((v, j) => v - lr * dM[i][j]));
  const updV = (b: number[], db: number[]) => b.map((v, i) => v - lr * db[i]);
  return {
    We1: upd(w.We1, dWe1), be1: updV(w.be1, dHe1pre),
    We2: upd(w.We2, dWe2), be2: updV(w.be2, dLatent),
    Wd1: upd(w.Wd1, dWd1), bd1: updV(w.bd1, dHd1pre),
    Wd2: upd(w.Wd2, dWd2), bd2: updV(w.bd2, dRecon),
    Wf1: w.Wf1, bf1: w.bf1, Wf2: w.Wf2, bf2: w.bf2,
  };
}

function trainForecaster(windows: number[][], targets: number[][], w: AEWeights, lr: number): AEWeights {
  let wt = { ...w };
  for (let e = 0; e < 50; e++) {
    for (let i = 0; i < windows.length; i++) {
      const fwd = forward(windows[i], wt);
      const dF = fwd.forecast.map((f, j) => (2 / F_SIZE) * (f - targets[i][j]));
      const dWf2 = dF.map((g) => fwd.hf1.map((h) => g * h));
      const dHf1 = fwd.hf1.map((_, j) => dF.reduce((s, g, i) => s + g * wt.Wf2[i][j], 0));
      const dHf1pre = dHf1.map((g, i) => g * reluGrad(fwd.hf1pre[i]));
      const dWf1 = dHf1pre.map((g) => fwd.latent.map((l) => g * l));
      wt = {
        ...wt,
        Wf1: wt.Wf1.map((r, i) => r.map((v, j) => v - lr * dWf1[i][j])),
        bf1: wt.bf1.map((v, i) => v - lr * dHf1pre[i]),
        Wf2: wt.Wf2.map((r, i) => r.map((v, j) => v - lr * dWf2[i][j])),
        bf2: wt.bf2.map((v, i) => v - lr * dF[i]),
      };
    }
  }
  return wt;
}

// ─── Core: score one stock with autoencoder ───────────────────────────────────

interface StockSignal {
  symbol: string;
  name: string;
  price: number;
  dayChange: number;
  sector: string;
  marketCap: string;
  signal: "BUY" | "SELL" | "WAIT" | "STAY OUT";
  confidence: number;
  forecastPct: number;     // projected % move over F_SIZE days
  walkForwardAccuracy: number;
  hitRate: number;
  regime: "NORMAL" | "SHIFTED" | "EXTREME";
  converged: boolean;
}

function normalize(prices: number[]) {
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  return { norm: prices.map((p) => (p - min) / range), min, max };
}

const denorm = (v: number, min: number, max: number) => v * (max - min) + min;

function mean(arr: number[]) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function std(arr: number[]) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function scoreStock(closes: number[], symbol: string): {
  signal: "BUY" | "SELL" | "WAIT" | "STAY OUT";
  confidence: number;
  forecastPct: number;
  walkForwardAccuracy: number;
  hitRate: number;
  regime: "NORMAL" | "SHIFTED" | "EXTREME";
  converged: boolean;
} | null {
  if (closes.length < W_SIZE + F_SIZE + 30) return null;

  const HOLD_OUT = 20; // walk-forward held-out days

  // ── Normalize ────────────────────────────────────────────────────
  const { norm, min, max } = normalize(closes);

  // ── Build sliding windows ─────────────────────────────────────────
  const windows: number[][] = [];
  for (let i = 0; i + W_SIZE <= norm.length; i++) {
    windows.push(norm.slice(i, i + W_SIZE));
  }

  // ── Train autoencoder (unsupervised, 100 epochs) ──────────────────
  let W = initAE();
  const actualCurrentNorm = norm[norm.length - 1];
  let converged = false;
  let lr = 0.001;

  for (let epoch = 0; epoch < 100; epoch++) {
    const shuffled = [...windows].sort(() => Math.random() - 0.5);
    for (const win of shuffled) {
      const fwd = forward(win, W);
      W = backward(win, fwd, W, lr);
    }
    // Check convergence on last window
    const lastWin = norm.slice(norm.length - W_SIZE);
    const fwd = forward(lastWin, W);
    const reconEnd = fwd.recon[fwd.recon.length - 1];
    const err = Math.abs((reconEnd - actualCurrentNorm) / (actualCurrentNorm || 1)) * 100;
    if (err < 1.0 && epoch > 15) { converged = true; break; }
    if (epoch === 50) lr *= 0.5;
  }

  // ── Train forecaster head ─────────────────────────────────────────
  const fwWins: number[][] = [];
  const fwTgts: number[][] = [];
  for (let i = 0; i + W_SIZE + F_SIZE <= norm.length; i++) {
    fwWins.push(norm.slice(i, i + W_SIZE));
    fwTgts.push(norm.slice(i + W_SIZE, i + W_SIZE + F_SIZE));
  }
  if (fwWins.length > 0) W = trainForecaster(fwWins, fwTgts, W, 0.0005);

  // ── Walk-forward validation ───────────────────────────────────────
  const trainCloses = closes.slice(0, closes.length - HOLD_OUT);
  const heldOut = closes.slice(closes.length - HOLD_OUT);
  const { norm: trainNorm, min: tMin, max: tMax } = normalize(trainCloses);

  // Train a second AE on train-only slice
  let Wval = initAE();
  const valWindows: number[][] = [];
  for (let i = 0; i + W_SIZE <= trainNorm.length; i++) {
    valWindows.push(trainNorm.slice(i, i + W_SIZE));
  }
  for (let epoch = 0; epoch < 80; epoch++) {
    const shuffled = [...valWindows].sort(() => Math.random() - 0.5);
    for (const win of shuffled) {
      const fwd = forward(win, Wval);
      Wval = backward(win, fwd, Wval, 0.001);
    }
  }
  // Train its forecaster
  const valFwWins: number[][] = [];
  const valFwTgts: number[][] = [];
  const heldNorm = heldOut.map((p) => (p - tMin) / (tMax - tMin));
  for (let i = 0; i + W_SIZE + HOLD_OUT <= trainNorm.length; i++) {
    valFwWins.push(trainNorm.slice(i, i + W_SIZE));
    valFwTgts.push(trainNorm.slice(i + W_SIZE, i + W_SIZE + HOLD_OUT));
  }
  if (valFwWins.length > 0) Wval = trainForecaster(valFwWins, valFwTgts, Wval, 0.0005);

  const lastTrainWin = trainNorm.slice(trainNorm.length - W_SIZE);
  const valFwd = forward(lastTrainWin, Wval);
  const predictedNorm = valFwd.forecast.slice(0, HOLD_OUT);
  const predictedPrices = predictedNorm.map((v) => denorm(v, tMin, tMax));

  // MAPE + hit rate on held-out
  let mapeSum = 0;
  let hits = 0;
  const lastTrainPrice = trainCloses[trainCloses.length - 1];
  for (let i = 0; i < Math.min(predictedPrices.length, heldOut.length); i++) {
    mapeSum += Math.abs((predictedPrices[i] - heldOut[i]) / heldOut[i]);
    const predDir = predictedPrices[i] > (i === 0 ? lastTrainPrice : predictedPrices[i - 1]);
    const actDir = heldOut[i] > (i === 0 ? lastTrainPrice : heldOut[i - 1]);
    if (predDir === actDir) hits++;
  }
  const n = Math.min(predictedPrices.length, heldOut.length);
  const mape = n > 0 ? (mapeSum / n) * 100 : 50;
  const hitRate = n > 0 ? (hits / n) * 100 : 50;
  const walkForwardAccuracy = Math.max(0, 100 - mape);

  // ── Regime detection ──────────────────────────────────────────────
  const prices = closes;
  const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
  const currentVol = std(returns.slice(-20)) * Math.sqrt(252);
  const trainingVol = std(returns.slice(0, -20)) * Math.sqrt(252);
  const volRatio = trainingVol > 0 ? currentVol / trainingVol : 1;
  const regime: "NORMAL" | "SHIFTED" | "EXTREME" =
    volRatio > 2.5 ? "EXTREME" : volRatio > 1.5 ? "SHIFTED" : "NORMAL";

  // ── Forecast direction ────────────────────────────────────────────
  const lastWin = norm.slice(norm.length - W_SIZE);
  const finalFwd = forward(lastWin, W);
  const forecastedPrices = finalFwd.forecast.map((v) => denorm(v, min, max));
  const currentPrice = closes[closes.length - 1];
  const forecastEnd = forecastedPrices[forecastedPrices.length - 1];
  const forecastPct = ((forecastEnd - currentPrice) / currentPrice) * 100;
  const forecastUp = forecastPct > 0;

  // ── Evidence-based confidence score ──────────────────────────────
  const s1 = Math.max(0, 1 - mape / 10) * 30;           // walk-forward accuracy
  const s2 = Math.max(0, (hitRate - 50) / 50) * 20;     // direction hit rate
  const s3 = converged ? 15 : 0;                         // convergence
  const s4 = regime === "NORMAL" ? 15 : regime === "SHIFTED" ? 5 : 0; // regime
  const s5 = Math.max(0, 1 - mape / 20) * 20;           // MAPE quality
  const regimePenalty = regime === "EXTREME" ? -25 : regime === "SHIFTED" ? -10 : 0;
  const confidence = Math.min(100, Math.max(0, s1 + s2 + s3 + s4 + s5 + regimePenalty));

  // ── Decision logic (same matrix as BacktestModal) ─────────────────
  let signal: "BUY" | "SELL" | "WAIT" | "STAY OUT" = "WAIT";

  if (regime === "EXTREME" || hitRate < 50) {
    signal = "STAY OUT";
  } else if (confidence >= 50 && forecastUp && hitRate >= 55) {
    signal = "BUY";
  } else if (confidence >= 50 && !forecastUp && hitRate >= 55) {
    signal = "SELL";
  } else {
    signal = "WAIT";
  }

  return { signal, confidence, forecastPct, walkForwardAccuracy, hitRate, regime, converged };
}

function formatMktCap(v: number): string {
  if (v >= 1e12) return `${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9)  return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6)  return `${(v / 1e6).toFixed(0)}M`;
  return `${v}`;
}

// ─── Edge function handler ────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FMP_API_KEY = Deno.env.get("FMP_API_KEY");
    if (!FMP_API_KEY) throw new Error("FMP_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse filters
    let sectorFilter: string | null = null;
    let topN = 5;
    try {
      const body = await req.json();
      sectorFilter = body.sector || null;
      if (body.limit) topN = Math.min(body.limit, 20);
    } catch { /* no body */ }

    const cacheKey = sectorFilter
      ? `ae_hot_stocks_v1_${sectorFilter}`
      : "ae_hot_stocks_v1_all";

    // Check cache (30 min)
    const cacheWindow = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: cached } = await supabase
      .from("market_updates")
      .select("content, created_at")
      .eq("signal_type", cacheKey)
      .gte("created_at", cacheWindow)
      .order("created_at", { ascending: false })
      .limit(1);

    if (cached && cached.length > 0) {
      try {
        const parsed = JSON.parse(cached[0].content);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return new Response(
            JSON.stringify({ stocks: parsed, cached: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch { /* fall through */ }
    }

    // ── Build candidate list ──────────────────────────────────────────
    const sectorsToScan = sectorFilter
      ? { [sectorFilter]: SECTOR_UNIVERSES[sectorFilter] || [] }
      : SECTOR_UNIVERSES;

    const allSymbols: Array<{ symbol: string; sector: string }> = [];
    for (const [sector, symbols] of Object.entries(sectorsToScan)) {
      for (const sym of symbols) allSymbols.push({ symbol: sym, sector });
    }

    console.log(`AE screener: scanning ${allSymbols.length} stocks`);

    // ── Score each stock ──────────────────────────────────────────────
    const results: StockSignal[] = [];
    const batchSize = 3; // smaller batches — AE is heavier than simple regression

    for (let i = 0; i < allSymbols.length; i += batchSize) {
      const batch = allSymbols.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map(async ({ symbol, sector }) => {
          // 1. Get price history
          let closes: number[] = [];

          const { data: dbPrices } = await supabase
            .from("stock_prices")
            .select("close")
            .eq("ticker", symbol)
            .order("date", { ascending: true })
            .limit(260); // ~1 year

          if (dbPrices && dbPrices.length >= 60) {
            closes = dbPrices.map((p: { close: number }) => Number(p.close));
          } else {
            // Fallback: fetch from FMP
            const res = await fetch(
              `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&apikey=${FMP_API_KEY}`
            );
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data) && data.length >= 60) {
                closes = data.slice(0, 252).reverse().map((d: { close: number }) => d.close);
              }
            } else { await res.text(); }
          }

          if (closes.length < W_SIZE + F_SIZE + 30) return null;

          // 2. Run autoencoder scoring
          const scored = scoreStock(closes, symbol);
          if (!scored) return null;

          // 3. Only keep BUY signals
          if (scored.signal !== "BUY") return null;

          // 4. Get quote for display info
          let name = symbol;
          let price = closes[closes.length - 1];
          let dayChange = 0;
          let marketCap = 0;

          try {
            const qRes = await fetch(
              `https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${FMP_API_KEY}`
            );
            if (qRes.ok) {
              const qData = await qRes.json();
              if (Array.isArray(qData) && qData.length > 0) {
                const q = qData[0];
                name = q.companyName || symbol;
                price = q.price || price;
                dayChange = q.changes || 0;
                marketCap = q.mktCap || 0;
              }
            } else { await qRes.text(); }
          } catch { /* skip */ }

          return {
            symbol,
            name,
            price,
            dayChange,
            sector,
            marketCap: formatMktCap(marketCap),
            signal: scored.signal,
            confidence: Math.round(scored.confidence * 10) / 10,
            forecastPct: Math.round(scored.forecastPct * 10) / 10,
            walkForwardAccuracy: Math.round(scored.walkForwardAccuracy * 10) / 10,
            hitRate: Math.round(scored.hitRate * 10) / 10,
            regime: scored.regime,
            converged: scored.converged,
          } as StockSignal;
        })
      );

      for (const r of batchResults) {
        if (r.status === "fulfilled" && r.value) results.push(r.value);
      }
    }

    // ── Rank by confidence, return top N BUY signals ──────────────────
    results.sort((a, b) => b.confidence - a.confidence);
    const topResults = results.slice(0, topN);

    console.log(`AE screener: ${results.length} BUY signals found, returning top ${topResults.length}`);

    // Cache result
    if (topResults.length > 0) {
      await supabase.from("market_updates").insert({
        content: JSON.stringify(topResults),
        ticker: null,
        signal_type: cacheKey,
      });
    }

    return new Response(
      JSON.stringify({
        stocks: topResults,
        cached: false,
        totalBuySignals: results.length,
        sectorsScanned: Object.keys(sectorsToScan),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("AE screener error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : null
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
