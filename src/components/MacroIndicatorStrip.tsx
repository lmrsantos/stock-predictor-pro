import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { computeRegimeBadge, MacroIndicatorMap, RegimeTone } from "@/lib/regime-signal";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Activity } from "lucide-react";

type Row = {
  indicator_key: string;
  value: number | null;
  previous_value: number | null;
  change_30d: number | null;
  as_of_date: string | null;
  updated_at: string;
};

const TILE_ORDER: { key: string; label: string; fmt: (v: number) => string; deltaMode: "30d" | "prev" }[] = [
  { key: "cpi_yoy", label: "CPI YoY", fmt: (v) => `${v.toFixed(1)}%`, deltaMode: "prev" },
  { key: "fed_funds", label: "Fed Funds", fmt: (v) => `${v.toFixed(2)}%`, deltaMode: "prev" },
  { key: "us10y", label: "US 10Y", fmt: (v) => `${v.toFixed(2)}%`, deltaMode: "prev" },
  { key: "curve_10y2y", label: "10Y–2Y", fmt: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`, deltaMode: "prev" },
  { key: "vix", label: "VIX", fmt: (v) => v.toFixed(1), deltaMode: "prev" },
  { key: "wti", label: "WTI Crude", fmt: (v) => `$${v.toFixed(2)}`, deltaMode: "30d" },
  { key: "gold", label: "Gold", fmt: (v) => `$${v.toFixed(0)}`, deltaMode: "30d" },
  { key: "cape_proxy", label: "S&P 500 P/E", fmt: (v) => v.toFixed(1), deltaMode: "prev" },
];

const toneClasses: Record<RegimeTone, { pill: string; border: string; dot: string }> = {
  "risk-on": {
    pill: "bg-emerald-500/10 text-emerald-700 border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300",
    border: "border-l-emerald-500/70",
    dot: "bg-emerald-500 dark:bg-emerald-400",
  },
  "caution": {
    pill: "bg-amber-500/10 text-amber-700 border-amber-500/50 dark:bg-amber-500/15 dark:text-amber-300",
    border: "border-l-amber-500/70",
    dot: "bg-amber-500 dark:bg-amber-400",
  },
  "risk-off": {
    pill: "bg-rose-500/10 text-rose-700 border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300",
    border: "border-l-rose-500/70",
    dot: "bg-rose-500 dark:bg-rose-400",
  },
};

function useMacroIndicators() {
  return useQuery({
    queryKey: ["macro-indicators"],
    queryFn: async () => {
      // Trigger refresh (function returns fresh cache)
      const { data, error } = await supabase.functions.invoke("fetch-macro-indicators", { body: {} });
      if (!error && data?.indicators) return data.indicators as Row[];
      // Fallback: read cache directly
      const { data: cache } = await supabase.from("macro_indicators").select("*");
      return (cache ?? []) as Row[];
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function MacroIndicatorStrip() {
  const { data: rows, isLoading } = useMacroIndicators();

  const map: MacroIndicatorMap = useMemo(() => {
    const m: MacroIndicatorMap = {};
    (rows ?? []).forEach((r) => { m[r.indicator_key] = r; });
    return m;
  }, [rows]);

  const badge = useMemo(() => computeRegimeBadge(map), [map]);
  const contribKeys = new Set(badge.contributions.map((c) => c.key));

  const isStale = (r?: Row) => {
    if (!r?.updated_at) return true;
    return Date.now() - new Date(r.updated_at).getTime() > 24 * 60 * 60 * 1000;
  };

  return (
    <div className="w-full border-b border-border bg-background/60 backdrop-blur-xl">
      <div className="flex items-stretch gap-2 px-4 py-1.5 overflow-x-auto">
        <RegimeBadge badge={badge} />
        <div className="hidden md:grid grid-cols-8 gap-2 flex-1 min-w-0">
          {TILE_ORDER.map((t) => (
            <Tile
              key={t.key}
              def={t}
              row={map[t.key] as Row | undefined}
              contributor={contribKeys.has(t.key)}
              tone={badge.tone}
              stale={isStale(map[t.key] as Row | undefined)}
              loading={isLoading}
            />
          ))}
        </div>
        <div className="md:hidden flex gap-2">
          {TILE_ORDER.map((t) => (
            <Tile
              key={t.key}
              def={t}
              row={map[t.key] as Row | undefined}
              contributor={contribKeys.has(t.key)}
              tone={badge.tone}
              stale={isStale(map[t.key] as Row | undefined)}
              loading={isLoading}
              compact
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RegimeBadge({ badge }: { badge: ReturnType<typeof computeRegimeBadge> }) {
  const [open, setOpen] = useState(false);
  const cls = toneClasses[badge.tone];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-medium ${cls.pill}`}
          title="Macro regime signal"
        >
          <span className={`w-2 h-2 rounded-full ${cls.dot} animate-pulse`} />
          <Activity className="w-3.5 h-3.5" />
          <span className="whitespace-nowrap">{badge.label}</span>
          <span className="text-[10px] opacity-70">score {badge.score}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-xs">
        <div className="font-semibold mb-2">Regime score breakdown</div>
        {badge.contributions.length === 0 ? (
          <div className="text-muted-foreground">No stress signals — clean expansion regime.</div>
        ) : (
          <ul className="space-y-1">
            {badge.contributions.map((c) => (
              <li key={c.key} className="flex justify-between">
                <span>{c.label}</span>
                <span className="font-mono">+{c.points}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 pt-2 border-t border-border text-[10px] text-muted-foreground">
          0–1 Risk-on · 2–3 Caution · 4+ Risk-off
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Tile({
  def, row, contributor, tone, stale, loading, compact,
}: {
  def: typeof TILE_ORDER[number];
  row?: Row;
  contributor: boolean;
  tone: RegimeTone;
  stale: boolean;
  loading: boolean;
  compact?: boolean;
}) {
  const borderCls = contributor ? `border-l-2 ${toneClasses[tone].border}` : "border-l-2 border-l-transparent";
  const width = compact ? "min-w-[130px]" : "";

  if (loading && !row) {
    return (
      <div className={`${borderCls} ${width} px-3 py-2 rounded-md bg-secondary/40 animate-pulse`}>
        <div className="h-2 w-16 bg-muted rounded mb-2" />
        <div className="h-4 w-20 bg-muted rounded" />
      </div>
    );
  }

  const v = row?.value;
  let delta: number | null = null;
  if (def.deltaMode === "30d") delta = row?.change_30d ?? null;
  else if (row && row.value != null && row.previous_value != null) {
    delta = row.value - row.previous_value;
  }

  const deltaStr = delta == null ? "—" : def.deltaMode === "30d"
    ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% 30d`
    : `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;

  const deltaCls = delta == null ? "text-muted-foreground"
    : delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-muted-foreground";

  return (
    <div className={`${borderCls} ${width} px-3 py-1.5 rounded-md bg-secondary/30 hover:bg-secondary/50 transition-colors`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm uppercase tracking-wider text-muted-foreground truncate">{def.label}</div>
        <div className="text-sm font-mono font-semibold text-foreground whitespace-nowrap">
          {v != null && isFinite(v) ? def.fmt(v) : "—"}
        </div>
      </div>
      <div className={`flex items-center gap-1 text-[10px] font-mono ${deltaCls} truncate`}>
        <span>{deltaStr}</span>
        {row?.as_of_date && <span className="text-muted-foreground/70">· {row.as_of_date.slice(5)}</span>}
        {stale && <div className="w-1.5 h-1.5 rounded-full bg-amber-500/70 ml-auto" title="Data may be stale" />}
      </div>
    </div>
  );
}

