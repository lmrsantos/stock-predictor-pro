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

const severityConfig: Record<string, { icon: typeof Globe; label: string; gradient: string; textColor: string; barColor: string; borderColor: string }> = {
  low: {
    icon: Shield, label: "LOW",
    gradient: "from-emerald-50 to-green-50", textColor: "text-emerald-700",
    barColor: "bg-emerald-500", borderColor: "border-emerald-200",
  },
  moderate: {
    icon: Globe, label: "MODERATE",
    gradient: "from-yellow-50 to-amber-50", textColor: "text-yellow-700",
    barColor: "bg-yellow-500", borderColor: "border-yellow-200",
  },
  elevated: {
    icon: AlertTriangle, label: "ELEVATED",
    gradient: "from-orange-50 to-amber-50", textColor: "text-orange-700",
    barColor: "bg-orange-500", borderColor: "border-orange-200",
  },
  high: {
    icon: Flame, label: "HIGH",
    gradient: "from-red-50 to-orange-50", textColor: "text-red-600",
    barColor: "bg-red-500", borderColor: "border-red-200",
  },
  severe: {
    icon: Skull, label: "SEVERE",
    gradient: "from-red-100 to-red-50", textColor: "text-red-700",
    barColor: "bg-red-600", borderColor: "border-red-300",
  },
};

const impactBadge: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-700 border-emerald-200",
  medium: "bg-orange-100 text-orange-700 border-orange-200",
  high: "bg-red-100 text-red-700 border-red-200",
};

export function GeopoliticalSentiment() {
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadSentiment();

    const channel = supabase
      .channel("geo-sentiment")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "geopolitical_sentiment" },
        (payload) => setSentiment(payload.new as unknown as SentimentData)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadSentiment = async () => {
    const { data: existing } = await supabase
      .from("geopolitical_sentiment")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);

    if (existing?.length) {
      setSentiment(existing[0] as unknown as SentimentData);
      setIsLoading(false);
    }

    try {
      const { data } = await supabase.functions.invoke("geopolitical-sentiment");
      if (data?.sentiment) {
        setSentiment(data.sentiment as unknown as SentimentData);
      }
    } catch {
      // Silent fail
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full" />
          </div>
          <Skeleton className="h-12 w-16 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!sentiment) return null;

  const config = severityConfig[sentiment.severity] || severityConfig.moderate;
  const Icon = config.icon;
  const events = (sentiment.key_events || []) as KeyEvent[];

  return (
    <div className={`rounded-xl border ${config.borderColor} bg-gradient-to-r ${config.gradient} overflow-hidden transition-all duration-300`}>
      {/* Main banner */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left flex items-center gap-4 hover:opacity-95 transition-opacity"
      >
        {/* Icon */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${config.textColor} bg-white/60 shadow-sm`}>
          <Icon className="w-5 h-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-bold tracking-wider text-muted-foreground">
              GLOBAL TENSION INDEX
            </span>
            <span className="inline-flex items-center h-4 px-1 rounded bg-white/40 text-[9px]">
              🔴 LIVE
            </span>
          </div>
          <p className="text-sm text-foreground/80 leading-snug truncate">
            {sentiment.summary}
          </p>
        </div>

        {/* Score */}
        <div className="flex-shrink-0 flex flex-col items-center">
          <span className={`text-3xl font-mono font-black ${config.textColor} leading-none`}>
            {sentiment.tension_score}
          </span>
          <span className={`text-[10px] font-mono font-bold tracking-widest ${config.textColor} mt-0.5`}>
            {config.label}
          </span>
        </div>

        {/* Expand icon */}
        <div className="flex-shrink-0 ml-1">
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Tension bar */}
      <div className="px-4 pb-3">
        <div className="w-full h-2 bg-white/50 rounded-full overflow-hidden shadow-inner">
          <div
            className={`h-full rounded-full ${config.barColor} transition-all duration-1000 shadow-sm`}
            style={{ width: `${sentiment.tension_score}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[9px] font-mono text-muted-foreground/60">
          <span>0 · CALM</span>
          <span>50 · ELEVATED</span>
          <span>100 · SEVERE</span>
        </div>
      </div>

      {/* Expanded events */}
      {expanded && events.length > 0 && (
        <div className="px-4 pb-4 border-t border-white/40">
          <div className="grid gap-2 mt-3 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((evt, i) => (
              <div
                key={i}
                className="flex items-start gap-2 p-2.5 bg-white/60 rounded-lg border border-white/80 shadow-sm"
              >
                <span className={`flex-shrink-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${impactBadge[evt.impact] || impactBadge.medium}`}>
                  {evt.impact?.toUpperCase()}
                </span>
                <div className="min-w-0">
                  <span className="text-[10px] font-mono font-bold text-foreground/60 block">
                    {evt.region}
                  </span>
                  <p className="text-xs text-foreground/80 leading-snug mt-0.5">
                    {evt.event}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
