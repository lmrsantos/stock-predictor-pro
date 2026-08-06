// fetch-symbol-metadata
// ─────────────────────────────────────────────────────────────────────────────
// Real listing (IPO) dates for symbols, from FMP's company profile endpoint.
//
// Listing age must never be inferred from how much price history we happen to
// store. This function reads FMP's `ipoDate` and caches it in
// public.symbol_metadata. ipoDate never changes for an existing listing, so the
// cache is only refreshed monthly.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const REFRESH_DAYS = 30;
const MAX_TICKERS = 400;
/** FMP profile calls issued per invocation — keeps latency and quota bounded. */
const MAX_FETCHES = 40;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const raw = Array.isArray(body?.tickers) ? body.tickers : [];
    const tickers = [...new Set(
      raw.filter((t: unknown) => typeof t === "string" && t.length > 0 && t.length <= 12)
         .map((t: string) => t.toUpperCase()),
    )].slice(0, MAX_TICKERS) as string[];

    if (tickers.length === 0) {
      return new Response(JSON.stringify({ error: "tickers must be a non-empty string array" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cachedRows } = await supabase
      .from("symbol_metadata")
      .select("ticker, ipo_date, updated_at")
      .in("ticker", tickers);

    const out: Record<string, string | null> = {};
    const fresh = new Set<string>();
    const cutoff = Date.now() - REFRESH_DAYS * 24 * 3600 * 1000;

    for (const row of cachedRows ?? []) {
      out[row.ticker] = row.ipo_date ?? null;
      // A known ipo_date never changes; only re-check rows that are stale AND unknown.
      if (row.ipo_date || new Date(row.updated_at).getTime() > cutoff) fresh.add(row.ticker);
    }

    const stale = tickers.filter(t => !fresh.has(t)).slice(0, MAX_FETCHES);
    const fmpKey = Deno.env.get("FMP_API_KEY");

    if (fmpKey && stale.length) {
      const upserts: { ticker: string; ipo_date: string | null; updated_at: string }[] = [];
      const CONC = 5;
      for (let i = 0; i < stale.length; i += CONC) {
        const batch = stale.slice(i, i + CONC);
        const settled = await Promise.allSettled(batch.map(async (ticker) => {
          const url = `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(ticker)}&apikey=${fmpKey}`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`FMP ${res.status}`);
          const json = await res.json();
          const p = Array.isArray(json) ? json[0] ?? {} : json ?? {};
          const ipo = typeof p.ipoDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.ipoDate)
            ? p.ipoDate : null;
          return { ticker, ipo };
        }));
        for (const r of settled) {
          if (r.status !== "fulfilled") continue;
          out[r.value.ticker] = r.value.ipo;
          upserts.push({
            ticker: r.value.ticker,
            ipo_date: r.value.ipo,
            updated_at: new Date().toISOString(),
          });
        }
      }
      if (upserts.length) {
        await supabase.from("symbol_metadata").upsert(upserts, { onConflict: "ticker" });
      }
    }

    return new Response(JSON.stringify({ ipoDates: out, resolved: Object.keys(out).length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
