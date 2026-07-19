// supabase/functions/fetch-macro-series/index.ts
// Fetches 1y daily closes for a list of macro/ETF symbols from Yahoo.
// Used by cross-sector linkage engine for OIL (USO), GOLD (GLD), US10Y (^TNX).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED = new Set(["USO", "GLD", "^TNX", "IEF", "TLT", "DXY", "^VIX"]);

type Series = { dates: string[]; closes: number[] };

async function fetchOne(symbol: string): Promise<Series | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) { await res.text(); return null; }
    const json = await res.json();
    const r = json?.chart?.result?.[0];
    const ts: number[] = r?.timestamp || [];
    const closes: (number | null)[] = r?.indicators?.quote?.[0]?.close || [];
    if (!ts.length) return null;
    const dates: string[] = [], out: number[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c == null) continue;
      dates.push(new Date(ts[i] * 1000).toISOString().split("T")[0]);
      out.push(c);
    }
    return out.length >= 60 ? { dates, closes: out } : null;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { symbols } = await req.json();
    if (!Array.isArray(symbols)) {
      return new Response(JSON.stringify({ error: "symbols[] required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const filtered = symbols.filter((s: unknown) => typeof s === "string" && ALLOWED.has(s));
    const results = await Promise.all(filtered.map(async (s) => [s, await fetchOne(s)] as const));
    const out: Record<string, Series> = {};
    const failed: string[] = [];
    for (const [s, data] of results) {
      if (data) out[s] = data; else failed.push(s);
    }
    return new Response(JSON.stringify({ series: out, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
