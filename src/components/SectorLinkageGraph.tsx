// SectorLinkageGraph.tsx
// Cytoscape graph of cross-sector lead-lag relationships for QuantForecast.
// Same predecessor/successor principle as Xref's job-program graph:
//   node  = sector (or ticker), macro driver
//   edge  = validated lead-lag linkage, arrow points leader -> follower
//
// Two views:
//   "sector" — sectors + macro drivers as nodes, linkages as edges
//   "ticker" — readable sector cards with member tickers and relationship chips
//
// Clicking a node opens an event panel: which market / government /
// geopolitical / company events historically move that sector, with direction.
// Clicking an edge shows the linkage detail (lag, sign, channel, strength).
//
// Requires: npm install cytoscape
// Data in: LinkageResult[] from cross-sector-linkages.ts (validated or all).

import { useEffect, useRef, useState, useMemo } from "react";

import cytoscape, { Core, EventObject } from "cytoscape";
import fcose from "cytoscape-fcose";
import type { LinkageResult, SectorName, LeaderName } from "@/lib/cross-sector-linkages";
import { CURATED_SECTOR_UNIVERSES } from "@/lib/sector-universes";

// Register the compound-aware layout once.
if (!(cytoscape as any).__fcoseRegistered) {
  cytoscape.use(fcose);
  (cytoscape as any).__fcoseRegistered = true;
}

// ---------------------------------------------------------------------------
// Event catalog: what moves each sector
// ---------------------------------------------------------------------------

export type EventCategory =
  | "monetary"      // Fed / central banks
  | "government"    // fiscal, regulation, tariffs, budgets
  | "geopolitical"  // conflicts, chokepoints, sanctions
  | "company"       // earnings, guidance, product, FDA, contracts
  | "market";       // macro data prints, credit events, flows

export interface MarketEvent {
  name: string;
  category: EventCategory;
  affects: { sector: SectorName; direction: "up" | "down" | "mixed"; note: string }[];
}

export const EVENT_CATALOG: MarketEvent[] = [
  {
    name: "FOMC rate decision / dot plot",
    category: "monetary",
    affects: [
      { sector: "Banks", direction: "mixed", note: "Steepening helps NIM; cuts into recession hurt" },
      { sector: "Utilities", direction: "down", note: "Bond proxy — higher rates compress valuations" },
      { sector: "Real Estate", direction: "down", note: "Cap rates and financing costs reprice fast" },
      { sector: "Biotech & Pharma", direction: "down", note: "Unprofitable biotech is long-duration; rate hikes hit hardest" },
      { sector: "Mega-cap Tech", direction: "down", note: "Multiple compression on higher discount rates" },
    ],
  },
  {
    name: "CPI / PCE inflation print",
    category: "market",
    affects: [
      { sector: "Consumer Staples", direction: "mixed", note: "Pricing power vs margin squeeze" },
      { sector: "Consumer Discretionary", direction: "down", note: "Hot prints imply tighter policy and squeezed wallets" },
      { sector: "Energy", direction: "up", note: "Inflation hedge flows" },
      { sector: "Utilities", direction: "down", note: "Via the rates channel" },
    ],
  },
  {
    name: "OPEC+ production decision",
    category: "geopolitical",
    affects: [
      { sector: "Energy", direction: "mixed", note: "Cuts lift crude and producers; quota breaks do the reverse" },
      { sector: "Industrials & Defense", direction: "mixed", note: "Input cost channel — sign depends on demand vs supply regime" },
      { sector: "Consumer Discretionary", direction: "down", note: "Fuel costs squeeze discretionary spend" },
    ],
  },
  {
    name: "Middle East / chokepoint escalation",
    category: "geopolitical",
    affects: [
      { sector: "Energy", direction: "up", note: "Supply-risk premium in crude" },
      { sector: "Industrials & Defense", direction: "up", note: "Defense names catch escalation bids" },
      { sector: "Aerospace & Space", direction: "up", note: "Defense-adjacent flows" },
      { sector: "Consumer Discretionary", direction: "down", note: "Oil-shock regime — supply-driven, risk-off" },
    ],
  },
  {
    name: "Chip export controls / CHIPS-type policy",
    category: "government",
    affects: [
      { sector: "Semiconductors", direction: "mixed", note: "Restrictions cut China revenue; subsidies lift domestic fabs" },
      { sector: "Mega-cap Tech", direction: "mixed", note: "Supply chain and AI capex implications" },
      { sector: "Quantum Computing", direction: "mixed", note: "Export-control lists increasingly include quantum" },
    ],
  },
  {
    name: "Defense budget / NDAA passage",
    category: "government",
    affects: [
      { sector: "Industrials & Defense", direction: "up", note: "Primes reprice on budget top-line" },
      { sector: "Aerospace & Space", direction: "up", note: "Contract flow reaches pure-space names with a lag" },
    ],
  },
  {
    name: "Tariff announcements / trade actions",
    category: "government",
    affects: [
      { sector: "Industrials & Defense", direction: "mixed", note: "Input costs vs reshoring winners" },
      { sector: "Consumer Discretionary", direction: "down", note: "Import cost pass-through" },
      { sector: "Semiconductors", direction: "down", note: "Supply chain disruption and retaliation risk" },
      { sector: "Consumer Staples", direction: "mixed", note: "Ag retaliation vs domestic substitution" },
    ],
  },
  {
    name: "Hyperscaler capex guidance",
    category: "company",
    affects: [
      { sector: "Semiconductors", direction: "up", note: "Direct demand signal for AI compute" },
      { sector: "Software", direction: "mixed", note: "Platform spend up, but capex can crowd out margins" },
      { sector: "Utilities", direction: "up", note: "Datacenter power demand theme" },
      { sector: "Quantum Computing", direction: "up", note: "Sentiment satellite of AI capex" },
    ],
  },
  {
    name: "Mega-cap earnings (top 7)",
    category: "company",
    affects: [
      { sector: "Mega-cap Tech", direction: "mixed", note: "Index-level move given weight concentration" },
      { sector: "Software", direction: "mixed", note: "Read-through on enterprise spend" },
      { sector: "Semiconductors", direction: "mixed", note: "Capex and demand read-through" },
    ],
  },
  {
    name: "FDA approval / trial readout",
    category: "company",
    affects: [
      { sector: "Biotech & Pharma", direction: "mixed", note: "Idiosyncratic — moves the name, spills to peers in same indication" },
    ],
  },
  {
    name: "NASA / Space Force contract awards",
    category: "government",
    affects: [
      { sector: "Aerospace & Space", direction: "up", note: "Contract-driven repricing of the winner, sympathy in peers" },
    ],
  },
  {
    name: "Quantum milestone announcements",
    category: "company",
    affects: [
      { sector: "Quantum Computing", direction: "up", note: "Sector-wide sympathy moves on any credible breakthrough" },
      { sector: "Software", direction: "mixed", note: "Post-quantum security subplot" },
    ],
  },
  {
    name: "Treasury auction / yield spike",
    category: "market",
    affects: [
      { sector: "Utilities", direction: "down", note: "Fastest inverse transmission in the map" },
      { sector: "Real Estate", direction: "down", note: "Financing and cap-rate channel" },
      { sector: "Banks", direction: "mixed", note: "Steepening vs mark-to-market losses on holdings" },
      { sector: "Mega-cap Tech", direction: "down", note: "Duration-sensitive multiples" },
    ],
  },
  {
    name: "Credit event / regional bank stress",
    category: "market",
    affects: [
      { sector: "Banks", direction: "down", note: "Direct contagion pricing" },
      { sector: "Real Estate", direction: "down", note: "CRE exposure is the usual epicenter" },
      { sector: "Consumer Staples", direction: "up", note: "Defensive rotation destination" },
      { sector: "Utilities", direction: "up", note: "Defensive rotation destination" },
    ],
  },
  {
    name: "Retail sales / consumer confidence print",
    category: "market",
    affects: [
      { sector: "Consumer Discretionary", direction: "mixed", note: "Direct demand read" },
      { sector: "Consumer Staples", direction: "mixed", note: "Trade-down behavior shows here first" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ViewMode = "sector" | "ticker";

interface Props {
  results: LinkageResult[];                       // from runLinkageTests()
  sectorMembership: Record<SectorName, string[]>; // for ticker view
  validatedOnly?: boolean;                        // default true
  initialMode?: ViewMode;
}

const MACRO_NODES: LeaderName[] = ["OIL", "GOLD", "US10Y", "XLY_XLP_RATIO"];
const MACRO_LABELS: Record<string, string> = {
  OIL: "Crude Oil",
  GOLD: "Gold",
  US10Y: "10Y Yield",
  XLY_XLP_RATIO: "Risk Appetite\n(Disc − Staples)",
};

export default function SectorLinkageGraph({
  results,
  sectorMembership,
  validatedOnly = true,
  initialMode = "sector",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const [expandedSectors, setExpandedSectors] = useState<Set<SectorName>>(new Set());
  const [selected, setSelected] = useState<
    | { kind: "sector"; sector: SectorName }
    | { kind: "ticker"; ticker: string; sector: SectorName }
    | { kind: "edge"; link: LinkageResult }
    | null
  >(null);

  const links = useMemo(
    () => (validatedOnly ? results.filter((r) => r.validated) : results),
    [results, validatedOnly],
  );

  const membership = useMemo(
    () => Object.keys(sectorMembership ?? {}).length > 0
      ? sectorMembership
      : (CURATED_SECTOR_UNIVERSES as Record<SectorName, string[]>),
    [sectorMembership],
  );

  const sectorsInPlay = useMemo(() => {
    const sectors = new Set<SectorName>();
    for (const l of links) {
      sectors.add(l.follower);
      if (!MACRO_NODES.includes(l.leader)) sectors.add(l.leader as SectorName);
    }
    for (const s of Object.keys(membership) as SectorName[]) sectors.add(s);
    return Array.from(sectors);
  }, [links, membership]);

  // Sectors that actually appear in at least one linkage — the graph only draws
  // these, so unlinked sectors don't float around as orphan nodes.
  const connectedSectors = useMemo(() => {
    const sectors = new Set<SectorName>();
    for (const l of links) {
      sectors.add(l.follower);
      if (!MACRO_NODES.includes(l.leader)) sectors.add(l.leader as SectorName);
    }
    return Array.from(sectors);
  }, [links]);

  const unlinkedSectors = useMemo(
    () => sectorsInPlay.filter((s) => !connectedSectors.includes(s)),
    [sectorsInPlay, connectedSectors],
  );


  const linksBySector = useMemo(() => {
    const map = new Map<SectorName, { incoming: LinkageResult[]; outgoing: LinkageResult[] }>();
    for (const sector of sectorsInPlay) map.set(sector, { incoming: [], outgoing: [] });
    for (const link of links) {
      map.get(link.follower)?.incoming.push(link);
      if (!MACRO_NODES.includes(link.leader)) {
        map.get(link.leader as SectorName)?.outgoing.push(link);
      }
    }
    return map;
  }, [links, sectorsInPlay]);

  // Reset expansion when leaving ticker mode
  useEffect(() => {
    if (mode === "sector") setExpandedSectors(new Set());
  }, [mode]);

  useEffect(() => {
    if (mode === "ticker") {
      cyRef.current?.destroy();
      cyRef.current = null;
      return;
    }

    if (!containerRef.current) return;

    const elements: cytoscape.ElementDefinition[] = [];

    // --- Nodes ---
    for (const s of connectedSectors) {
      elements.push({
        data: {
          id: `sec:${s}`,
          label: s,
          sector: s,
          kind: "sector",
        },
      });
    }
    const macroUsed = new Set(
      links.map((l) => l.leader).filter((l) => MACRO_NODES.includes(l)),
    );
    for (const mname of macroUsed) {
      elements.push({
        data: { id: `macro:${mname}`, label: MACRO_LABELS[mname] ?? mname, kind: "macro" },
      });
    }

    // --- Edges (always sector-to-sector; containers carry them in ticker view) ---
    links.forEach((l, i) => {
      const sourceId = MACRO_NODES.includes(l.leader)
        ? `macro:${l.leader}`
        : `sec:${l.leader}`;
      elements.push({
        data: {
          id: `edge:${i}`,
          source: sourceId,
          target: `sec:${l.follower}`,
          label: `${l.bestLag}d`,
          sign: l.sign,
          regimeFlip: l.regimeSignFlip,
          strength: l.rSquaredDelta,
          linkIndex: i,
        },
      });
    });

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node[kind='sector']",
          style: {
            shape: "round-rectangle",
            "background-color": "hsl(240 28% 12%)",
            "background-opacity": 1,
            "border-width": 1.5,
            "border-color": "hsl(263 70% 65%)",
            label: "data(label)",
            color: "hsl(0 0% 98%)",
            "font-size": 14,
            "font-weight": 600,
            "text-valign": "center",
            "text-halign": "center",
            "text-margin-y": 0,
            "text-wrap": "wrap",
            "text-max-width": "200px",
            "text-outline-color": "hsl(240 40% 6%)",
            "text-outline-width": 0.5,
            "line-height": 1.25,
            width: 170,
            height: 62,
            padding: "12px",
          },
        },
        {
          selector: "node[kind='ticker']",
          style: {
            shape: "round-rectangle",
            "background-color": "hsl(240 25% 16%)",
            "border-width": 1.5,
            "border-color": "hsl(263 60% 55%)",
            label: "data(label)",
            color: "hsl(0 0% 100%)",
            "font-size": 14,
            "font-weight": 600,
            "text-valign": "center",
            "text-halign": "center",
            width: 82,
            height: 40,
            padding: "6px",
            "text-outline-color": "hsl(240 40% 6%)",
            "text-outline-width": 0.5,
          },
        },
        {
          selector: "node[kind='macro']",
          style: {
            shape: "diamond",
            "background-color": "hsl(263 45% 22%)",
            "border-width": 1.5,
            "border-color": "hsl(var(--border))",
            label: "data(label)",
            color: "hsl(0 0% 98%)",
            "font-size": 12,
            "font-weight": 600,
            "text-valign": "bottom",
            "text-margin-y": 8,
            "text-wrap": "wrap",
            "text-max-width": "110px",
            width: 64,
            height: 64,
            "text-outline-color": "hsl(240 40% 6%)",
            "text-outline-width": 1,
          },
        },
        {
          selector: "edge",
          style: {
            "curve-style": "bezier",
            "target-arrow-shape": "triangle",
            "arrow-scale": 1.1,
            label: "data(label)",
            "font-size": 10,
            "font-weight": 500,
            color: "hsl(var(--muted-foreground))",
            "text-background-color": "hsl(var(--background))",
            "text-background-opacity": 0.92,
            "text-background-padding": "3px",
            width: (ele: cytoscape.EdgeSingular) =>
              Math.max(1.5, Math.min(6, (ele.data("strength") as number) * 400)),
          },
        },
        {
          selector: "edge[sign > 0]",
          style: {
            "line-color": "hsl(142 60% 42%)",
            "target-arrow-color": "hsl(142 60% 42%)",
          },
        },
        {
          selector: "edge[sign < 0]",
          style: {
            "line-color": "hsl(0 65% 52%)",
            "target-arrow-color": "hsl(0 65% 52%)",
          },
        },
        {
          selector: "edge[?regimeFlip]",
          style: { "line-style": "dashed" },
        },
        {
          selector: ":selected",
          style: {
            "border-width": 2.5,
            "border-color": "hsl(var(--primary))",
            "line-color": "hsl(var(--primary))",
            "target-arrow-color": "hsl(var(--primary))",
          },
        },
      ],
      layout:
        { name: "circle", padding: 60, fit: true },
      wheelSensitivity: 0.2,
      minZoom: 0.15,
      maxZoom: 2.5,
    });

    // Ensure the graph is always framed inside the viewport after (re)layout,
    // especially after Expand all / Collapse all in ticker mode.
    cy.one("layoutstop", () => {
      cy.fit(undefined, 40);
    });


    cy.on("tap", "node[kind='sector']", (e: EventObject) => {
      const sector = e.target.data("sector") as SectorName;
      setSelected({ kind: "sector", sector });
    });
    cy.on("tap", "node[kind='ticker']", (e: EventObject) => {
      setSelected({
        kind: "ticker",
        ticker: e.target.data("label"),
        sector: e.target.data("sector"),
      });
    });
    cy.on("tap", "edge", (e: EventObject) => {
      const link = links[e.target.data("linkIndex") as number];
      if (link) setSelected({ kind: "edge", link });
    });
    cy.on("tap", (e: EventObject) => {
      if (e.target === cy) setSelected(null);
    });

    cyRef.current = cy;
    return () => { cy.destroy(); cyRef.current = null; };
  }, [links, mode, membership, sectorsInPlay]);

  const panelSector =
    selected?.kind === "sector" ? selected.sector
    : selected?.kind === "ticker" ? selected.sector
    : null;

  const sectorEvents = panelSector
    ? EVENT_CATALOG
        .map((ev) => ({
          ev,
          hit: ev.affects.find((a) => a.sector === panelSector),
        }))
        .filter((x): x is { ev: MarketEvent; hit: MarketEvent["affects"][number] } => !!x.hit)
    : [];

  const CATEGORY_LABEL: Record<EventCategory, string> = {
    monetary: "Monetary",
    government: "Government",
    geopolitical: "Geopolitical",
    company: "Company",
    market: "Market data",
  };

  return (
    <div className="flex h-[640px] w-full gap-3">
      {/* Graph */}
      <div className={`relative flex-1 rounded-lg border bg-card ${mode === "ticker" ? "overflow-hidden" : ""}`}>
        <div className="absolute left-3 top-3 z-10 flex gap-1 rounded-md border bg-background p-1 text-sm">
          <button
            className={`rounded px-3 py-1 ${mode === "sector" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={() => setMode("sector")}
          >
            By sector
          </button>
          <button
            className={`rounded px-3 py-1 ${mode === "ticker" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={() => setMode("ticker")}
          >
            By ticker
          </button>
        </div>
        {mode === "ticker" && (
          <div className="absolute bottom-3 left-3 z-10 rounded-md border bg-background/95 px-3 py-2 text-xs text-muted-foreground">
            <div className="font-medium text-foreground mb-1">Ticker view legend</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              <div><span className="mr-1 inline-block w-4 text-center text-foreground">←</span> leads this sector</div>
              <div><span className="mr-1 inline-block w-4 text-center text-foreground">→</span> this sector leads</div>
              <div><span className="mr-1 inline-block w-4 text-center text-foreground">▲</span> event pushes up</div>
              <div><span className="mr-1 inline-block w-4 text-center text-foreground">▼</span> event pushes down</div>
              <div className="col-span-2"><span className="mr-1 inline-block w-4 text-center text-foreground">◆</span> mixed / conditional effect</div>
            </div>
          </div>
        )}
        {mode === "sector" && (
          <div className="absolute bottom-3 left-3 z-10 rounded-md border bg-background/90 p-2 text-xs text-muted-foreground">
            <div><span className="mr-1 inline-block h-0.5 w-4 bg-[hsl(142_60%_42%)] align-middle" /> leads positively</div>
            <div><span className="mr-1 inline-block h-0.5 w-4 bg-[hsl(0_65%_52%)] align-middle" /> leads inversely</div>
            <div><span className="mr-1 inline-block w-4 border-t border-dashed border-foreground align-middle" /> sign flips by regime</div>
            <div className="mt-0.5">Edge label = lead time (trading days). Width = strength.</div>
          </div>
        )}
        {mode === "ticker" ? (
          <div key="ticker-cards" className="absolute inset-0 overflow-y-auto px-4 pb-28 pt-16">
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
              {sectorsInPlay.map((sector) => {
                const tickers = membership[sector] ?? [];
                const sectorLinks = linksBySector.get(sector);
                return (
                  <button
                    key={sector}
                    type="button"
                    onClick={() => setSelected({ kind: "sector", sector })}
                    className="min-h-36 rounded-lg border bg-background/70 p-3 text-left shadow-sm transition hover:border-primary/60 hover:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{sector}</div>
                        <div className="text-xs text-muted-foreground">{tickers.length} tickers</div>
                      </div>
                      <div className="rounded border bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {sectorLinks?.incoming.length ?? 0} in · {sectorLinks?.outgoing.length ?? 0} out
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {tickers.map((ticker) => (
                        <span
                          key={`${sector}:${ticker}`}
                          className="rounded-md border bg-card px-2 py-1 text-xs font-medium text-foreground"
                        >
                          {ticker}
                        </span>
                      ))}
                    </div>

                    {!!sectorLinks && (sectorLinks.incoming.length > 0 || sectorLinks.outgoing.length > 0) && (
                      <div className="mt-3 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                        {sectorLinks.incoming.slice(0, 2).map((link) => (
                          <div key={`in:${link.leader}:${link.follower}:${link.bestLag}`} className="truncate">
                            ← {String(link.leader)} leads {link.bestLag}d
                          </div>
                        ))}
                        {sectorLinks.outgoing.slice(0, 2).map((link) => (
                          <div key={`out:${link.leader}:${link.follower}:${link.bestLag}`} className="truncate">
                            → {link.follower} after {link.bestLag}d
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div key="sector-cytoscape" ref={containerRef} className="h-full w-full" />
        )}
      </div>

      {/* Detail panel */}
      <div className="w-80 overflow-y-auto rounded-lg border bg-card p-4">
        {!selected && (
          <p className="text-sm text-muted-foreground">
            Tap a sector to see which events move it. Tap an edge to see the
            lead-lag detail. Arrows point from leader to follower — the sector
            at the arrow's tail tends to move first.
          </p>
        )}

        {panelSector && mode === "ticker" && (
          <div className="mb-3 rounded-md border bg-muted/30 p-2">
            <div className="mb-1 text-xs font-medium">Ticker members</div>
            <div className="flex flex-wrap gap-1">
              {(membership[panelSector] ?? []).map((ticker) => (
                <span key={ticker} className="rounded border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {ticker}
                </span>
              ))}
            </div>
          </div>
        )}

        {selected?.kind === "edge" && (
          <div className="space-y-2 text-sm">
            <h3 className="font-semibold">
              {String(selected.link.leader)} → {selected.link.follower}
            </h3>
            <p>
              Leads by <strong>{selected.link.bestLag} trading day{selected.link.bestLag > 1 ? "s" : ""}</strong>,{" "}
              {selected.link.sign > 0 ? "same direction" : "inverse direction"}.
            </p>
            <p className="text-muted-foreground">{selected.link.channel}</p>
            {selected.link.regimeSignFlip && (
              <p className="rounded bg-muted p-2 text-xs">
                Regime-dependent: the direction of this relationship flips
                between demand-driven and supply-shock regimes. Check the
                regime classifier before acting on it.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Incremental R²: {(selected.link.rSquaredDelta * 100).toFixed(2)}% ·
              adj. p = {selected.link.pAdjusted.toExponential(1)}
            </p>
          </div>
        )}

        {panelSector && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              {selected?.kind === "ticker" ? `${selected.ticker} — ${panelSector}` : panelSector}
            </h3>
            <p className="text-xs text-muted-foreground">
              Events that historically move this sector:
            </p>
            {sectorEvents.map(({ ev, hit }) => (
              <div key={ev.name} className="rounded-md border p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{ev.name}</span>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {CATEGORY_LABEL[ev.category]}
                  </span>
                </div>
                <div className="mt-1 flex items-start gap-1.5">
                  <span aria-hidden>
                    {hit.direction === "up" ? "▲" : hit.direction === "down" ? "▼" : "◆"}
                  </span>
                  <span className="text-muted-foreground">{hit.note}</span>
                </div>
              </div>
            ))}
            {sectorEvents.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No catalogued events for this sector yet.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
