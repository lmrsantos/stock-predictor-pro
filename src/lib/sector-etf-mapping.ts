// Sector → SPDR / thematic ETF proxy (null when no clean single-ETF match exists).
// Used by the sector chart to draw a "market benchmark" line alongside the
// equal-weight curated composite (which is what the linkage engine uses).
import type { SectorName } from "@/lib/sector-universes";

export const SECTOR_ETF_PROXY: Record<SectorName, { symbol: string; label: string } | null> = {
  // Technology
  "Mega-cap Tech":               null,
  "Semiconductors":              { symbol: "SOXX", label: "SOXX (iShares Semiconductors ETF)" },
  "Semis: AI & GPU":             { symbol: "SMH",  label: "SMH (VanEck Semiconductor ETF)" },
  "Semis: Foundry & Equipment":  { symbol: "SOXX", label: "SOXX (iShares Semiconductors ETF)" },
  "Semis: Memory":               null,
  "Semis: Analog":               null,
  "Software":                    { symbol: "IGV",  label: "IGV (iShares Software ETF)" },
  "Software: Cybersecurity":     { symbol: "CIBR", label: "CIBR (First Trust Cybersecurity ETF)" },
  "Software: Data & AI":         { symbol: "BOTZ", label: "BOTZ (Global X Robotics & AI ETF)" },
  "Software: Cloud Infra":       { symbol: "IGV",  label: "IGV (iShares Software ETF)" },

  // Financials
  "Banks":                       { symbol: "KBE",  label: "KBE (SPDR Bank ETF)" },
  "Money Center Banks":          { symbol: "KBWB", label: "KBWB (Invesco KBW Bank ETF)" },
  "Regional Banks":              { symbol: "KRE",  label: "KRE (SPDR S&P Regional Banking)" },

  // Healthcare
  "Biotech & Pharma":            { symbol: "XLV",  label: "XLV (SPDR Health Care)" },
  "Pharma: Big Pharma":          { symbol: "PPH",  label: "PPH (VanEck Pharmaceutical ETF)" },
  "Biotech":                     { symbol: "XBI",  label: "XBI (SPDR Biotech ETF)" },
  "Medical Devices":             { symbol: "IHI",  label: "IHI (iShares Medical Devices ETF)" },

  // Energy
  "Energy":                      { symbol: "XLE",  label: "XLE (SPDR Energy)" },
  "Energy: Integrated Majors":   { symbol: "XLE",  label: "XLE (SPDR Energy)" },
  "Energy: E&P":                 { symbol: "XOP",  label: "XOP (SPDR Oil & Gas E&P)" },
  "Energy: Oilfield Services":   { symbol: "OIH",  label: "OIH (VanEck Oil Services ETF)" },
  "Energy: Midstream":           { symbol: "AMLP", label: "AMLP (Alerian MLP ETF)" },

  // Consumer
  "Consumer Staples":            { symbol: "XLP",  label: "XLP (SPDR Consumer Staples)" },
  "Consumer Discretionary":      { symbol: "XLY",  label: "XLY (SPDR Consumer Discretionary)" },
  "Retail":                      { symbol: "XRT",  label: "XRT (SPDR S&P Retail ETF)" },
  "Restaurants":                 null,
  "Travel & Leisure":            { symbol: "JETS", label: "JETS (US Global Jets ETF)" },
  "Autos & EVs":                 { symbol: "CARZ", label: "CARZ (First Trust Auto Index ETF)" },

  // Industrials
  "Industrials & Defense":       { symbol: "XLI",  label: "XLI (SPDR Industrials)" },
  "Defense":                     { symbol: "ITA",  label: "ITA (iShares Aerospace & Defense)" },
  "Aerospace & Space":           { symbol: "ITA",  label: "ITA (iShares Aerospace & Defense)" },
  "Space":                       { symbol: "UFO",  label: "UFO (Procure Space ETF)" },

  // Utilities & REITs
  "Utilities":                   { symbol: "XLU",  label: "XLU (SPDR Utilities)" },
  "Real Estate":                 { symbol: "XLRE", label: "XLRE (SPDR Real Estate)" },
  "Data Center REITs":           { symbol: "SRVR", label: "SRVR (Pacer Data & Infra REIT ETF)" },
  "Residential REITs":           { symbol: "REZ",  label: "REZ (iShares Residential REIT ETF)" },

  // Materials
  "Materials":                       { symbol: "XLB",  label: "XLB (SPDR Materials)" },
  "Rare Earth & Critical Minerals":  { symbol: "REMX", label: "REMX (VanEck Rare Earth/Strategic Metals)" },
  "Nickel & Battery Metals":         { symbol: "BATT", label: "BATT (Amplify Lithium & Battery Tech ETF)" },
  "Lithium":                         { symbol: "LIT",  label: "LIT (Global X Lithium & Battery Tech ETF)" },
  "Gold & Precious Metals":          { symbol: "GDX",  label: "GDX (VanEck Gold Miners ETF)" },
  "Copper":                          { symbol: "COPX", label: "COPX (Global X Copper Miners ETF)" },
  "Steel":                           { symbol: "SLX",  label: "SLX (VanEck Steel ETF)" },

  // Emerging
  "Quantum Computing":           null,
};
