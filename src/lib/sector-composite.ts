// Build an equal-weight, normalized sector composite from the per-ticker prices
// stored in `stock_prices`. This matches the math the cross-sector linkage
// engine uses (equal-weight of member returns), so the composite line on the
// sector chart tells the same story as the linkage arrows.
import { fetchAndStoreStockData, getStockDataFromDB } from "@/lib/stock-data";
import { CURATED_SECTOR_UNIVERSES, type SectorName } from "@/lib/sector-universes";

export interface CompositePoint {
  date: string;
  timestamp: number;
  composite: number;   // equal-weight, base = 100
  proxy?: number;      // ETF proxy, base = 100 (if provided)
  memberCount: number; // how many tickers had a print that day
}

async function loadSeries(ticker: string, period: string) {
  try {
    // Prefer cached DB rows; fall back to a live fetch if empty.
    let rows = await getStockDataFromDB(ticker, period);
    if (!rows.length) {
      await fetchAndStoreStockData(ticker, period).catch(() => null);
      rows = await getStockDataFromDB(ticker, period);
    }
    return rows;
  } catch {
    return [];
  }
}

export async function buildSectorComposite(
  sector: SectorName,
  period: string,
  proxySymbol?: string | null,
): Promise<{ series: CompositePoint[]; membersLoaded: string[]; membersMissing: string[] }> {
  const members = CURATED_SECTOR_UNIVERSES[sector] ?? [];

  const results = await Promise.all(members.map((t) => loadSeries(t, period)));
  const membersLoaded: string[] = [];
  const membersMissing: string[] = [];

  // date -> normalized level per ticker
  const perTickerNormByDate: Map<string, Map<string, number>> = new Map();

  members.forEach((sym, i) => {
    const rows = results[i];
    if (!rows || rows.length < 2) { membersMissing.push(sym); return; }
    const base = rows[0].close;
    if (!base || !isFinite(base)) { membersMissing.push(sym); return; }
    membersLoaded.push(sym);
    for (const r of rows) {
      const norm = (r.close / base) * 100;
      if (!isFinite(norm)) continue;
      let m = perTickerNormByDate.get(r.date);
      if (!m) { m = new Map(); perTickerNormByDate.set(r.date, m); }
      m.set(sym, norm);
    }
  });

  // Load proxy separately (independently normalized)
  const proxyRows = proxySymbol ? await loadSeries(proxySymbol, period) : [];
  const proxyBase = proxyRows.length ? proxyRows[0].close : null;
  const proxyByDate = new Map<string, number>();
  if (proxyBase && isFinite(proxyBase)) {
    for (const r of proxyRows) {
      proxyByDate.set(r.date, (r.close / proxyBase) * 100);
    }
  }

  const sortedDates = Array.from(perTickerNormByDate.keys()).sort();
  const series: CompositePoint[] = sortedDates.map((date) => {
    const m = perTickerNormByDate.get(date)!;
    const values = Array.from(m.values());
    const composite = values.reduce((a, b) => a + b, 0) / values.length;
    return {
      date,
      timestamp: new Date(date).getTime(),
      composite,
      proxy: proxyByDate.get(date),
      memberCount: values.length,
    };
  });

  return { series, membersLoaded, membersMissing };
}
