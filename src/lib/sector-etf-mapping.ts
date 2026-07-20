// Sector → SPDR sector ETF proxy (null when no clean single-ETF match exists).
// Used by the sector chart to draw a "market benchmark" line alongside the
// equal-weight curated composite (which is what the linkage engine uses).
import type { SectorName } from "@/lib/sector-universes";

export const SECTOR_ETF_PROXY: Record<SectorName, { symbol: string; label: string } | null> = {
  "Semiconductors":         { symbol: "SOXX", label: "SOXX (iShares Semiconductors ETF)" },
  "Software":               { symbol: "IGV",  label: "IGV (iShares Software ETF)" },
  "Mega-cap Tech":          null, // no clean equivalent — top-10 basket
  "Banks":                  { symbol: "KBE",  label: "KBE (SPDR Bank ETF)" },
  "Biotech & Pharma":       { symbol: "XLV",  label: "XLV (SPDR Health Care)" },
  "Energy":                 { symbol: "XLE",  label: "XLE (SPDR Energy)" },
  "Consumer Staples":       { symbol: "XLP",  label: "XLP (SPDR Consumer Staples)" },
  "Consumer Discretionary": { symbol: "XLY",  label: "XLY (SPDR Consumer Discretionary)" },
  "Industrials & Defense":  { symbol: "XLI",  label: "XLI (SPDR Industrials)" },
  "Utilities":              { symbol: "XLU",  label: "XLU (SPDR Utilities)" },
  "Real Estate":            { symbol: "XLRE", label: "XLRE (SPDR Real Estate)" },
  "Quantum Computing":      null, // no ETF equivalent
  "Aerospace & Space":      { symbol: "ITA",  label: "ITA (iShares Aerospace & Defense)" },
};
