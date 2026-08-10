// components/QuantAgent.tsx
// ─────────────────────────────────────────────────────────────────────────────
// QuantAgent — Claude Managed Agents powered financial analyst
//
// Architecture:
//   1. Init: browser → Supabase edge fn → creates Managed Agent session
//   2. Chat: browser → streams SSE directly from Anthropic
//      (no Supabase timeout risk — streaming goes browser↔Anthropic directly)
//
// Features:
//   - Claude Managed Agents with web search tool
//   - Persistent sessions per user+ticker (2hr cache)
//   - Real-time streaming responses
//   - Backtest context + live web search combined
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Copy, Check } from "lucide-react";

interface BacktestResult {
  signal: string;
  confidenceScore: number;
  walkForwardAccuracy: number;
  hitRate: number;
  regime: string;
  forecastPct: number;
  forecastLabel: string;
}

interface AgentContext {
  ticker: string;
  price?: number;
  rSquared?: number;
  annualReturn?: number;
  slope?: number;
  fundamentals?: Record<string, unknown>;
  website?: string;
  backtestResult?: BacktestResult;
}

interface Message {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: Date;
  thinking?: boolean;
  streaming?: boolean;
  suggestedActions?: QuantAgentAction[];
}

export type QuantAgentAction =
  | { kind: "switch_ticker"; symbol: string }
  | { kind: "navigate"; path: string }
  | { kind: "open"; target: "hot_stocks" | "sentiment" | "backtest" };

interface QuantAgentProps {
  context: AgentContext;
  onAction?: (action: QuantAgentAction) => void;
}

// Parse [[ACTION:...]] tags from a reply. Returns cleaned text + actions.
function parseActions(raw: string): { text: string; actions: QuantAgentAction[] } {
  const actions: QuantAgentAction[] = [];
  const cleaned = raw.replace(/\[\[ACTION:([a-z_]+):([^\]]+)\]\]/gi, (_m, kind: string, arg: string) => {
    const k = kind.toLowerCase();
    const v = arg.trim();
    if (k === "switch_ticker") actions.push({ kind: "switch_ticker", symbol: v.toUpperCase() });
    else if (k === "navigate") actions.push({ kind: "navigate", path: v.startsWith("/") ? v : `/${v}` });
    else if (k === "open" && (v === "hot_stocks" || v === "sentiment" || v === "backtest")) {
      actions.push({ kind: "open", target: v });
    }
    return "";
  }).trim();
  return { text: cleaned, actions };
}

// Did the user actually ask to be moved somewhere / to load a symbol?
// The model sometimes emits action tags for plain analysis questions, which
// yanked the user to a random page mid-conversation. We only auto-execute
// when the request is explicit; otherwise we offer it as a button.
function userRequestedNavigation(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(take me|bring me|go to|navigate|open|show me|switch to|switch ticker|load|pull up|jump to)\b/.test(t);
}

function actionLabel(a: QuantAgentAction): string {
  if (a.kind === "switch_ticker") return `Load ${a.symbol}`;
  if (a.kind === "open") return `Open ${a.target.replace("_", " ")}`;
  return `Go to ${a.path}`;
}

const QUICK_ACTIONS = [
  "Switch to NVDA",
  "Take me to my portfolio",
  "Open the Linkage Engine",
  "Explain the backtest result",
  "Show me Hot Stocks",
];



// ─── Markdown renderer for agent responses ────────────────────────────────────
// Handles: **bold**, tables (| col |), bullet lists, headers, line breaks
// Converts markdown tables to clean card-style display instead of pipe characters

function AgentMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Markdown table ──────────────────────────────────────────────────────
    // Detect table: line starts with | and has multiple |
    if (line.trim().startsWith("|") && line.includes("|", 1)) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }

      // Parse table rows — skip separator lines (---|---|)
      const rows = tableLines
        .filter(l => !l.replace(/[|\s-]/g, "").trim().match(/^-+$/))
        .map(l => l.split("|").map(c => c.trim()).filter(c => c !== ""));

      if (rows.length > 0) {
        const headers = rows[0];
        const dataRows = rows.slice(1);

        elements.push(
          <div key={i} className="mt-2 mb-2 flex flex-col gap-1.5">
            {dataRows.map((row, ri) => (
              <div key={ri} className="rounded-lg bg-muted/50 border border-border/40 px-3 py-2 flex flex-col gap-0.5">
                {headers.map((header, hi) => row[hi] ? (
                  <div key={hi} className="flex gap-2 items-start">
                    <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest shrink-0 w-16 pt-0.5">
                      {header.replace(/\*\*/g, "")}
                    </span>
                    <span className="text-[10px] font-mono text-foreground flex-1">
                      <InlineMarkdown text={row[hi]} />
                    </span>
                  </div>
                ) : null)}
              </div>
            ))}
          </div>
        );
      }
      continue;
    }

    // ── Headers (## or ###) ─────────────────────────────────────────────────
    if (line.startsWith("## ") || line.startsWith("### ")) {
      const text = line.replace(/^#+\s/, "");
      elements.push(
        <p key={i} className="text-[10px] font-mono font-semibold text-foreground uppercase tracking-widest mt-2 mb-0.5">
          {text}
        </p>
      );
      i++;
      continue;
    }

    // ── Bullet points ───────────────────────────────────────────────────────
    if (line.trimStart().startsWith("- ") || line.trimStart().startsWith("• ")) {
      const text = line.replace(/^\s*[-•]\s/, "");
      elements.push(
        <div key={i} className="flex gap-1.5 items-start">
          <span className="text-emerald-400 mt-0.5 shrink-0 text-[10px]">·</span>
          <span className="text-[10px] font-mono text-foreground leading-relaxed">
            <InlineMarkdown text={text} />
          </span>
        </div>
      );
      i++;
      continue;
    }

    // ── Empty line ──────────────────────────────────────────────────────────
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-1.5" />);
      i++;
      continue;
    }

    // ── Regular paragraph ───────────────────────────────────────────────────
    elements.push(
      <p key={i} className="text-[10px] font-mono text-foreground leading-relaxed">
        <InlineMarkdown text={line} />
      </p>
    );
    i++;
  }

  return <div className="flex flex-col gap-0.5">{elements}</div>;
}

// Handles inline **bold** and *italic* within a line
function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <em key={i} className="text-foreground">{part.slice(1, -1)}</em>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function MessageBubble({ msg, onRunAction }: { msg: Message; onRunAction?: (a: QuantAgentAction) => void }) {
  const isAgent = msg.role === "agent";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!msg.content) return;
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback: silently ignore
    }
  };

  return (
    <div className={`flex gap-2 ${isAgent ? "justify-start" : "justify-end"}`}>
      {isAgent && (
        <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-[10px]">🧠</span>
        </div>
      )}
      <div className={`relative group max-w-[85%] rounded-xl px-3 py-2 text-xs font-mono leading-relaxed ${
        isAgent
          ? "bg-muted/80 text-foreground border border-border/50"
          : "bg-sky-500/10 text-sky-300 border border-sky-500/20"
      }`}>
        {isAgent && !msg.thinking && (
          <button
            onClick={handleCopy}
            title={copied ? "Copied" : "Copy response"}
            className="absolute top-1.5 right-1.5 p-1 rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-muted/60 text-muted-foreground hover:text-foreground"
          >
            {copied ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        )}
        {msg.thinking ? (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1 h-1 rounded-full bg-emerald-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <span className="text-[10px]">Searching web + analyzing...</span>
          </div>
        ) : (
          <>
            <AgentMarkdown content={msg.content} />
            {!!msg.suggestedActions?.length && onRunAction && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {msg.suggestedActions.map((a, i) => (
                  <button
                    key={i}
                    onClick={() => onRunAction(a)}
                    className="px-2 py-1 rounded-md text-[10px] border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                  >
                    {actionLabel(a)}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function QuantAgent({ context, onAction }: QuantAgentProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [anthropicKey, setAnthropicKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open && sessionReady) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, sessionReady]);

  useEffect(() => {
    if (!open || sessionReady || initializing) return;
    initSession();
  }, [open]);

  // Clean up streaming on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  const initSession = async () => {
    setInitializing(true);
    try {
      // Step 1: Get agent + environment (cached)
      const { data: agentData, error: agentErr } = await supabase.functions.invoke("quant-agent", {
        body: { action: "get_or_create_agent", context, ticker: context.ticker },
      });
      if (agentErr) throw new Error(agentErr.message);

      // Step 2: Create chat session for this ticker
      const { data, error: sessionErr } = await supabase.functions.invoke("quant-agent", {
        body: {
          action: "create_session",
          agent_id: agentData.agent_id,
          environment_id: agentData.environment_id,
          ticker: context.ticker,
          purpose: "chat",
          context,
        },
      });
      if (sessionErr) throw new Error(sessionErr.message);

      setSessionId(data.session_id);
      setAnthropicKey(data.anthropic_api_key);
      setSessionReady(true);

      setMessages([{
        id: "greeting",
        role: "agent",
        content: data.greeting || `Ready to analyze ${context.ticker}. Ask me anything.`,
        timestamp: new Date(),
      }]);

    } catch (e) {
      setMessages([{
        id: "error",
        role: "agent",
        content: `Failed to initialize: ${(e as Error).message}`,
        timestamp: new Date(),
      }]);
      setSessionReady(true);
    } finally {
      setInitializing(false);
    }
  };

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading || !sessionId) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };

    const thinkingMsg: Message = {
      id: `thinking-${Date.now()}`,
      role: "agent",
      content: "",
      timestamp: new Date(),
      thinking: true,
    };

    setMessages(prev => [...prev, userMsg, thinkingMsg]);
    setInput("");
    setLoading(true);

    try {
      // All communication goes through Supabase edge function (avoids CORS)
      // The edge function sends the message AND polls for the response
      const history = messages
        .filter(m => !m.thinking && m.id !== "greeting")
        .map(m => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke("quant-agent", {
        body: {
          action: "send_message",
          session_id: sessionId,
          message: text.trim(),
          history,
          context,
          ticker: context.ticker,
        },
      });

      if (error) {
        // Surface allowance / fair-use messages in plain language.
        let friendly = error.message;
        try {
          const ctx = (error as unknown as { context?: Response }).context;
          const body = ctx ? await ctx.clone().json() : null;
          if (body?.code === "OUT_OF_CREDITS") {
            friendly =
              "You've used all your AI actions for this month. Upgrade your plan or wait for the reset on the 1st to keep asking.";
          } else if (body?.code === "SHARING_LIMIT") {
            friendly =
              "This login is active on too many devices. Plans are personal — sign out elsewhere or upgrade to continue.";
          } else if (body?.code === "AUTH_REQUIRED") {
            friendly = "Sign in to use QuantAgent.";
          } else if (body?.error) {
            friendly = body.error;
          }
        } catch {
          // keep original message
        }
        throw new Error(friendly);
      }


      // Handle expired session — reinitialize
      if (data?.error === "SESSION_EXPIRED") {
        setSessionReady(false);
        setSessionId(null);
        setMessages([{
          id: `expired-${Date.now()}`,
          role: "agent",
          content: "Session expired — starting a new one...",
          timestamp: new Date(),
        }]);
        await initSession();
        return;
      }

      const rawReply = data.response || "Analysis complete.";
      const { text: cleanReply, actions } = parseActions(rawReply);
      setMessages(prev => [
        ...prev.filter(m => !m.thinking),
        {
          id: `agent-${Date.now()}`,
          role: "agent",
          content: cleanReply || "Done.",
          timestamp: new Date(),
          streaming: false,
        },
      ]);
      if (actions.length && onAction) {
        // Execute after brief delay so user sees the confirmation text first
        setTimeout(() => actions.forEach(a => onAction(a)), 400);
      }

    } catch (e) {
      setMessages(prev => [
        ...prev.filter(m => !m.thinking),
        {
          id: `error-${Date.now()}`,
          role: "agent",
          content: `Error: ${(e as Error).message}`,
          timestamp: new Date(),
        }
      ]);
    } finally {
      setLoading(false);
    }
  }, [sessionId, context, loading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95"
        style={{
          background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
          boxShadow: "0 0 30px rgba(16,185,129,0.4), 0 4px 20px rgba(0,0,0,0.4)",
        }}
        title="QuantAgent — AI Financial Analyst"
      >
        <span className="text-xl">{open ? "✕" : "🧠"}</span>
        {!open && <span className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: "#10b981" }} />}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-96 flex flex-col rounded-2xl overflow-hidden"
          style={{
            height: "520px",
            background: "rgba(9,9,11,0.97)",
            border: "1px solid rgba(39,39,42,0.8)",
            boxShadow: "0 0 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(16,185,129,0.1)",
            backdropFilter: "blur(20px)",
          }}>

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/80"
            style={{ background: "rgba(16,185,129,0.05)" }}>
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <span className="text-sm">🧠</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono font-semibold text-foreground tracking-wide">QuantAgent</p>
              <p className="text-[10px] font-mono text-muted-foreground truncate">
                {sessionReady
                  ? `${context.ticker} · Claude Managed Agents · Web Search`
                  : initializing ? "Initializing Managed Agent session..." : "Starting..."}
              </p>
            </div>
            <div className={`w-2 h-2 rounded-full ${sessionReady ? "bg-emerald-400" : "bg-amber-400"} animate-pulse`} />
          </div>

          {/* Context bar */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 bg-card/30">
            <span className="text-[10px] font-mono text-muted-foreground">{context.ticker}</span>
            {context.price && <span className="text-[10px] font-mono text-muted-foreground">${context.price.toLocaleString()}</span>}
            {context.backtestResult && (
              <>
                <span className="text-muted-foreground text-[10px]">·</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    color: context.backtestResult.signal === "BUY" ? "#34d399" : context.backtestResult.signal === "SELL" ? "#f87171" : "#fbbf24",
                    background: context.backtestResult.signal === "BUY" ? "rgba(52,211,153,0.1)" : context.backtestResult.signal === "SELL" ? "rgba(248,113,113,0.1)" : "rgba(251,191,36,0.1)",
                  }}>
                  {context.backtestResult.signal} · {context.backtestResult.confidenceScore}/100
                </span>
              </>
            )}
            <span className="ml-auto text-[9px] font-mono text-muted-foreground">🔍 web search</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
            {initializing ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="w-6 h-6 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                <p className="text-[10px] font-mono text-muted-foreground animate-pulse text-center">
                  Starting Claude Managed Agent session...<br />Web search enabled
                </p>
              </div>
            ) : (
              <>
                {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {/* Quick actions */}
          {sessionReady && messages.length <= 2 && (
            <div className="px-3 pb-2 flex gap-1.5 flex-wrap">
              {QUICK_ACTIONS.slice(0, 3).map(action => (
                <button key={action} onClick={() => sendMessage(action)} disabled={loading}
                  className="text-[9px] font-mono px-2 py-1 rounded-lg border border-border text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-400 transition-all disabled:opacity-40 whitespace-nowrap">
                  {action}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-3 pb-3">
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2 focus-within:border-emerald-500/40 transition-colors">
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown} disabled={!sessionReady || loading}
                placeholder={sessionReady ? `Ask about ${context.ticker}...` : "Initializing..."}
                className="flex-1 bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground outline-none" />
              <button onClick={() => sendMessage(input)} disabled={!input.trim() || !sessionReady || loading}
                className="w-6 h-6 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                style={{ background: input.trim() ? "rgba(16,185,129,0.2)" : "transparent" }}>
                <span className="text-xs text-emerald-400">↑</span>
              </button>
            </div>
            <p className="text-[9px] font-mono text-muted-foreground text-center mt-1.5">
              Claude Managed Agents · Web search enabled · Sessions persist 2hrs
            </p>
          </div>
        </div>
      )}
    </>
  );
}
