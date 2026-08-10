// components/PreInvestmentChecklist.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Per-symbol, per-user evidence worksheet.
//
// It NEVER produces a verdict, score, recommendation, traffic light, or a
// completion percentage presented as a quality signal.
//
//   • AUTO items are read-only facts with source + date. Never a checkbox.
//   • RESEARCH items keep a visible, persistent "not checked" state.
//   • JUDGMENT items are never pre-filled or suggested. Placeholders describe
//     the format only, never a number.
//   • auto_snapshot is captured once at creation and only overwritten when the
//     user explicitly confirms a refresh.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, X, FileDown, Table2, RefreshCw, Lock } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import {
  CHECKLIST_SECTIONS, NOT_CHECKED, countsFor, isBlank,
  type ChecklistItem, type UserEntries,
} from "@/lib/checklist-schema";
import {
  buildAutoSnapshot, emptySnapshot,
  type AutoSnapshot, type SnapshotInput,
} from "@/lib/checklist-snapshot";
import { exportChecklistExcel, exportChecklistPdf } from "@/lib/checklist-export";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { computeAdminVerdict } from "@/lib/admin-verdict";


interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Existing checklist to open. When absent, one is created for `symbol`. */
  checklistId?: string;
  symbol: string;
  snapshotInput?: SnapshotInput;
}

const TYPE_TAG: Record<ChecklistItem["type"], { label: string; cls: string }> = {
  auto:     { label: "AUTO",     cls: "bg-primary/10 text-primary" },
  research: { label: "RESEARCH", cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  judgment: { label: "JUDGMENT", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
};

function TypeTag({ type }: { type: ChecklistItem["type"] }) {
  const t = TYPE_TAG[type];
  return (
    <span className={`text-[8px] font-mono tracking-widest px-1.5 py-0.5 rounded ${t.cls}`}>
      {t.label}
    </span>
  );
}

/** Renders any http(s) URL inside an auto value as a clickable link. */
function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline break-all"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function AutoRow({ item, snapshot }: { item: ChecklistItem; snapshot: AutoSnapshot }) {
  const a = snapshot.values[item.id];
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${
      item.emphasise ? "border-primary/40 bg-primary/5" : "border-border/60 bg-muted/20"
    }`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-mono text-muted-foreground">{item.label}</span>
        <TypeTag type="auto" />
      </div>
      <div className={`text-[12px] font-mono mt-1 leading-relaxed whitespace-pre-line ${
        a?.available ? "text-foreground" : "text-muted-foreground italic"
      }`}>
        {a?.value == null ? "Not captured in this snapshot." : linkify(a.value)}
      </div>

      <p className="text-[9px] font-mono text-muted-foreground mt-1">
        Source: {a?.source ?? "—"} · as of {a?.asOf ?? "—"}
      </p>
    </div>
  );
}

function UserRow({
  item, value, readOnly, onChange, onCommit,
}: {
  item: ChecklistItem;
  value: string;
  readOnly: boolean;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  const notChecked = value === NOT_CHECKED;
  const blank = notChecked || isBlank(value);

  return (
    <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-mono text-foreground">{item.label}</span>
        <TypeTag type={item.type} />
        {blank && (
          <span className="text-[9px] font-mono text-muted-foreground">
            {notChecked ? "not checked" : "blank"}
          </span>
        )}
      </div>

      {item.kind === "yesno" ? (
        <div className="flex gap-2 mt-2">
          {["yes", "no"].map(opt => (
            <button
              key={opt}
              disabled={readOnly}
              onClick={() => { onChange(opt); onCommit(); }}
              className={`px-3 py-1 rounded-md text-[11px] font-mono border transition-colors disabled:opacity-50 ${
                value === opt
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : item.kind === "long" ? (
        <textarea
          rows={3}
          readOnly={readOnly}
          value={notChecked ? "" : value}
          placeholder={item.placeholder}
          onChange={e => onChange(e.target.value)}
          onBlur={onCommit}
          className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px] font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      ) : (
        <input
          readOnly={readOnly}
          value={notChecked ? "" : value}
          placeholder={item.placeholder}
          onChange={e => onChange(e.target.value)}
          onBlur={onCommit}
          className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px] font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      )}

      {item.type === "research" && (
        <button
          disabled={readOnly}
          onClick={() => { onChange(notChecked ? "" : NOT_CHECKED); onCommit(); }}
          className={`mt-2 text-[10px] font-mono underline disabled:opacity-50 ${
            notChecked ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
          }`}
        >
          {notChecked ? "I have now checked this" : "Mark as not checked"}
        </button>
      )}

      {item.note && (
        <p className="text-[10px] font-mono text-muted-foreground mt-2 leading-relaxed">{item.note}</p>
      )}
    </div>
  );
}

export function PreInvestmentChecklist({
  isOpen, onClose, checklistId, symbol, snapshotInput,
}: Props) {
  const { user } = useAuth();
  const sub = useSubscription();
  const canSave = sub.tier !== "free";
  const { isAdmin } = useIsAdmin();


  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [id, setId]             = useState<string | null>(checklistId ?? null);
  const [createdAt, setCreatedAt] = useState<string>(new Date().toISOString());
  const [snapshot, setSnapshot] = useState<AutoSnapshot>(() => emptySnapshot(symbol));
  const [entries, setEntries]   = useState<UserEntries>({});
  const [notes, setNotes]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);

  const readOnly = !canSave || !user;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ entries: UserEntries; notes: string }>({ entries: {}, notes: "" });
  latest.current = { entries, notes };

  // ── Load or create ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setConfirmRefresh(false);

    (async () => {
      try {
        if (checklistId) {
          const { data, error: e } = await supabase
            .from("checklists").select("*").eq("id", checklistId).maybeSingle();
          if (e) throw e;
          if (!data) throw new Error("Checklist not found.");
          if (cancelled) return;
          setId(data.id);
          setCreatedAt(data.created_at);
          setSnapshot((data.auto_snapshot as unknown as AutoSnapshot) ?? emptySnapshot(symbol));
          setEntries((data.user_entries as unknown as UserEntries) ?? {});
          setNotes(data.notes ?? "");
          setLoading(false);
          return;
        }

        const snap = snapshotInput
          ? await buildAutoSnapshot(snapshotInput)
          : emptySnapshot(symbol);
        if (cancelled) return;
        setSnapshot(snap);
        setEntries({});
        setNotes("");

        if (user && canSave) {
          const { data, error: e } = await supabase
            .from("checklists")
            .insert({
              user_id: user.id,
              ticker: symbol.toUpperCase(),
              auto_snapshot: snap as unknown as never,
              user_entries: {} as unknown as never,
            })
            .select("id, created_at")
            .single();
          if (e) throw e;
          if (cancelled) return;
          setId(data.id);
          setCreatedAt(data.created_at);
        }
        setLoading(false);
      } catch (e) {
        if (!cancelled) { setError((e as Error).message); setLoading(false); }
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, checklistId, symbol]);

  // ── Autosave: on blur, debounced 1s ────────────────────────────────────────
  const commit = useCallback(() => {
    if (!id || readOnly) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaving(true);
      const { entries: e, notes: n } = latest.current;
      await supabase.from("checklists")
        .update({ user_entries: e as unknown as never, notes: n })
        .eq("id", id);
      setSaving(false);
    }, 1000);
  }, [id, readOnly]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const setEntry = (itemId: string, v: string) =>
    setEntries(prev => ({ ...prev, [itemId]: v }));

  const refreshSnapshot = async () => {
    if (!snapshotInput) return;
    setRefreshing(true);
    try {
      const snap = await buildAutoSnapshot(snapshotInput);
      setSnapshot(snap);
      if (id && !readOnly) {
        await supabase.from("checklists")
          .update({ auto_snapshot: snap as unknown as never }).eq("id", id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
      setConfirmRefresh(false);
    }
  };

  const counts = useMemo(() => countsFor(entries), [entries]);
  const adminVerdict = useMemo(
    () => (isAdmin ? computeAdminVerdict(snapshot, snapshotInput) : null),
    [isAdmin, snapshot, snapshotInput],
  );


  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl p-0 bg-background border-border overflow-hidden">
        <div className="max-h-[85vh] overflow-y-auto">

          {/* HEADER */}
          <div className="sticky top-0 z-10 border-b border-border bg-card/60 backdrop-blur p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-mono font-bold text-foreground">
                  Pre-investment checklist — {symbol.toUpperCase()}
                </h2>
                <p className="text-[10px] font-mono text-muted-foreground mt-1">
                  Data as of {new Date(snapshot.capturedAt).toLocaleString()}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                  This worksheet gathers evidence. It gives no verdict, score, or recommendation.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {saving && <span className="text-[10px] font-mono text-muted-foreground">saving…</span>}
                <button onClick={onClose} aria-label="Close"
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              {snapshotInput && (
                confirmRefresh ? (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-2.5 py-1.5">
                    <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">
                      This overwrites the snapshot you worked against. Continue?
                    </span>
                    <button onClick={refreshSnapshot} disabled={refreshing}
                      className="text-[10px] font-mono underline text-foreground">
                      {refreshing ? "refreshing…" : "Overwrite"}
                    </button>
                    <button onClick={() => setConfirmRefresh(false)}
                      className="text-[10px] font-mono underline text-muted-foreground">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmRefresh(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-[10px] font-mono text-muted-foreground hover:text-foreground">
                    <RefreshCw className="w-3 h-3" /> Refresh snapshot
                  </button>
                )
              )}
              <button
                onClick={() => exportChecklistPdf({ ticker: symbol, snapshot, entries, notes, createdAt })}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-[10px] font-mono text-muted-foreground hover:text-foreground">
                <FileDown className="w-3 h-3" /> Export PDF
              </button>
              <button
                onClick={() => exportChecklistExcel({ ticker: symbol, snapshot, entries, notes, createdAt })}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-[10px] font-mono text-muted-foreground hover:text-foreground">
                <Table2 className="w-3 h-3" /> Export Excel
              </button>
            </div>

            {readOnly && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <Lock className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                <p className="text-[10px] font-mono text-muted-foreground leading-relaxed">
                  {user
                    ? <>You are previewing the checklist structure. Saving checklists is part of the paid plans — <Link to="/pricing" className="text-primary underline">see plans</Link>.</>
                    : <>You are previewing the checklist structure. <Link to="/auth" className="text-primary underline">Sign in</Link> to save one.</>}
                </p>
              </div>
            )}
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-xs font-mono text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Preparing checklist…
            </div>
          )}

          {error && !loading && (
            <div className="m-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs font-mono text-destructive">
              {error}
            </div>
          )}

          {!loading && (
            <div className="p-5 flex flex-col gap-6">
              {CHECKLIST_SECTIONS.map(section => (
                <section key={section.id} className="flex flex-col gap-2">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    {section.title}
                  </p>
                  {section.intro && (
                    <p className="text-[10px] font-mono text-muted-foreground leading-relaxed">
                      {section.intro}
                    </p>
                  )}

                  {section.items.map(item =>
                    item.type === "auto"
                      ? <AutoRow key={item.id} item={item} snapshot={snapshot} />
                      : (
                        <UserRow
                          key={item.id}
                          item={item}
                          value={entries[item.id] ?? ""}
                          readOnly={readOnly}
                          onChange={v => setEntry(item.id, v)}
                          onCommit={commit}
                        />
                      ),
                  )}

                  {section.special === "model_reading" && (
                    <p className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-[11px] font-mono text-foreground leading-relaxed">
                      {snapshot.modelReading}
                    </p>
                  )}

                  {section.special === "evidence_counts" && (
                    <div className="rounded-lg border border-border bg-card/30 p-3 space-y-1.5">
                      <p className="text-[11px] font-mono text-foreground">
                        Items auto-filled from live data: {snapshot.autoFilledCount}
                      </p>
                      <p className="text-[11px] font-mono text-foreground">
                        Research items still blank: {counts.researchBlank}
                      </p>
                      <p className="text-[11px] font-mono text-foreground">
                        Judgment items still blank: {counts.judgmentBlank}
                      </p>
                      <p className="text-[11px] font-mono text-foreground">
                        Concerns flagged: {snapshot.concerns.length}
                      </p>
                      {snapshot.concerns.length > 0 && (
                        <ul className="pt-2 space-y-1">
                          {snapshot.concerns.map((c, i) => (
                            <li key={i} className="text-[11px] font-mono text-muted-foreground leading-relaxed">
                              • {c}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </section>
              ))}

              <section className="flex flex-col gap-2">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Notes</p>
                <textarea
                  rows={4}
                  readOnly={readOnly}
                  value={notes}
                  placeholder="Anything else you want on the record"
                  onChange={e => setNotes(e.target.value)}
                  onBlur={commit}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px] font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </section>

              <p className="text-[10px] font-mono text-muted-foreground leading-relaxed border-t border-border pt-3">
                Nothing in this worksheet is advice, and it deliberately reaches no conclusion.
                The evidence is assembled here; the decision is yours.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
