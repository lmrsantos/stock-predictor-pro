// components/ThematicBadge.tsx
// Shows active macro themes for a ticker inline in the UI
import { getThemeSummary } from "@/lib/thematic-intelligence";

interface ThematicBadgeProps {
  ticker: string;
  compact?: boolean;
}

export function ThematicBadge({ ticker, compact = false }: ThematicBadgeProps) {
  const summary = getThemeSummary(ticker);
  if (!summary.hasThemes) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Themes:</span>
        {summary.badges.slice(0, 2).map((badge, i) => (
          <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
            {badge}
          </span>
        ))}
        {summary.themeCount > 2 && (
          <span className="text-[9px] font-mono text-zinc-500">+{summary.themeCount - 2} more</span>
        )}
        {summary.boost > 0 && (
          <span className="text-[9px] font-mono text-emerald-400">+{summary.boost}pts</span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-sky-800/30 bg-sky-950/20 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-mono uppercase tracking-widest text-sky-400">
          🌊 Active Macro Themes — Ripple Effect
        </p>
        <span className="text-[10px] font-mono text-emerald-400 font-semibold">
          +{summary.boost}pts confidence
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {summary.badges.map((badge, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs font-mono px-2 py-1 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
              {badge}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[9px] font-mono text-zinc-600 leading-relaxed">
        This stock sits in the path of active macro themes. QuantAgent will factor these
        into its analysis alongside current news.
      </p>
    </div>
  );
}
