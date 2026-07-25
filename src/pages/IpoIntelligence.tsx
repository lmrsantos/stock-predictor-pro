import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Inbox,
  AlertTriangle,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePlan } from "@/hooks/usePlan";
import { PlanBadge } from "@/components/PlanBadge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ---------------------------------------------------------------------------
// Types (mirroring supabase/functions/_shared/ipo-risk-engine.ts output shape)
// ---------------------------------------------------------------------------

type Horizon = "imminent" | "near" | "medium" | "long";
type RiskTier = "lower" | "medium" | "high" | "very_high";
type Stage = "filed" | "secondary" | "pre" | "rumored";

interface DimensionScoreRow {
  dimension: string;
  score: number;
  maxScore: number;
  weight: number;
  weightedScore: number;
  rationale: string;
}

interface IpoRow {
  id: string;
  horizon: Horizon;
  name: string;
  sector: string;
  brief: string;
  stage: Stage;
  ipo_timeline_note: string | null;
  platforms: { name: string; url: string }[];
  min_investment: string | null;
  accredited_required: boolean;
  sources: string[];
  risk_tier: RiskTier;
  risk_label: string;
  risk_score: number;
  our_view: string;
  dimension_scores: {
    revenueReality: DimensionScoreRow;
    valuationFundamentals: DimensionScoreRow;
    competitiveMoat: DimensionScoreRow;
    exitCertainty: DimensionScoreRow;
    illiquidityRisk: DimensionScoreRow;
  };
  raw_facts: {
    revenueStatus: "profitable" | "revenue_not_profitable" | "pre_revenue";
    [k: string]: unknown;
  };
  refreshed_at: string;
}

// ---------------------------------------------------------------------------
// Horizon options
// ---------------------------------------------------------------------------

const HORIZONS: {
  value: Horizon;
  title: string;
  timeframe: string;
  description: string;
}[] = [
  {
    value: "imminent",
    title: "Imminent",
    timeframe: "0–6 months",
    description: "S-1 filed. Roadshow underway or imminent.",
  },
  {
    value: "near",
    title: "Near-term",
    timeframe: "6–18 months",
    description: "Strong signals. Filing expected within 18 months.",
  },
  {
    value: "medium",
    title: "Medium",
    timeframe: "1–3 years",
    description: "Active secondary market. No filing yet.",
  },
  {
    value: "long",
    title: "Long",
    timeframe: "3+ years",
    description: "Early stage, funds, and Reg CF. Highest risk.",
  },
];

const STAGE_STYLES: Record<Stage, { label: string; className: string }> = {
  filed:     { label: "S-1 filed",     className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  secondary: { label: "Secondary mkt", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  pre:       { label: "Open to all",   className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  rumored:   { label: "Rumored",       className: "bg-muted text-muted-foreground border-border" },
};

const TIER_COLORS: Record<RiskTier, { bar: string; text: string }> = {
  lower:     { bar: "bg-emerald-500", text: "text-emerald-400" },
  medium:    { bar: "bg-amber-500",   text: "text-amber-400" },
  high:      { bar: "bg-orange-500",  text: "text-orange-400" },
  very_high: { bar: "bg-red-500",     text: "text-red-400" },
};

const TIER_LABEL: Record<RiskTier, string> = {
  lower: "Lower",
  medium: "Medium",
  high: "High",
  very_high: "Very high",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IpoIntelligence() {
  const { plan } = usePlan();
  const canRefresh = plan === "standard" || plan === "premium";

  const [horizon, setHorizon] = useState<Horizon>("near");
  const [customQuery, setCustomQuery] = useState("");
  const [rows, setRows] = useState<IpoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  // Filters
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<"all" | RiskTier>("all");
  const [accreditedFilter, setAccreditedFilter] = useState<
    "all" | "required" | "not_required"
  >("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sourcesOpen, setSourcesOpen] = useState<Record<string, boolean>>({});

  const loadFromDb = async (h: Horizon) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ipo_intelligence")
      .select("*")
      .eq("horizon", h)
      .order("risk_score", { ascending: false });
    if (error) {
      console.error(error);
      setRows([]);
    } else {
      const list = (data ?? []) as unknown as IpoRow[];
      setRows(list);
      setLastRefreshed(list[0]?.refreshed_at ?? null);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadFromDb(horizon);
  }, [horizon]);

  const handleRefresh = async () => {
    if (!canRefresh) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "fetch-ipo-intelligence",
        { body: { horizon, customQuery: customQuery.trim() || undefined } },
      );
      if (error) throw error;
      if ((data as { error?: string })?.error) {
        throw new Error((data as { error: string }).error);
      }
      await loadFromDb(horizon);
      toast.success("IPO intelligence updated");
    } catch (e) {
      console.error(e);
      setRefreshError(String(e));
      toast.error("Refresh failed — cached data shown");
    } finally {
      setRefreshing(false);
    }
  };

  // Derived
  const sectors = useMemo(
    () => Array.from(new Set(rows.map((r) => r.sector))).sort(),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (sectorFilter !== "all" && r.sector !== sectorFilter) return false;
        if (tierFilter !== "all" && r.risk_tier !== tierFilter) return false;
        if (accreditedFilter === "required" && !r.accredited_required) return false;
        if (accreditedFilter === "not_required" && r.accredited_required) return false;
        return true;
      }),
    [rows, sectorFilter, tierFilter, accreditedFilter],
  );

  const summary = useMemo(() => {
    const total = filtered.length;
    const high = filtered.filter(
      (r) => r.risk_tier === "high" || r.risk_tier === "very_high",
    ).length;
    const accredited = filtered.filter((r) => r.accredited_required).length;
    const open = filtered.filter((r) => !r.accredited_required).length;
    return { total, high, accredited, open };
  }, [filtered]);

  const hasAnyData = rows.length > 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-background/70 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/terminal" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-400 to-fuchsia-500 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold tracking-tight text-sm">
              QuantForecast
            </span>
            <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-muted-foreground ml-1">
              IPO Intelligence
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <PlanBadge />
            <Link
              to="/pricing"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white hover:opacity-90 transition-opacity"
            >
              <Sparkles className="w-4 h-4" />
              Plans
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            IPO Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Pre-IPO companies scored by a deterministic risk model, refreshed
            on demand by an AI agent with live web search.
          </p>
        </div>

        {/* Horizon selector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {HORIZONS.map((h) => {
            const active = horizon === h.value;
            return (
              <button
                key={h.value}
                onClick={() => setHorizon(h.value)}
                className={`text-left rounded-xl border p-4 transition-colors ${
                  active
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <div className="font-semibold text-sm">{h.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {h.timeframe}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-2 leading-snug">
                  {h.description}
                </div>
              </button>
            );
          })}
        </div>

        {/* Focus input + refresh */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <input
            type="text"
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            placeholder="Narrow the search (optional) — e.g. 'defense tech' or 'fintech'"
            className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
          {canRefresh ? (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
              />
              {refreshing ? "Agent searching…" : "Refresh data"}
            </button>
          ) : (
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white hover:opacity-90"
            >
              <Sparkles className="w-4 h-4" />
              Upgrade to refresh
            </Link>
          )}
        </div>

        {/* Free-tier notice */}
        {!canRefresh && hasAnyData && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-sm px-4 py-3">
            Refresh requires Sector Intel or above —{" "}
            <Link to="/pricing" className="underline">
              see pricing
            </Link>
            .
          </div>
        )}

        {/* Refresh-error banner */}
        {refreshError && hasAnyData && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Last refresh failed. Showing previous data.</span>
          </div>
        )}

        {/* Summary bar */}
        {hasAnyData && (
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1">
              <SummaryTile label="Companies tracked" value={summary.total} />
              <SummaryTile label="High risk" value={summary.high} />
              <SummaryTile label="Accredited only" value={summary.accredited} />
              <SummaryTile label="Open to all" value={summary.open} />
            </div>
            <div className="text-xs text-muted-foreground md:ml-2">
              Data as of{" "}
              {lastRefreshed
                ? new Date(lastRefreshed).toLocaleString()
                : "—"}
            </div>
          </div>
        )}

        {/* Filters */}
        {hasAnyData && (
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="all">All sectors</option>
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <PillGroup
              label="Risk"
              options={[
                { value: "all", label: "All" },
                { value: "lower", label: "Lower" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
                { value: "very_high", label: "Very high" },
              ]}
              value={tierFilter}
              onChange={(v) => setTierFilter(v as typeof tierFilter)}
            />
            <PillGroup
              label="Access"
              options={[
                { value: "all", label: "All" },
                { value: "required", label: "Accredited" },
                { value: "not_required", label: "Open to all" },
              ]}
              value={accreditedFilter}
              onChange={(v) => setAccreditedFilter(v as typeof accreditedFilter)}
            />
          </div>
        )}

        {/* Table / empty state */}
        {loading ? (
          <div className="text-sm text-muted-foreground py-12 text-center">
            Loading…
          </div>
        ) : !hasAnyData ? (
          <EmptyState
            canRefresh={canRefresh}
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3">Company</th>
                    <th className="text-left px-4 py-3">Stage</th>
                    <th className="text-left px-4 py-3">Sector</th>
                    <th className="text-left px-4 py-3">Risk</th>
                    <th className="text-left px-4 py-3">Real business</th>
                    <th className="text-left px-4 py-3">Min. invest</th>
                    <th className="text-left px-4 py-3">Accredited?</th>
                    <th className="text-left px-4 py-3">Our view</th>
                    <th className="text-left px-4 py-3">Sources</th>
                    <th className="text-left px-4 py-3">Where to buy</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <RowLine
                      key={r.id}
                      row={r}
                      expanded={!!expanded[r.id]}
                      onToggleExpand={() =>
                        setExpanded((s) => ({ ...s, [r.id]: !s[r.id] }))
                      }
                      sourcesOpen={!!sourcesOpen[r.id]}
                      onToggleSources={() =>
                        setSourcesOpen((s) => ({ ...s, [r.id]: !s[r.id] }))
                      }
                    />
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td
                        colSpan={10}
                        className="text-center text-sm text-muted-foreground py-10"
                      >
                        No companies match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-xs text-muted-foreground leading-relaxed max-w-4xl">
          Risk scores are computed by a deterministic model from facts
          extracted by an AI agent with web search. Scores reflect the model's
          assessment of publicly available information at the time of the last
          refresh — they are not guaranteed to be accurate or complete. This
          is not investment advice. External links open third-party sites.
          QuantForecast is not affiliated with any linked platform.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function RowLine({
  row,
  expanded,
  onToggleExpand,
  sourcesOpen,
  onToggleSources,
}: {
  row: IpoRow;
  expanded: boolean;
  onToggleExpand: () => void;
  sourcesOpen: boolean;
  onToggleSources: () => void;
}) {
  const stage = STAGE_STYLES[row.stage] ?? STAGE_STYLES.rumored;
  const tier = TIER_COLORS[row.risk_tier];

  const business =
    row.raw_facts.revenueStatus === "profitable"
      ? { label: "✓ Profitable", className: "text-emerald-400" }
      : row.raw_facts.revenueStatus === "revenue_not_profitable"
      ? { label: "~ Revenue, not profitable", className: "text-amber-400" }
      : { label: "✗ Pre-revenue", className: "text-red-400" };

  const dimensions = [
    row.dimension_scores.revenueReality,
    row.dimension_scores.valuationFundamentals,
    row.dimension_scores.competitiveMoat,
    row.dimension_scores.exitCertainty,
    row.dimension_scores.illiquidityRisk,
  ];

  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-3 min-w-[220px]">
        <div className="font-semibold">{row.name}</div>
        <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
          {row.brief}
        </div>
        {row.ipo_timeline_note && (
          <div className="text-[11px] text-muted-foreground/80 mt-1">
            {row.ipo_timeline_note}
          </div>
        )}
      </td>

      <td className="px-4 py-3">
        <span
          className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border ${stage.className}`}
        >
          {stage.label}
        </span>
      </td>

      <td className="px-4 py-3">
        <span className="inline-block text-[11px] px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
          {row.sector}
        </span>
      </td>

      <td className="px-4 py-3 min-w-[160px]">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-help">
              <div className="w-full h-1.5 rounded bg-secondary overflow-hidden">
                <div
                  className={`h-full ${tier.bar}`}
                  style={{ width: `${row.risk_score}%` }}
                />
              </div>
              <div className={`text-[11px] mt-1 font-medium ${tier.text}`}>
                {row.risk_label} · {row.risk_score}/100
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-sm p-3 space-y-2">
            <div className="text-xs font-semibold">
              Overall: {row.risk_score}/100 — {row.risk_label}
            </div>
            {dimensions.map((d) => (
              <div key={d.dimension} className="text-[11px]">
                <div className="flex items-center justify-between font-medium">
                  <span>{d.dimension}</span>
                  <span className="text-muted-foreground">
                    {"●".repeat(d.score)}
                    {"○".repeat(d.maxScore - d.score)} {d.score}/{d.maxScore}
                  </span>
                </div>
                <div className="text-muted-foreground leading-snug">
                  {d.rationale}
                </div>
              </div>
            ))}
          </TooltipContent>
        </Tooltip>
      </td>

      <td className={`px-4 py-3 whitespace-nowrap text-xs ${business.className}`}>
        {business.label}
      </td>

      <td className="px-4 py-3 whitespace-nowrap text-xs">
        {row.min_investment || "—"}
      </td>

      <td className="px-4 py-3 whitespace-nowrap">
        {row.accredited_required ? (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
            Required
          </span>
        ) : (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            Not required
          </span>
        )}
      </td>

      <td className="px-4 py-3 max-w-xs">
        <div
          className={`text-xs text-muted-foreground ${
            expanded ? "" : "line-clamp-3"
          }`}
        >
          {row.our_view}
        </div>
        {row.our_view.length > 140 && (
          <button
            onClick={onToggleExpand}
            className="inline-flex items-center gap-1 text-[11px] text-primary mt-1 hover:underline"
          >
            {expanded ? (
              <>
                Less <ChevronUp className="w-3 h-3" />
              </>
            ) : (
              <>
                More <ChevronDown className="w-3 h-3" />
              </>
            )}
          </button>
        )}
      </td>

      <td className="px-4 py-3 min-w-[140px]">
        {row.sources?.length ? (
          <>
            <button
              onClick={onToggleSources}
              className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
            >
              {row.sources.length} source{row.sources.length === 1 ? "" : "s"}
              {sourcesOpen ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
            {sourcesOpen && (
              <ul className="mt-1 space-y-0.5">
                {row.sources.map((s, i) => (
                  <li key={i}>
                    <a
                      href={s}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-primary/90 hover:underline inline-flex items-center gap-1 break-all"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      {s.replace(/^https?:\/\//, "").slice(0, 42)}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <span className="text-[11px] text-muted-foreground">—</span>
        )}
      </td>

      <td className="px-4 py-3 min-w-[160px]">
        <div className="flex flex-wrap gap-1">
          {row.platforms?.length ? (
            row.platforms.map((p, i) => (
              <a
                key={i}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-secondary hover:bg-accent text-secondary-foreground"
              >
                {p.name}
                <ExternalLink className="w-3 h-3" />
              </a>
            ))
          ) : (
            <span className="text-[11px] text-muted-foreground">—</span>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function PillGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              value === o.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary text-secondary-foreground border-border hover:bg-accent"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyState({
  canRefresh,
  refreshing,
  onRefresh,
}: {
  canRefresh: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
      <Inbox className="w-8 h-8 mx-auto text-muted-foreground" />
      <div className="mt-3 text-sm font-medium">No data for this horizon yet.</div>
      {canRefresh ? (
        <>
          <div className="text-xs text-muted-foreground mt-1">
            Click Refresh data to let the AI agent search now.
          </div>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            <RefreshCw
              className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Agent searching…" : "Refresh data"}
          </button>
        </>
      ) : (
        <>
          <div className="text-xs text-muted-foreground mt-1">
            Refresh requires Sector Intel or above.
          </div>
          <Link
            to="/pricing"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white hover:opacity-90"
          >
            <Sparkles className="w-4 h-4" />
            See pricing
          </Link>
        </>
      )}
    </div>
  );
}
