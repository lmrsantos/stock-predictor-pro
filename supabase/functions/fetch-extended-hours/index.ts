import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ua =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface Result {
  ticker: string;
  regularClose: number | null;
  marketState: string | null;
  pre: { price: number; time: number } | null;
  post: { price: number; time: number } | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const raw = String(body?.ticker ?? "").trim().toUpperCase();
    if (!raw) {
      return new Response(JSON.stringify({ error: "ticker required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(raw)}` +
      `?range=2d&interval=5m&includePrePost=true`;
    const res = await fetch(url, { headers: { "User-Agent": ua } });
    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `Upstream ${res.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const json = await res.json();
    const r = json?.chart?.result?.[0];
    if (!r) {
      return new Response(JSON.stringify({ error: "No extended data" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const meta = r.meta ?? {};
    const regularStart: number | null = meta.currentTradingPeriod?.regular?.start ?? null;
    const regularEnd: number | null = meta.currentTradingPeriod?.regular?.end ?? null;
    const timestamps: number[] = r.timestamp ?? [];
    const closes: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];

    let pre: { price: number; time: number } | null = null;
    let post: { price: number; time: number } | null = null;

    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      const t = timestamps[i];
      if (c == null || !isFinite(c) || regularStart == null || regularEnd == null) continue;
      // Only classify bars inside the most recent session window (+/- one day of pre/post).
      if (t < regularStart && t > regularStart - 6 * 3600) {
        pre = { price: c, time: t };
      } else if (t > regularEnd && t < regularEnd + 6 * 3600) {
        post = { price: c, time: t };
      }
    }

    // Yahoo's chart meta doesn't always carry marketState — derive it from the
    // current trading period so the client can decide PRE vs REGULAR vs POST.
    const nowSec = Math.floor(Date.now() / 1000);
    let marketState: string | null = meta.marketState ?? null;
    if (!marketState && regularStart != null && regularEnd != null) {
      if (nowSec < regularStart) marketState = "PRE";
      else if (nowSec <= regularEnd) marketState = "REGULAR";
      else marketState = "POST";
    }

    const out: Result = {
      ticker: raw,
      regularClose:
        meta.regularMarketPrice ?? meta.chartPreviousClose ?? null,
      marketState,
      pre,
      post,
    };

    return new Response(JSON.stringify(out), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
