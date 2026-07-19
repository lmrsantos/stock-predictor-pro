// src/lib/sector-universes.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared curated sector -> symbols map. Mirror of CURATED_UNIVERSES in
// supabase/functions/sector-backtest/index.ts so browser code (cross-sector
// linkages, hot-stocks scoring, etc.) can reason about sector membership
// without a network call.
//
// If you update this list, update supabase/functions/sector-backtest/index.ts
// in the same change to keep them in sync.
// ─────────────────────────────────────────────────────────────────────────────

export type SectorName =
  | "Semiconductors"
  | "Software"
  | "Mega-cap Tech"
  | "Banks"
  | "Biotech & Pharma"
  | "Energy"
  | "Consumer Staples"
  | "Consumer Discretionary"
  | "Industrials & Defense"
  | "Utilities"
  | "Real Estate"
  | "Quantum Computing"
  | "Aerospace & Space";

export const CURATED_SECTOR_UNIVERSES: Record<SectorName, string[]> = {
  "Semiconductors":         ["NVDA","AMD","AVGO","TSM","QCOM","INTC","AMAT","LRCX","KLAC","MU","ASML","MRVL","NXPI","ADI","TXN","ON","MCHP","SWKS","QRVO","MPWR","ARM","SMCI","WOLF","STM","TER","ENTG","ALAB","CRDO","SITM","RMBS"],
  "Software":               ["MSFT","ORCL","CRM","ADBE","NOW","INTU","PANW","SNPS","CDNS","WDAY","TEAM","DDOG","CRWD","SNOW","NET","ZS","MDB","HUBS","DOCU","OKTA","ZM","SHOP"],
  "Mega-cap Tech":          ["AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","AVGO","ORCL","NFLX"],
  "Banks":                  ["JPM","BAC","WFC","C","GS","MS","USB","PNC","TFC","SCHW","COF","BK","STT","RF","FITB","HBAN","KEY","MTB","CFG","ZION"],
  "Biotech & Pharma":       ["LLY","JNJ","ABBV","MRK","PFE","TMO","ABT","BMY","AMGN","GILD","VRTX","REGN","MRNA","BIIB","ISRG","ZTS","CVS","UNH"],
  "Energy":                 ["XOM","CVX","COP","EOG","SLB","PSX","MPC","VLO","OXY","PXD","HES","DVN","FANG","HAL","BKR","KMI","WMB","OKE"],
  "Consumer Staples":       ["WMT","COST","PG","KO","PEP","MDLZ","CL","KMB","GIS","K","HSY","SYY","CHD","CLX","MNST","STZ","TGT","KR"],
  "Consumer Discretionary": ["AMZN","TSLA","HD","MCD","NKE","SBUX","LOW","BKNG","TJX","CMG","ABNB","ORLY","AZO","DPZ","YUM","MAR","DRI","RCL","CCL"],
  "Industrials & Defense":  ["CAT","BA","LMT","RTX","HON","UNP","GE","DE","NOC","GD","ETN","EMR","ITW","PH","CSX","NSC","FDX","UPS","WM"],
  "Utilities":              ["NEE","DUK","SO","D","AEP","SRE","XEL","EXC","PEG","WEC","ED","ETR","ES","AWK","PCG","CEG","VST"],
  "Real Estate":            ["AMT","PLD","EQIX","CCI","PSA","O","WELL","VICI","DLR","SBAC","SPG","AVB","EQR","ARE","EXR","VTR","WY"],
  "Quantum Computing":      ["IONQ","RGTI","QBTS","QUBT","ARQQ"],
  "Aerospace & Space":      ["LMT","RTX","NOC","GD","BA","HEI","TDG","RKLB","ASTS","LUNR","SPCE","PL"],
};

export const SECTOR_NAMES = Object.keys(CURATED_SECTOR_UNIVERSES) as SectorName[];

/** All unique symbols across the curated universe. */
export const ALL_CURATED_SYMBOLS: string[] = Array.from(
  new Set(Object.values(CURATED_SECTOR_UNIVERSES).flat()),
);

/**
 * symbol -> array of sectors it belongs to (mega-caps appear in multiple).
 * Useful for the linkage engine's leave-one-out composite selection.
 */
export const SYMBOL_TO_SECTORS: Record<string, SectorName[]> = (() => {
  const m: Record<string, SectorName[]> = {};
  for (const sector of SECTOR_NAMES) {
    for (const sym of CURATED_SECTOR_UNIVERSES[sector]) {
      (m[sym] ??= []).push(sector);
    }
  }
  return m;
})();

/** Primary sector for a symbol (first-listed sector wins). */
export function primarySectorOf(symbol: string): SectorName | null {
  return SYMBOL_TO_SECTORS[symbol]?.[0] ?? null;
}
