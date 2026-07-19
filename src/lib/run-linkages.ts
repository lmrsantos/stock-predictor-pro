// src/lib/run-linkages.ts
// Orchestrates the full cross-sector linkage test:
//   1. Fetch 1y closes for every ticker in the 13 curated sectors (via sector-backtest fn)
//   2. Fetch macro proxies USO/GLD/^TNX (via fetch-macro-series fn)
//   3. Build sector composites + macro return series + risk-appetite spread
//   4. Run Granger-style lag tests (LINKAGE_MAP), BH-correct, split-half validate
//   5. Cache in localStorage (24h) and push a compact summary to the server cache
//
// Browser-side. Total compute is small (<1s after fetch).

import { supabase } from "@/integrations/supabase/client";
import {
  CURATED_SECTOR_UNIVERSES, SECTOR_NAMES, SectorName,
} from "@/lib/sector-universes";
import {
  PriceBar, ReturnSeries, LinkageResult, LeaderName,
  buildSectorComposites, buildRiskAppetiteRatio, runLinkageTests,
  toLogReturns, linkagesToAgentContext,
} from "@/lib/cross-sector-linkages";

const CACHE_KEY = "qf.linkages.v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface RunProgress {
  stage: "sectors" | "macro" | "compute" | "cache" | "done";
  message: string;
  done?: number;
  total?: number;
}

export interface LinkagePayload {
  results: LinkageResult[];
  agentContext: string;       // JSON string ready for QuantAgent prompt
  updatedAt: string;
  sectorsFetched: string[];
  macroFetched: string[];
  sectorsFailed: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch layer
// ─────────────────────────────────────────────────────────────────────────────

async function fetchSector(sector: SectorName) {
  const { data, error } = await supabase.functions.invoke("sector-backtest", {
    body: { sector, source: "curated", maxTickers: 50 },
  });
  if (error) throw new Error(`${sector}: ${error.message}`);
  if (data?.error) throw new Error(`${sector}: ${data.error}`);
  return data as {
    sector: string;
    prices: Record<string, { dates: string[]; closes: number[] }>;
  };
}

async function fetchMacro() {
  const { data, error } = await supabase.functions.invoke("fetch-macro-series", {
    body: { symbols: ["USO", "GLD", "^TNX"] },
  });
  if (error) throw new Error(`macro: ${error.message}`);
  if (data?.error) throw new Error(`macro: ${data.error}`);
  return data as {
    series: Record<string, { dates: string[]; closes: number[] }>;
    failed: string[];
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main runner
// ─────────────────────────────────────────────────────────────────────────────

export async function runLinkages(
  onProgress?: (p: RunProgress) => void,
): Promise<LinkagePayload> {
  const bars: PriceBar[] = [];
  const sectorsFetched: string[] = [];
  const sectorsFailed: string[] = [];

  // Fetch sectors with concurrency = 3
  const CONC = 3;
  for (let i = 0; i < SECTOR_NAMES.length; i += CONC) {
    const batch = SECTOR_NAMES.slice(i, i + CONC);
    onProgress?.({
      stage: "sectors",
      message: `Fetching ${batch.join(", ")}…`,
      done: i, total: SECTOR_NAMES.length,
    });
    const results = await Promise.allSettled(batch.map((s) => fetchSector(s)));
    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      const s = batch[j];
      if (r.status === "fulfilled") {
        sectorsFetched.push(s);
        for (const [sym, series] of Object.entries(r.value.prices)) {
          for (let k = 0; k < series.dates.length; k++) {
            bars.push({ symbol: sym, date: series.dates[k], close: series.closes[k] });
          }
        }
      } else {
        sectorsFailed.push(s);
        console.warn("linkage sector fetch failed", s, r.reason);
      }
    }
  }

  onProgress?.({ stage: "macro", message: "Fetching macro proxies (USO, GLD, ^TNX)…" });
  const macro = await fetchMacro().catch((e) => {
    console.warn("macro fetch failed", e);
    return { series: {}, failed: ["USO", "GLD", "^TNX"] };
  });

  onProgress?.({ stage: "compute", message: "Building composites & running lag tests…" });

  const { composites } = buildSectorComposites(
    bars,
    CURATED_SECTOR_UNIVERSES as Record<SectorName, string[]>,
  );

  const leaderSeries: Partial<Record<LeaderName, ReturnSeries>> = { ...composites };

  const macroMap: Record<string, LeaderName> = { USO: "OIL", GLD: "GOLD", "^TNX": "US10Y" };
  for (const [sym, name] of Object.entries(macroMap)) {
    const s = macro.series[sym];
    if (s) leaderSeries[name] = toLogReturns(s.dates, s.closes);
  }
  const rp = buildRiskAppetiteRatio(composites);
  if (rp) leaderSeries["XLY_XLP_RATIO"] = rp;

  const results = runLinkageTests(leaderSeries, composites);

  const payload: LinkagePayload = {
    results,
    agentContext: linkagesToAgentContext(results),
    updatedAt: new Date().toISOString(),
    sectorsFetched,
    macroFetched: Object.keys(macro.series),
    sectorsFailed,
  };

  // localStorage cache
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (e) { console.warn("linkage localStorage write failed", e); }

  // Server cache (best-effort, needs auth — silently skip if signed out)
  onProgress?.({ stage: "cache", message: "Caching for QuantAgent…" });
  try {
    const { data: sess } = await supabase.auth.getSession();
    if (sess?.session) {
      await supabase.functions.invoke("cache-linkages", {
        body: {
          payload: {
            asOf: payload.updatedAt,
            validated: results.filter((r) => r.validated).map((r) => ({
              leader: r.leader, follower: r.follower, lag: r.bestLag,
              sign: r.sign, coef: Number(r.coefficient.toFixed(4)),
              pAdj: Number(r.pAdjusted.toFixed(4)),
              dRsq: Number(r.rSquaredDelta.toFixed(4)),
              channel: r.channel, regimeSignFlip: r.regimeSignFlip,
            })),
          },
        },
      });
    }
  } catch (e) { console.warn("linkage server cache write failed", e); }

  onProgress?.({ stage: "done", message: "Done" });
  return payload;
}

export function readCachedLinkages(): LinkagePayload | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as LinkagePayload;
    if (Date.now() - new Date(p.updatedAt).getTime() > CACHE_TTL_MS) return null;
    return p;
  } catch { return null; }
}
