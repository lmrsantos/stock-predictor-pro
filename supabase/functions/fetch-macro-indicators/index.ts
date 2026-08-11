// Fetches & caches macro indicators. Lightweight HTTP only.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FMP_KEY = Deno.env.get("FMP_API_KEY") ?? "";
const FRED_KEY = Deno.env.get("FRED_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// refresh intervals per indicator (ms)
const REFRESH: Record<string, number> = {
  vix: HOUR,
  us10y: HOUR,
  curve_10y2y: HOUR,
  wti: HOUR,
  gold: HOUR,
  cpi_yoy: DAY,
  fed_funds: DAY,
  cape_proxy: DAY,
};

type IndicatorRow = {
  indicator_key: string;
  value: number | null;
  previous_value: number | null;
  change_30d: number | null;
  as_of_date: string | null;
};

async function safeJson(url: string, timeoutMs = 7000): Promise<any | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) { await r.text(); return null; }
    return await r.json();
  } catch { return null; }
}

// FRED helper
async function fetchFredSeries(seriesId: string, limit = 400): Promise<{ date: string; value: number }[] | null> {
  if (!FRED_KEY) return null;
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
  const j = await safeJson(url);
  const obs = j?.observations;
  if (!Array.isArray(obs)) return null;
  const out: { date: string; value: number }[] = [];
  for (const o of obs) {
    const v = parseFloat(o.value);
    if (isFinite(v)) out.push({ date: o.date, value: v });
  }
  return out.length ? out : null;
}

async function fetchYahooQuote(symbol: string): Promise<{ price: number; date: string } | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=45d&interval=1d`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(7000), headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) { await r.text(); return null; }
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    const ts: number[] = res?.timestamp || [];
    const closes: (number | null)[] = res?.indicators?.quote?.[0]?.close || [];
    for (let i = closes.length - 1; i >= 0; i--) {
      if (closes[i] != null && isFinite(closes[i]!)) {
        return { price: closes[i]!, date: new Date(ts[i] * 1000).toISOString().split("T")[0] };
      }
    }
  } catch { /* noop */ }
  return null;
}

async function fetchYahooSeries(symbol: string): Promise<{ dates: string[]; closes: number[] } | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=90d&interval=1d`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(7000), headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) { await r.text(); return null; }
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    const ts: number[] = res?.timestamp || [];
    const closes: (number | null)[] = res?.indicators?.quote?.[0]?.close || [];
    const dates: string[] = [], cs: number[] = [];
    for (let i = 0; i < ts.length; i++) {
      if (closes[i] != null && isFinite(closes[i]!)) {
        dates.push(new Date(ts[i] * 1000).toISOString().split("T")[0]);
        cs.push(closes[i]!);
      }
    }
    return cs.length ? { dates, closes: cs } : null;
  } catch { return null; }
}

function change30d(dates: string[], closes: number[]): number | null {
  if (closes.length < 2) return null;
  const last = closes[closes.length - 1];
  // find close ~30 calendar days back
  const target = new Date(dates[dates.length - 1]);
  target.setDate(target.getDate() - 30);
  const targetTs = target.getTime();
  let idx = 0;
  for (let i = 0; i < dates.length; i++) {
    if (new Date(dates[i]).getTime() >= targetTs) { idx = i; break; }
  }
  const base = closes[idx];
  if (!base) return null;
  return ((last - base) / base) * 100;
}

// ==== individual indicator fetchers ====

async function getVix(): Promise<IndicatorRow> {
  const s = await fetchYahooSeries("^VIX");
  if (s) {
    const last = s.closes[s.closes.length - 1];
    const prev = s.closes[s.closes.length - 2] ?? null;
    return { indicator_key: "vix", value: last, previous_value: prev, change_30d: change30d(s.dates, s.closes), as_of_date: s.dates[s.dates.length - 1] };
  }
  const f = await fetchFredSeries("VIXCLS", 35);
  if (f && f.length) {
    return { indicator_key: "vix", value: f[0].value, previous_value: f[1]?.value ?? null, change_30d: null, as_of_date: f[0].date };
  }
  return { indicator_key: "vix", value: null, previous_value: null, change_30d: null, as_of_date: null };
}

// ^TNX has historically been quoted as yield * 10 (42.8 == 4.28%) but Yahoo now
// returns the yield directly. Normalize to a percent in the 0.1–25 range.
function normalizeYield(v: number | null | undefined): number | null {
  if (v == null || !isFinite(v)) return null;
  return v > 25 ? v / 10 : v;
}

async function getUs10y(): Promise<IndicatorRow> {
  const s = await fetchYahooSeries("^TNX");
  if (s) {
    const last = normalizeYield(s.closes[s.closes.length - 1]);
    const prev = normalizeYield(s.closes.length > 1 ? s.closes[s.closes.length - 2] : null);
    if (last != null) {
      return { indicator_key: "us10y", value: last, previous_value: prev, change_30d: null, as_of_date: s.dates[s.dates.length - 1] };
    }
  }
  const f = await fetchFredSeries("DGS10", 35);
  if (f && f.length) return { indicator_key: "us10y", value: f[0].value, previous_value: f[1]?.value ?? null, change_30d: null, as_of_date: f[0].date };
  return { indicator_key: "us10y", value: null, previous_value: null, change_30d: null, as_of_date: null };
}

async function getCurve10y2y(us10y: number | null): Promise<IndicatorRow> {
  // 2Y: try Yahoo ^IRX-like or FRED DGS2
  let two: number | null = null;
  let date: string | null = null;
  const s = await fetchYahooSeries("^UST2YR");
  if (s && s.closes.length) {
    two = s.closes[s.closes.length - 1];
    date = s.dates[s.dates.length - 1];
  } else {
    const f = await fetchFredSeries("DGS2", 5);
    if (f && f.length) { two = f[0].value; date = f[0].date; }
  }
  if (us10y == null || two == null) return { indicator_key: "curve_10y2y", value: null, previous_value: null, change_30d: null, as_of_date: date };
  return { indicator_key: "curve_10y2y", value: us10y - two, previous_value: null, change_30d: null, as_of_date: date };
}

async function getWti(): Promise<IndicatorRow> {
  const s = await fetchYahooSeries("CL=F");
  if (s) {
    const last = s.closes[s.closes.length - 1];
    return { indicator_key: "wti", value: last, previous_value: s.closes[s.closes.length - 2] ?? null, change_30d: change30d(s.dates, s.closes), as_of_date: s.dates[s.dates.length - 1] };
  }
  return { indicator_key: "wti", value: null, previous_value: null, change_30d: null, as_of_date: null };
}

async function getGold(): Promise<IndicatorRow> {
  const s = await fetchYahooSeries("GC=F");
  if (s) {
    const last = s.closes[s.closes.length - 1];
    return { indicator_key: "gold", value: last, previous_value: s.closes[s.closes.length - 2] ?? null, change_30d: change30d(s.dates, s.closes), as_of_date: s.dates[s.dates.length - 1] };
  }
  return { indicator_key: "gold", value: null, previous_value: null, change_30d: null, as_of_date: null };
}

async function getCpiYoy(): Promise<IndicatorRow> {
  const f = await fetchFredSeries("CPIAUCSL", 20);
  if (f && f.length >= 13) {
    const latest = f[0];
    const yearAgo = f[12];
    const yoy = ((latest.value - yearAgo.value) / yearAgo.value) * 100;
    const prevLatest = f[1];
    const prevYearAgo = f[13];
    const prevYoy = prevYearAgo ? ((prevLatest.value - prevYearAgo.value) / prevYearAgo.value) * 100 : null;
    return { indicator_key: "cpi_yoy", value: yoy, previous_value: prevYoy, change_30d: null, as_of_date: latest.date };
  }
  return { indicator_key: "cpi_yoy", value: null, previous_value: null, change_30d: null, as_of_date: null };
}

async function getFedFunds(): Promise<IndicatorRow> {
  const f = await fetchFredSeries("DFF", 40);
  if (f && f.length) return { indicator_key: "fed_funds", value: f[0].value, previous_value: f[1]?.value ?? null, change_30d: null, as_of_date: f[0].date };
  return { indicator_key: "fed_funds", value: null, previous_value: null, change_30d: null, as_of_date: null };
}

async function getCapeProxy(): Promise<IndicatorRow> {
  // Trailing 12M PE proxy for S&P 500 via FMP
  if (!FMP_KEY) return { indicator_key: "cape_proxy", value: null, previous_value: null, change_30d: null, as_of_date: null };
  const q = await safeJson(`https://financialmodelingprep.com/api/v3/quote/%5EGSPC?apikey=${FMP_KEY}`);
  const spx = Array.isArray(q) ? q[0]?.price : null;
  const pe = Array.isArray(q) ? q[0]?.pe : null;
  const asOf = new Date().toISOString().split("T")[0];
  if (typeof pe === "number" && isFinite(pe)) {
    return { indicator_key: "cape_proxy", value: pe, previous_value: null, change_30d: null, as_of_date: asOf };
  }
  if (spx && typeof spx === "number") {
    // Fallback: leave value null, we tried
  }
  return { indicator_key: "cape_proxy", value: null, previous_value: null, change_30d: null, as_of_date: asOf };
}

async function upsert(row: IndicatorRow) {
  if (row.value == null) return;
  await supabase.from("macro_indicators").upsert(
    { ...row, updated_at: new Date().toISOString() },
    { onConflict: "indicator_key" }
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Load cache
    const { data: cache } = await supabase.from("macro_indicators").select("*");
    const cacheMap = new Map<string, any>();
    (cache ?? []).forEach((r: any) => cacheMap.set(r.indicator_key, r));

    const now = Date.now();
    const isFresh = (key: string) => {
      const r = cacheMap.get(key);
      if (!r?.updated_at) return false;
      return now - new Date(r.updated_at).getTime() < (REFRESH[key] ?? HOUR);
    };

    // us10y first (needed for curve)
    let us10yRow: IndicatorRow | null = null;
    if (!isFresh("us10y")) {
      us10yRow = await getUs10y();
      await upsert(us10yRow);
    } else {
      const c = cacheMap.get("us10y");
      us10yRow = { indicator_key: "us10y", value: c.value, previous_value: c.previous_value, change_30d: c.change_30d, as_of_date: c.as_of_date };
    }

    const tasks: Promise<any>[] = [];
    if (!isFresh("vix")) tasks.push(getVix().then(upsert));
    if (!isFresh("wti")) tasks.push(getWti().then(upsert));
    if (!isFresh("gold")) tasks.push(getGold().then(upsert));
    if (!isFresh("curve_10y2y")) tasks.push(getCurve10y2y(us10yRow.value).then(upsert));
    if (!isFresh("cpi_yoy")) tasks.push(getCpiYoy().then(upsert));
    if (!isFresh("fed_funds")) tasks.push(getFedFunds().then(upsert));
    if (!isFresh("cape_proxy")) tasks.push(getCapeProxy().then(upsert));
    await Promise.all(tasks);

    const { data: fresh } = await supabase.from("macro_indicators").select("*");
    return new Response(JSON.stringify({ indicators: fresh ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
