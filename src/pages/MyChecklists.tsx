// pages/MyChecklists.tsx
// Saved pre-investment checklists for the signed-in user. Counts only — no
// score, no verdict, no completion percentage presented as quality.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PreInvestmentChecklist } from "@/components/PreInvestmentChecklist";
import { countsFor, type UserEntries } from "@/lib/checklist-schema";
import type { AutoSnapshot } from "@/lib/checklist-snapshot";

interface Row {
  id: string;
  ticker: string;
  status: string;
  created_at: string;
  updated_at: string;
  auto_snapshot: unknown;
  user_entries: unknown;
}

export default function MyChecklists() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<{ id: string; ticker: string } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?redirect=/my-checklists");
  }, [authLoading, user, navigate]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("checklists")
      .select("id, ticker, status, created_at, updated_at, auto_snapshot, user_entries")
      .order("updated_at", { ascending: false });
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => { if (user) void load(); }, [user]);

  const remove = async (id: string) => {
    await supabase.from("checklists").delete().eq("id", id);
    setRows(prev => prev.filter(r => r.id !== id));
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto p-6 lg:p-10">
        <Link to="/account" className="text-sm text-muted-foreground flex items-center gap-1 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to account
        </Link>
        <h1 className="text-3xl font-bold mb-1">My checklists</h1>
        <p className="text-muted-foreground text-sm mb-8">
          Each checklist keeps the data snapshot from the day you worked on it.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No saved checklists yet. Open any symbol in the terminal and use
            “Pre-investment checklist” at the bottom of the detail view.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map(r => {
              const snap = (r.auto_snapshot ?? {}) as AutoSnapshot;
              const c = countsFor((r.user_entries ?? {}) as UserEntries);
              return (
                <li key={r.id} className="rounded-xl border border-border p-4 flex items-start justify-between gap-4">
                  <button className="text-left min-w-0" onClick={() => setOpen({ id: r.id, ticker: r.ticker })}>
                    <div className="font-mono font-bold">{r.ticker}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Last edited {new Date(r.updated_at).toLocaleString()} · {r.status.replace("_", " ")}
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground mt-1">
                      {snap.autoFilledCount ?? 0} auto-filled · {c.researchBlank} research blank ·{" "}
                      {c.judgmentBlank} judgment blank · {snap.concerns?.length ?? 0} concerns
                    </div>
                  </button>
                  <button onClick={() => remove(r.id)} aria-label="Delete checklist"
                    className="p-2 rounded-md text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {open && (
        <PreInvestmentChecklist
          isOpen
          checklistId={open.id}
          symbol={open.ticker}
          onClose={() => { setOpen(null); void load(); }}
        />
      )}
    </div>
  );
}
