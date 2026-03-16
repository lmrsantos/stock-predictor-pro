import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Newspaper, Sparkles, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

interface MarketUpdate {
  id: string;
  content: string;
  ticker: string | null;
  signal_type: string;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface MarketFeedProps {
  currentTicker: string;
}

export function MarketFeed({ currentTicker }: MarketFeedProps) {
  const [updates, setUpdates] = useState<MarketUpdate[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem("mf_admin_key") || "");
  const [showAdmin, setShowAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(() => !!localStorage.getItem("mf_admin_key"));

  // Fetch existing updates
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("market_updates")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setUpdates(data);
    };
    load();
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("market-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "market_updates" },
        (payload) => {
          setUpdates((prev) => [payload.new as MarketUpdate, ...prev].slice(0, 30));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const generateUpdate = async (forTicker?: string) => {
    if (!adminKey) {
      toast.error("Enter admin key first");
      return;
    }
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-market-update", {
        body: { ticker: forTicker || null, adminKey },
      });
      if (error) throw error;
      if (data?.error) {
        if (data.error === "Unauthorized") {
          toast.error("Invalid admin key");
          return;
        }
        throw new Error(data.error);
      }
      toast.success("Market update published!");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAdminKeySubmit = () => {
    if (adminKey.trim()) {
      localStorage.setItem("mf_admin_key", adminKey.trim());
      setIsAdmin(true);
      setShowAdmin(false);
      toast.success("Admin key saved");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="label-upper flex items-center gap-1.5">
          <Newspaper className="w-3.5 h-3.5" />
          Live Market Feed
        </label>
        <button
          onClick={() => setShowAdmin(!showAdmin)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Admin"
        >
          <Lock className="w-3 h-3" />
        </button>
      </div>

      {/* Admin panel */}
      {showAdmin && (
        <div className="p-2 bg-secondary rounded-lg space-y-2">
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdminKeySubmit()}
            placeholder="Admin key"
            className="w-full bg-background border border-border rounded px-2 py-1 text-xs input-focus"
          />
          <button
            onClick={handleAdminKeySubmit}
            className="w-full text-xs bg-primary text-primary-foreground rounded py-1 hover:opacity-90 transition-opacity"
          >
            Save Key
          </button>
        </div>
      )}

      {/* Generate buttons (admin only) */}
      {isAdmin && (
        <div className="flex gap-1.5">
          <button
            onClick={() => generateUpdate(currentTicker)}
            disabled={isGenerating}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-primary/10 text-primary rounded text-[10px] font-mono hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {isGenerating ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            {currentTicker}
          </button>
          <button
            onClick={() => generateUpdate()}
            disabled={isGenerating}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-accent/50 text-foreground rounded text-[10px] font-mono hover:bg-accent transition-colors disabled:opacity-50"
          >
            {isGenerating ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            General
          </button>
        </div>
      )}

      {/* Feed */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {updates.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No updates yet
          </p>
        ) : (
          updates.map((u) => (
            <div
              key={u.id}
              className="p-2.5 bg-secondary/50 rounded-lg border border-border/50 space-y-1"
            >
              <div className="flex items-center justify-between">
                {u.ticker && (
                  <span className="text-[10px] font-mono font-bold text-primary">
                    ${u.ticker}
                  </span>
                )}
                {!u.ticker && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    MARKET
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {timeAgo(u.created_at)}
                </span>
              </div>
              <p className="text-xs text-foreground/90 leading-relaxed">
                {u.content}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
