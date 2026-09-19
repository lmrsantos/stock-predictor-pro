// moment-quotes
// Live quotes for a batch of tickers, used by Quant Moment's lists so the
// numbers on screen are the current market prices, not stored closes.
// Public (verify_jwt = false) — read-only market data, no user data touched.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ua =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface Quote {
  ticker: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
  marketState: string | null;
  extendedPrice: number | null;
  extendedLabel: string | null;
  extendedChangePct: number | null;
}

async function quoteFor(ticker: string): Promise<Quote | null> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?range=5d&interval=5m&includePrePost=true`;
  const res = await fetch(url, { headers: { "User-Agent": ua } });
  if (!res.ok) return null;
  const json = await res.json();
  const r = json?.chart?.result?.[0];
  const meta = r?.meta;
  if (!meta) return null;

  const regularStart: number | null = meta.currentTradingPeriod?.regular?.start ?? null;
  const regularEnd: number | null = meta.currentTradingPeriod?.regular?.end ?? null;
  const nowSec = Math.floor(Date.now() / 1000);

  let marketState: string | null = meta.marketState ?? null;
  if (!marketState && regularStart != null && regularEnd != null) {
    if (nowSec < regularStart) marketState = "PRE";
    else if (nowSec <= regularEnd) marketState = "REGULAR";
    else marketState = "POST";
  }

  const price: number | null =
    typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
  const previousClose: number | null =
    typeof meta.chartPreviousClose === "number"
      ? meta.chartPreviousClose
      : typeof meta.previousClose === "number"
        ? meta.previousClose
        : null;

  // Latest print outside the regular session, when there is one.
  const timestamps: number[] = r.timestamp ?? [];
  const closes: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
  let extendedPrice: number | null = null;
  const state = (marketState ?? "").toUpperCase();
  const wantsExtended = state.startsWith("PRE") || state.startsWith("POST");
  if (wantsExtended && regularStart != null && regularEnd != null) {
    for (let i = timestamps.length - 1; i >= 0; i--) {
      const c = closes[i];
      const t = timestamps[i];
      if (c == null || !isFinite(c)) continue;
      const isPre = state.startsWith("PRE");
      if (isPre ? t < regularStart && t > regularStart - 6 * 3600 : t > regularEnd) {
        extendedPrice = c;
        break;
      }
    }
  }

  const change = price != null && previousClose ? price - previousClose : null;
  const changePct =
    change != null && previousClose ? (change / previousClose) * 100 : null;
  const extendedChangePct =
    extendedPrice != null && price ? ((extendedPrice - price) / price) * 100 : null;

  return {
    ticker,
    price,
    previousClose,
    change,
    changePct,
    marketState,
    extendedPrice,
    extendedLabel: extendedPrice == null ? null : state.startsWith("PRE") ? "Pre-market" : "After hours",
    extendedChangePct,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const raw = Array.isArray(body?.tickers) ? body.tickers : [];
    const tickers = [
      ...new Set(
        raw
          .map((t: unknown) => String(t ?? "").trim().toUpperCase())
          .filter((t: string) => t.length > 0 && t.length <= 12),
      ),
    ].slice(0, 40) as string[];

    if (tickers.length === 0) {
      return new Response(JSON.stringify({ quotes: {} }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = await Promise.all(
      tickers.map((t) => quoteFor(t).catch(() => null)),
    );

    const quotes: Record<string, Quote> = {};
    for (const q of results) {
      if (q && q.price != null) quotes[q.ticker] = q;
    }

    return new Response(JSON.stringify({ quotes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
