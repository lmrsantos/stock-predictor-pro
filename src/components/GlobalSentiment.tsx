import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { InfoTooltip, metricInfo } from "./InfoTooltip";
import { Globe } from "lucide-react";

interface SentimentRow {
  tension_score: number;
  severity: string;
  summary: string;
  key_events: { event: string; region: string; impact: string }[] | null;
  created_at: string;
}

function severityColor(severity: string) {
  switch (severity.toLowerCase()) {
    case "high":
      return "text-accent-danger";
    case "moderate":
    case "medium":
      return "text-amber-500";
    case "low":
      return "text-emerald-500";
    default:
      return "text-muted-foreground";
  }
}

export function GlobalSentiment() {
  const { data, isLoading } = useQuery({
    queryKey: ["geopolitical-sentiment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("geopolitical_sentiment")
        .select("tension_score, severity, summary, key_events, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as SentimentRow | null;
    },
    staleTime: 30 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="stat-card animate-pulse space-y-2">
        <div className="h-3 w-24 bg-muted rounded" />
        <div className="h-6 w-12 bg-muted rounded" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-3">
      <div className="stat-card">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Globe className="w-3.5 h-3.5" />
          Global Sentiment
          <InfoTooltip {...metricInfo.globalSentiment} />
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-mono font-semibold">
            {data.tension_score}
          </span>
          <span className="text-xs text-muted-foreground">/ 100</span>
          <span className={`text-xs font-medium uppercase ${severityColor(data.severity)}`}>
            {data.severity}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          {data.summary}
        </p>
        {data.key_events && data.key_events.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Key Events
            </div>
            <ul className="space-y-1.5">
              {data.key_events.slice(0, 3).map((event, idx) => (
                <li key={idx} className="text-xs text-muted-foreground leading-snug flex gap-2">
                  <span className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
                  <span>
                    <span className="font-medium text-foreground">{event.region}</span>
                    {" — "}{event.event}
                    <span className={`text-[10px] uppercase ml-1 ${severityColor(event.impact)}`}>
                      ({event.impact})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="text-[10px] text-muted-foreground mt-3">
          Updated {new Date(data.created_at).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}
