// fetch-financials
// ─────────────────────────────────────────────────────────────────────────────
// Returns audited financial-statement facts for one symbol, pulled live from
// FMP stable endpoints. Nothing here is estimated or inferred: a field that the
// provider does not return comes back as null, and the caller reports it as
// unavailable.
//
// Response shape (all numbers already in reporting currency / plain ratios):
// {
//   symbol, fiscalDate, period, currency, source,
//   revenueGrowthYoY, revenueGrowth3yCagr,
//   grossMargin, operatingMargin, netMargin, marginTrend,
//   roe, roa, freeCashFlow, fcfPositiveYears,
//   debtToEquity, netDebtToEbitda, currentRatio,
//   sharesOutstanding, sharesChangeYoY,
//   evToEbitda, priceToSales, priceToBook, avgVolume, beta, marketCap
// }
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const n = (v: unknown): number | null => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

const ratio = (a: number | null, b: number | null): number | null =>
  a != null && b != null && b !== 0 ? a / b : null;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Sequential + 429-aware: the provider rate-limits parallel bursts. */
async function fmp(path: string, key: string, attempt = 0): Promise<any[]> {
  const url = `https://financialmodelingprep.com/stable/${path}${path.includes("?") ? "&" : "?"}apikey=${key}`;
  try {
    const res = await fetch(url);
    if (res.status === 429 && attempt < 3) {
      await sleep(1200 * (attempt + 1));
      return fmp(path, key, attempt + 1);
    }
    if (!res.ok) {
      console.warn("FMP", path, res.status);
      return [];
    }
    const j = await res.json();
    return Array.isArray(j) ? j : j ? [j] : [];
  } catch (e) {
    console.warn("FMP failed", path, e);
    return [];
  }
}


const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function yahooCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  try {
    const cookieRes = await fetch("https://fc.yahoo.com/", { headers: { "User-Agent": UA }, redirect: "manual" });
    const cookie = (cookieRes.headers.getSetCookie?.() || []).map(c => c.split(";")[0]).join("; ");
    await cookieRes.text().catch(() => {});
    if (!cookie) return null;
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, Cookie: cookie },
    });
    if (!crumbRes.ok) return null;
    const crumb = await crumbRes.text();
    if (!crumb || crumb.includes("<")) return null;
    return { crumb, cookie };
  } catch {
    return null;
  }
}

const yv = (o: unknown): number | null => {
  if (o == null) return null;
  if (typeof o === "number") return Number.isFinite(o) ? o : null;
  const raw = (o as { raw?: unknown }).raw;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
};

/** Fallback: Yahoo quoteSummary reported statements + key ratios. */
async function yahooFinancials(symbol: string): Promise<Record<string, unknown> | null> {
  const auth = await yahooCrumb();
  if (!auth) return null;
  const modules = [
    "financialData", "defaultKeyStatistics", "summaryDetail", "price",
    "incomeStatementHistory", "balanceSheetHistory", "cashflowStatementHistory",
  ].join("%2C");
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(auth.crumb)}`;
  let j: any;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: auth.cookie } });
    if (!res.ok) {
      console.warn("Yahoo quoteSummary", res.status);
      return null;
    }
    j = await res.json();
  } catch (e) {
    console.warn("Yahoo quoteSummary failed", e);
    return null;
  }

  const r = j?.quoteSummary?.result?.[0];
  if (!r) return null;
  const fd = r.financialData ?? {}, ks = r.defaultKeyStatistics ?? {}, sd = r.summaryDetail ?? {};
  const inc = r.incomeStatementHistory?.incomeStatementHistory ?? [];
  const bs  = r.balanceSheetHistory?.balanceSheetStatements ?? [];
  const cf  = r.cashflowStatementHistory?.cashflowStatements ?? [];
  const i0 = inc[0] ?? {}, i1 = inc[1] ?? {}, i3 = inc[3] ?? {};
  const b0 = bs[0] ?? {};

  const rev0 = yv(i0.totalRevenue) ?? yv(fd.totalRevenue);
  const rev1 = yv(i1.totalRevenue);
  const rev3 = yv(i3.totalRevenue);
  const netMargin = yv(fd.profitMargins) != null ? yv(fd.profitMargins)! * 100
    : rev0 && yv(i0.netIncome) != null ? (yv(i0.netIncome)! / rev0) * 100 : null;
  const prevNetMargin = rev1 && yv(i1.netIncome) != null ? (yv(i1.netIncome)! / rev1) * 100 : null;

  const fcfYears = cf.map((c: any) => {
    const op = yv(c.totalCashFromOperatingActivities);
    const capex = yv(c.capitalExpenditures) ?? 0;
    return op == null ? null : op + capex; // capex is reported negative
  }).filter((x: number | null) => x != null) as number[];

  const marketCap = yv(sd.marketCap) ?? yv(r.price?.marketCap);
  const equity = yv(b0.totalStockholderEquity);
  const d2e = yv(fd.debtToEquity);

  return {
    symbol,
    fiscalDate: i0.endDate ? new Date(yv(i0.endDate)! * 1000).toISOString().slice(0, 10) : null,
    period: "FY",
    currency: fd.financialCurrency ?? "USD",
    source: "Yahoo Finance — reported statements",
    revenueGrowthYoY: yv(fd.revenueGrowth) != null ? yv(fd.revenueGrowth)! * 100
      : rev0 && rev1 ? (rev0 / rev1 - 1) * 100 : null,
    revenueGrowth3yCagr: rev0 && rev3 && rev3 > 0 ? (Math.pow(rev0 / rev3, 1 / 3) - 1) * 100 : null,
    grossMargin: yv(fd.grossMargins) != null ? yv(fd.grossMargins)! * 100 : null,
    operatingMargin: yv(fd.operatingMargins) != null ? yv(fd.operatingMargins)! * 100 : null,
    netMargin,
    marginTrend: netMargin != null && prevNetMargin != null ? netMargin - prevNetMargin : null,
    roe: yv(fd.returnOnEquity) != null ? yv(fd.returnOnEquity)! * 100 : null,
    roa: yv(fd.returnOnAssets) != null ? yv(fd.returnOnAssets)! * 100 : null,
    freeCashFlow: yv(fd.freeCashflow) ?? (fcfYears.length ? fcfYears[0] : null),
    fcfPositiveYears: fcfYears.filter(x => x > 0).length,
    fcfYearsChecked: fcfYears.length,
    // Yahoo reports debt/equity as a percentage.
    debtToEquity: d2e != null ? d2e / 100 : null,
    netDebtToEbitda: (() => {
      const debt = yv(fd.totalDebt), cashAmt = yv(fd.totalCash), ebitda = yv(fd.ebitda);
      return debt != null && ebitda ? (debt - (cashAmt ?? 0)) / ebitda : null;
    })(),
    currentRatio: yv(fd.currentRatio),
    sharesOutstanding: yv(ks.sharesOutstanding) ?? yv(r.price?.sharesOutstanding),
    sharesChangeYoY: (() => {
      const now = yv(ks.sharesOutstanding);
      const prior = yv(ks.priorSharesOutstanding);
      return now != null && prior ? (now / prior - 1) * 100 : null;
    })(),
    evToEbitda: yv(ks.enterpriseToEbitda),
    priceToSales: yv(sd.priceToSalesTrailing12Months) ?? (marketCap && rev0 ? marketCap / rev0 : null),
    priceToBook: yv(ks.priceToBook) ?? (marketCap && equity ? marketCap / equity : null),
    avgVolume: yv(sd.averageVolume) ?? yv(sd.averageDailyVolume10Day),
    beta: yv(sd.beta) ?? yv(ks.beta),
    marketCap,
  };
}

serve(async (req) => {

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker } = await req.json();
    const symbol = String(ticker ?? "").trim().toUpperCase();
    if (!symbol || symbol.length > 15) {
      return new Response(JSON.stringify({ error: "Invalid ticker" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const key = Deno.env.get("FMP_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ error: "Financial-statement provider is not configured" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const income  = await fmp(`income-statement?symbol=${symbol}&limit=5`, key);
    const balance = await fmp(`balance-sheet-statement?symbol=${symbol}&limit=5`, key);
    const cash    = await fmp(`cash-flow-statement?symbol=${symbol}&limit=5`, key);
    const ratios  = await fmp(`ratios?symbol=${symbol}&limit=2`, key);
    const metrics = await fmp(`key-metrics?symbol=${symbol}&limit=2`, key);
    const quote   = await fmp(`quote?symbol=${symbol}`, key);
    const profile = await fmp(`profile?symbol=${symbol}`, key);


    if (!income.length && !balance.length && !ratios.length) {
      // Primary provider unavailable (plan limit, delisted, or unsupported
      // symbol) — fall back to Yahoo's reported statements.
      const yahoo = await yahooFinancials(symbol);
      if (yahoo) {
        return new Response(JSON.stringify(yahoo), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "No financial statements available for this symbol", code: "NO_FINANCIALS" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const i0 = income[0] ?? {}, i1 = income[1] ?? {}, i3 = income[3] ?? {};
    const b0 = balance[0] ?? {}, b1 = balance[1] ?? {};
    const c0 = cash[0] ?? {};
    const r0 = ratios[0] ?? {}, r1 = ratios[1] ?? {};
    const m0 = metrics[0] ?? {};
    const q0 = quote[0] ?? {};
    const p0 = profile[0] ?? {};

    const rev0 = n(i0.revenue), rev1 = n(i1.revenue), rev3 = n(i3.revenue);
    const revenueGrowthYoY = rev0 != null && rev1 != null && rev1 > 0 ? (rev0 / rev1 - 1) * 100 : null;
    const revenueGrowth3yCagr =
      rev0 != null && rev3 != null && rev3 > 0 ? (Math.pow(rev0 / rev3, 1 / 3) - 1) * 100 : null;

    const grossMargin = n(r0.grossProfitMargin) != null
      ? n(r0.grossProfitMargin)! * 100
      : ratio(n(i0.grossProfit), rev0) != null ? ratio(n(i0.grossProfit), rev0)! * 100 : null;
    const operatingMargin = n(r0.operatingProfitMargin) != null
      ? n(r0.operatingProfitMargin)! * 100
      : ratio(n(i0.operatingIncome), rev0) != null ? ratio(n(i0.operatingIncome), rev0)! * 100 : null;
    const netMargin = n(r0.netProfitMargin) != null
      ? n(r0.netProfitMargin)! * 100
      : ratio(n(i0.netIncome), rev0) != null ? ratio(n(i0.netIncome), rev0)! * 100 : null;
    const prevNetMargin = n(r1.netProfitMargin) != null
      ? n(r1.netProfitMargin)! * 100
      : ratio(n(i1.netIncome), rev1) != null ? ratio(n(i1.netIncome), rev1)! * 100 : null;
    const marginTrend =
      netMargin != null && prevNetMargin != null ? netMargin - prevNetMargin : null;

    const roe = n(r0.returnOnEquity) != null ? n(r0.returnOnEquity)! * 100 : null;
    const roa = n(r0.returnOnAssets) != null ? n(r0.returnOnAssets)! * 100 : null;

    const freeCashFlow = n(c0.freeCashFlow);
    const fcfPositiveYears = cash.filter(r => (n(r.freeCashFlow) ?? -1) > 0).length;

    const totalDebt = n(b0.totalDebt);
    const equity = n(b0.totalStockholdersEquity);
    const debtToEquity = n(r0.debtToEquityRatio) ?? ratio(totalDebt, equity);
    const ebitda = n(i0.ebitda);
    const netDebt = totalDebt != null ? totalDebt - (n(b0.cashAndShortTermInvestments) ?? 0) : null;
    const netDebtToEbitda = ratio(netDebt, ebitda);
    const currentRatio = n(r0.currentRatio) ??
      ratio(n(b0.totalCurrentAssets), n(b0.totalCurrentLiabilities));

    const sh0 = n(i0.weightedAverageShsOutDil) ?? n(b0.commonStock);
    const sh1 = n(i1.weightedAverageShsOutDil) ?? n(b1.commonStock);
    const sharesChangeYoY = sh0 != null && sh1 != null && sh1 > 0 ? (sh0 / sh1 - 1) * 100 : null;

    const marketCap = n(q0.marketCap) ?? n(m0.marketCap);
    const evToEbitda = n(m0.evToEBITDA) ?? n(m0.enterpriseValueOverEBITDA) ??
      (marketCap != null && netDebt != null ? ratio(marketCap + netDebt, ebitda) : null);
    const priceToSales = n(r0.priceToSalesRatio) ?? ratio(marketCap, rev0);
    const priceToBook = n(r0.priceToBookRatio) ?? ratio(marketCap, equity);

    return new Response(JSON.stringify({
      symbol,
      fiscalDate: i0.date ?? b0.date ?? c0.date ?? null,
      period: i0.period ?? "FY",
      currency: i0.reportedCurrency ?? p0.currency ?? "USD",
      source: "Financial Modeling Prep — reported statements",
      revenueGrowthYoY, revenueGrowth3yCagr,
      grossMargin, operatingMargin, netMargin, marginTrend,
      roe, roa,
      freeCashFlow, fcfPositiveYears, fcfYearsChecked: cash.length,
      debtToEquity, netDebtToEbitda, currentRatio,
      sharesOutstanding: sh0, sharesChangeYoY,
      evToEbitda, priceToSales, priceToBook,
      avgVolume: n(q0.avgVolume) ?? n(p0.averageVolume),
      beta: n(p0.beta),
      marketCap,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("fetch-financials error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
