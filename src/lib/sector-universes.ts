// src/lib/sector-universes.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared curated sector -> symbols map. Mirror of CURATED_UNIVERSES in
// supabase/functions/sector-backtest/index.ts so browser code (cross-sector
// linkages, hot-stocks scoring, etc.) can reason about sector membership
// without a network call.
//
// Sectors include top-level baskets (e.g. "Semiconductors", "Materials") and
// narrower subsectors (e.g. "Semis: AI & GPU", "Rare Earth & Critical Minerals").
// SECTOR_GROUPS defines how they're grouped in the UI selects.
//
// If you update this list, update supabase/functions/sector-backtest/index.ts
// in the same change to keep them in sync.
// ─────────────────────────────────────────────────────────────────────────────

export type SectorName =
  // Technology
  | "Mega-cap Tech"
  | "Semiconductors"
  | "Semis: AI & GPU"
  | "Semis: Foundry & Equipment"
  | "Semis: Memory"
  | "Semis: Analog"
  | "Software"
  | "Software: Cybersecurity"
  | "Software: Data & AI"
  | "Software: Cloud Infra"
  // Financials
  | "Banks"
  | "Money Center Banks"
  | "Regional Banks"
  // Healthcare
  | "Biotech & Pharma"
  | "Pharma: Big Pharma"
  | "Biotech"
  | "Medical Devices"
  // Energy
  | "Energy"
  | "Energy: Integrated Majors"
  | "Energy: E&P"
  | "Energy: Oilfield Services"
  | "Energy: Midstream"
  // Consumer
  | "Consumer Staples"
  | "Consumer Discretionary"
  | "Retail"
  | "Restaurants"
  | "Travel & Leisure"
  | "Autos & EVs"
  // Industrials
  | "Industrials & Defense"
  | "Defense"
  | "Aerospace & Space"
  | "Space"
  // Utilities & REITs
  | "Utilities"
  | "Real Estate"
  | "Data Center REITs"
  | "Residential REITs"
  // Materials (NEW family)
  | "Materials"
  | "Rare Earth & Critical Minerals"
  | "Nickel & Battery Metals"
  | "Lithium"
  | "Gold & Precious Metals"
  | "Copper"
  | "Steel"
  // Emerging
  | "Quantum Computing";

export const CURATED_SECTOR_UNIVERSES: Record<SectorName, string[]> = {
  // ── Technology ──────────────────────────────────────────────
  "Mega-cap Tech":               ["AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","AVGO","ORCL","NFLX"],
  "Semiconductors":              ["NVDA","AMD","AVGO","TSM","QCOM","INTC","AMAT","LRCX","KLAC","MU","ASML","MRVL","NXPI","ADI","TXN","ON","MCHP","SWKS","QRVO","MPWR","ARM","SMCI","WOLF","STM","TER","ENTG","ALAB","CRDO","SITM","RMBS"],
  "Semis: AI & GPU":             ["NVDA","AMD","AVGO","ARM","SMCI","MRVL","ALAB","CRDO"],
  "Semis: Foundry & Equipment":  ["TSM","ASML","AMAT","LRCX","KLAC","TER","ENTG","KLIC"],
  "Semis: Memory":               ["MU","WDC","STX"],
  "Semis: Analog":               ["ADI","TXN","ON","MCHP","NXPI","MPWR","SWKS","QRVO","SITM","RMBS"],
  "Software":                    ["MSFT","ORCL","CRM","ADBE","NOW","INTU","PANW","SNPS","CDNS","WDAY","TEAM","DDOG","CRWD","SNOW","NET","ZS","MDB","HUBS","DOCU","OKTA","ZM","SHOP"],
  "Software: Cybersecurity":     ["PANW","CRWD","ZS","OKTA","NET","FTNT","S","CYBR","QLYS","RBRK"],
  "Software: Data & AI":         ["SNOW","DDOG","MDB","PLTR","AI","PATH","ESTC","CFLT","GTLB"],
  "Software: Cloud Infra":       ["MSFT","ORCL","NOW","WDAY","ADBE","CRM","INTU","HUBS"],

  // ── Financials ──────────────────────────────────────────────
  "Banks":                       ["JPM","BAC","WFC","C","GS","MS","USB","PNC","TFC","SCHW","COF","BK","STT","RF","FITB","HBAN","KEY","MTB","CFG","ZION"],
  "Money Center Banks":          ["JPM","BAC","WFC","C","GS","MS"],
  "Regional Banks":              ["USB","PNC","TFC","RF","FITB","HBAN","KEY","MTB","CFG","ZION"],

  // ── Healthcare ──────────────────────────────────────────────
  "Biotech & Pharma":            ["LLY","JNJ","ABBV","MRK","PFE","TMO","ABT","BMY","AMGN","GILD","VRTX","REGN","MRNA","BIIB","ISRG","ZTS","CVS","UNH"],
  "Pharma: Big Pharma":          ["LLY","JNJ","ABBV","MRK","PFE","BMY","NVS","AZN","GSK","NVO"],
  "Biotech":                     ["VRTX","REGN","MRNA","BIIB","GILD","AMGN","BMRN","BEAM","CRSP","NTLA","ARWR","ALNY"],
  "Medical Devices":             ["ISRG","ABT","MDT","SYK","BSX","EW","ZBH","DXCM","IDXX","BAX"],

  // ── Energy ──────────────────────────────────────────────────
  "Energy":                      ["XOM","CVX","COP","EOG","SLB","PSX","MPC","VLO","OXY","PXD","HES","DVN","FANG","HAL","BKR","KMI","WMB","OKE"],
  "Energy: Integrated Majors":   ["XOM","CVX","BP","SHEL","TTE","COP","EQNR"],
  "Energy: E&P":                 ["EOG","OXY","HES","DVN","FANG","MRO","APA","CTRA","PR"],
  "Energy: Oilfield Services":   ["SLB","HAL","BKR","NOV","FTI","WFRD","LBRT"],
  "Energy: Midstream":           ["KMI","WMB","OKE","ET","EPD","MPLX","TRGP","LNG"],

  // ── Consumer ────────────────────────────────────────────────
  "Consumer Staples":            ["WMT","COST","PG","KO","PEP","MDLZ","CL","KMB","GIS","K","HSY","SYY","CHD","CLX","MNST","STZ","TGT","KR"],
  "Consumer Discretionary":      ["AMZN","TSLA","HD","MCD","NKE","SBUX","LOW","BKNG","TJX","CMG","ABNB","ORLY","AZO","DPZ","YUM","MAR","DRI","RCL","CCL"],
  "Retail":                      ["WMT","COST","TGT","TJX","HD","LOW","ORLY","AZO","DG","DLTR","ROST","BBY","ULTA"],
  "Restaurants":                 ["MCD","SBUX","CMG","YUM","DPZ","DRI","QSR","WING","TXRH","SG"],
  "Travel & Leisure":            ["BKNG","MAR","ABNB","RCL","CCL","NCLH","HLT","EXPE","H","VAC","LYV","UAL","DAL","AAL","LUV"],
  "Autos & EVs":                 ["TSLA","GM","F","RIVN","LCID","NIO","LI","XPEV","TM","HMC","STLA","BYDDY"],

  // ── Industrials ─────────────────────────────────────────────
  "Industrials & Defense":       ["CAT","BA","LMT","RTX","HON","UNP","GE","DE","NOC","GD","ETN","EMR","ITW","PH","CSX","NSC","FDX","UPS","WM"],
  "Defense":                     ["LMT","RTX","NOC","GD","BA","HII","LDOS","LHX","KTOS","AVAV"],
  "Aerospace & Space":           ["LMT","RTX","NOC","GD","BA","HEI","TDG","RKLB","ASTS","LUNR","SPCE","PL"],
  "Space":                       ["RKLB","ASTS","LUNR","SPCE","PL","IRDM","MAXR","BKSY"],

  // ── Utilities & REITs ───────────────────────────────────────
  "Utilities":                   ["NEE","DUK","SO","D","AEP","SRE","XEL","EXC","PEG","WEC","ED","ETR","ES","AWK","PCG","CEG","VST"],
  "Real Estate":                 ["AMT","PLD","EQIX","CCI","PSA","O","WELL","VICI","DLR","SBAC","SPG","AVB","EQR","ARE","EXR","VTR","WY"],
  "Data Center REITs":           ["EQIX","DLR","AMT","CCI","SBAC","IRM"],
  "Residential REITs":           ["AVB","EQR","ESS","MAA","INVH","UDR","CPT","AMH"],

  // ── Materials (NEW) ─────────────────────────────────────────
  "Materials":                       ["LIN","APD","SHW","ECL","FCX","NEM","NUE","DOW","DD","PPG","VMC","MLM","CTVA","IFF","ALB","MOS","CF","STLD","X","AA"],
  "Rare Earth & Critical Minerals":  ["MP","USAR","TMC","UUUU","IPX","TROX","REEMF","LYSDY"],
  "Nickel & Battery Metals":         ["VALE","BHP","RIO","GLNCY","NILSY","SBSW","TMC","MP"],
  "Lithium":                         ["ALB","SQM","LTHM","PLL","LAC","SGML","LITM","IONR"],
  "Gold & Precious Metals":          ["NEM","GOLD","AEM","KGC","WPM","FNV","PAAS","AG","HL","RGLD","AU"],
  "Copper":                          ["FCX","SCCO","TECK","HBM","ERO","TRQ","IVN","LUN"],
  "Steel":                           ["NUE","STLD","X","CLF","RS","MT","TX","CMC"],

  // ── Emerging ────────────────────────────────────────────────
  "Quantum Computing":           ["IONQ","RGTI","QBTS","QUBT","ARQQ"],
};

/**
 * Grouped view of sectors for UI selects (single sector picker uses <optgroup>,
 * multi-sector chip picker renders one row per group).
 */
export const SECTOR_GROUPS: { group: string; sectors: SectorName[] }[] = [
  { group: "Technology", sectors: [
    "Mega-cap Tech","Semiconductors","Semis: AI & GPU","Semis: Foundry & Equipment","Semis: Memory","Semis: Analog",
    "Software","Software: Cybersecurity","Software: Data & AI","Software: Cloud Infra",
  ]},
  { group: "Financials", sectors: ["Banks","Money Center Banks","Regional Banks"] },
  { group: "Healthcare", sectors: ["Biotech & Pharma","Pharma: Big Pharma","Biotech","Medical Devices"] },
  { group: "Energy",     sectors: ["Energy","Energy: Integrated Majors","Energy: E&P","Energy: Oilfield Services","Energy: Midstream"] },
  { group: "Consumer",   sectors: ["Consumer Staples","Consumer Discretionary","Retail","Restaurants","Travel & Leisure","Autos & EVs"] },
  { group: "Industrials",sectors: ["Industrials & Defense","Defense","Aerospace & Space","Space"] },
  { group: "Utilities & REITs", sectors: ["Utilities","Real Estate","Data Center REITs","Residential REITs"] },
  { group: "Materials",  sectors: ["Materials","Rare Earth & Critical Minerals","Nickel & Battery Metals","Lithium","Gold & Precious Metals","Copper","Steel"] },
  { group: "Emerging",   sectors: ["Quantum Computing"] },
];

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
