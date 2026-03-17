import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Globe, AlertTriangle, Shield, Flame, Skull, ChevronDown, ChevronUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface KeyEvent {
  region: string;
  event: string;
  impact: string;
}

interface SentimentData {
  id: string;
  tension_score: number;
  severity: string;
  summary: string;
  key_events: KeyEvent[];
  created_at: string;
}

const severityConfig: Record<string, { icon: typeof Globe; colorClass: string; bgClass: string }> = {
  low: { icon: Shield, colorClass: "text-accent-profit", bgClass: "bg-accent-profit/10" },
  moderate: { icon: Globe, colorClass: "text-yellow-500", bgClass: "bg-yellow-500/10" },
  elevated: { icon: AlertTriangle, colorClass: "text-orange-500", bgClass: "bg-orange-500/10" },
  high: { icon: Flame, colorClass: "text-accent-danger", bgClass: "bg-accent-danger/10" },
  severe: { icon: Skull, colorClass: "text-red-600", bgClass: "bg-red-600/10" },
};

const impactColors: Record<string, string> = {
  low: "bg-accent-profit/20 text-accent-profit",
  medium: "bg-orange-500/20 text-orange-500",
  high: "bg-accent-danger/20 text-accent-danger",
};

export function GeopoliticalSentiment() {
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadSentiment();

    // Realtime
    const channel = supabase
      .channel("geo-sentiment")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "geopolitical_sentiment" },
        (payload) => setSentiment(payload.new as SentimentData)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadSentiment = async () => {
    // First check DB for recent
    const { data: existing } = await supabase
      .from("geopolitical_sentiment")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);

    if (existing?.length) {
      setSentiment(existing[0] as unknown as SentimentData);
      setIsLoading(false);
    }

    // Trigger generation (will be rate-limited server-side)
    try {
      const { data } = await supabase.functions.invoke("geopolitical-sentiment");
      if (data?.sentiment) {
        setSentiment(data.sentiment as SentimentData);
      }
    } catch {
      // Silent fail
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!sentiment) return null;

  const config = severityConfig[sentiment.severity] || severityConfig.moderate;
  const Icon = config.icon;
  const events = (sentiment.key_events || []) as KeyEvent[];

  return (
    <div className="space-y-2">
      <label className="label-upper flex items-center gap-1.5">
        <Globe className="w-3.5 h-3.5" />
        Global Tension Index
      </label>

      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full ${config.bgClass} rounded-lg p-3 border border-border/50 text-left transition-colors hover:opacity-90`}
      >
        {/* Score bar */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className={`w-4 h-4 ${config.colorClass}`} />
            <span className={`text-2xl font-mono font-black ${config.colorClass}`}>
              {sentiment.tension_score}
            </span>
            <span className={`text-[10px] font-mono font-bold uppercase ${config.colorClass}`}>
              {sentiment.severity}
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </div>

        {/* Tension bar */}
        <div className="w-full h-1.5 bg-background/50 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${
              sentiment.tension_score > 80 ? "bg-red-600" :
              sentiment.tension_score > 60 ? "bg-accent-danger" :
              sentiment.tension_score > 40 ? "bg-orange-500" :
              sentiment.tension_score > 20 ? "bg-yellow-500" :
              "bg-accent-profit"
            }`}
            style={{ width: `${sentiment.tension_score}%` }}
          />
        </div>

        {/* Summary */}
        <p className="text-[11px] text-foreground/80 mt-2 leading-relaxed">
          {sentiment.summary}
        </p>
      </button>

      {/* Expanded events */}
      {expanded && events.length > 0 && (
        <div className="space-y-1.5 pl-1">
          {events.map((evt, i) => (
            <div
              key={i}
              className="flex items-start gap-2 p-2 bg-secondary/50 rounded border border-border/30"
            >
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${impactColors[evt.impact] || impactColors.medium}`}>
                {evt.impact?.toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-mono font-bold text-muted-foreground">
                  {evt.region}
                </span>
                <p className="text-[11px] text-foreground/80 leading-snug">
                  {evt.event}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
