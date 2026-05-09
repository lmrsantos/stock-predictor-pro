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
}

interface QuantAgentProps {
  context: AgentContext;
}

const QUICK_ACTIONS = [
  "Should I buy this stock right now?",
  "Search for latest news on this stock",
  "What are the key risks?",
  "Explain the backtest result",
  "Give me a 3-month price forecast",
];

function MessageBubble({ msg }: { msg: Message }) {
  const isAgent = msg.role === "agent";
  return (
    <div className={`flex gap-2 ${isAgent ? "justify-start" : "justify-end"}`}>
      {isAgent && (
        <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-[10px]">🧠</span>
        </div>
      )}
      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs font-mono leading-relaxed ${
        isAgent
          ? "bg-zinc-800/80 text-zinc-200 border border-zinc-700/50"
          : "bg-sky-500/10 text-sky-300 border border-sky-500/20"
      }`}>
        {msg.thinking ? (
          <div className="flex items-center gap-1.5 text-zinc-500">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1 h-1 rounded-full bg-emerald-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <span className="text-[10px]">Searching web + analyzing...</span>
          </div>
        ) : (
          <span style={{ whiteSpace: "pre-wrap" }}>
            {msg.content}
            {msg.streaming && <span className="animate-pulse">▊</span>}
          </span>
        )}
      </div>
    </div>
  );
}

export function QuantAgent({ context }: QuantAgentProps) {
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
      const { data, error } = await supabase.functions.invoke("quant-agent", {
        body: {
          action: "get_or_create_agent",
          context,
          ticker: context.ticker,
        },
      });

      if (error) throw new Error(error.message);

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
      // Step 1: Send message event via Supabase edge fn
      const { data, error } = await supabase.functions.invoke("quant-agent", {
        body: {
          action: "send_message",
          session_id: sessionId,
          message: text.trim(),
          context,
          ticker: context.ticker,
        },
      });

      if (error) throw new Error(error.message);

      const key = data.anthropic_api_key || anthropicKey;
      if (!key) throw new Error("No API key available for streaming");

      // Step 2: Stream response directly from Anthropic SSE
      const agentMsgId = `agent-${Date.now()}`;
      setMessages(prev => [
        ...prev.filter(m => !m.thinking),
        { id: agentMsgId, role: "agent", content: "", timestamp: new Date(), streaming: true },
      ]);

      abortRef.current = new AbortController();
      let fullResponse = "";
      let attempts = 0;
      const maxAttempts = 20;

      // Poll for events since SSE may not work in all environments
      const pollForResponse = async () => {
        while (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 2000));
          attempts++;

          const eventsRes = await fetch(
            `https://api.anthropic.com/v1/beta/sessions/${sessionId}/events?limit=20&order=desc`,
            {
              headers: {
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "anthropic-beta": "managed-agents-2026-04-01",
              },
              signal: abortRef.current?.signal,
            }
          );

          if (!eventsRes.ok) throw new Error(`Events fetch failed: ${eventsRes.status}`);
          const eventsData = await eventsRes.json();
          const events = (eventsData.data || []).reverse();

          for (const event of events) {
            if (event.type === "agent.message" && event.content) {
              for (const block of event.content) {
                if (block.type === "text" && block.text) {
                  fullResponse = block.text;
                  // Update message with latest content
                  setMessages(prev => prev.map(m =>
                    m.id === agentMsgId
                      ? { ...m, content: fullResponse, streaming: true }
                      : m
                  ));
                }
              }
            }
            if (event.type === "session.status_idle" || event.status === "idle") {
              // Done — finalize message
              setMessages(prev => prev.map(m =>
                m.id === agentMsgId
                  ? { ...m, content: fullResponse || "Analysis complete.", streaming: false }
                  : m
              ));
              return;
            }
          }
        }
        // Timeout — show whatever we got
        setMessages(prev => prev.map(m =>
          m.id === agentMsgId
            ? { ...m, content: fullResponse || "Response timed out. Please try again.", streaming: false }
            : m
        ));
      };

      await pollForResponse();

    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setMessages(prev => [
        ...prev.filter(m => !m.thinking && !m.streaming),
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
  }, [sessionId, anthropicKey, context, loading]);

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
          <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/80"
            style={{ background: "rgba(16,185,129,0.05)" }}>
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <span className="text-sm">🧠</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono font-semibold text-zinc-100 tracking-wide">QuantAgent</p>
              <p className="text-[10px] font-mono text-zinc-500 truncate">
                {sessionReady
                  ? `${context.ticker} · Claude Managed Agents · Web Search`
                  : initializing ? "Initializing Managed Agent session..." : "Starting..."}
              </p>
            </div>
            <div className={`w-2 h-2 rounded-full ${sessionReady ? "bg-emerald-400" : "bg-amber-400"} animate-pulse`} />
          </div>

          {/* Context bar */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800/50 bg-zinc-900/30">
            <span className="text-[10px] font-mono text-zinc-500">{context.ticker}</span>
            {context.price && <span className="text-[10px] font-mono text-zinc-400">${context.price.toLocaleString()}</span>}
            {context.backtestResult && (
              <>
                <span className="text-zinc-700 text-[10px]">·</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    color: context.backtestResult.signal === "BUY" ? "#34d399" : context.backtestResult.signal === "SELL" ? "#f87171" : "#fbbf24",
                    background: context.backtestResult.signal === "BUY" ? "rgba(52,211,153,0.1)" : context.backtestResult.signal === "SELL" ? "rgba(248,113,113,0.1)" : "rgba(251,191,36,0.1)",
                  }}>
                  {context.backtestResult.signal} · {context.backtestResult.confidenceScore}/100
                </span>
              </>
            )}
            <span className="ml-auto text-[9px] font-mono text-zinc-600">🔍 web search</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
            {initializing ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="w-6 h-6 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                <p className="text-[10px] font-mono text-zinc-500 animate-pulse text-center">
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
                  className="text-[9px] font-mono px-2 py-1 rounded-lg border border-zinc-700 text-zinc-400 hover:border-emerald-500/40 hover:text-emerald-400 transition-all disabled:opacity-40 whitespace-nowrap">
                  {action}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-3 pb-3">
            <div className="flex items-center gap-2 rounded-xl border border-zinc-700/60 bg-zinc-900/60 px-3 py-2 focus-within:border-emerald-500/40 transition-colors">
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown} disabled={!sessionReady || loading}
                placeholder={sessionReady ? `Ask about ${context.ticker}...` : "Initializing..."}
                className="flex-1 bg-transparent text-xs font-mono text-zinc-200 placeholder-zinc-600 outline-none" />
              <button onClick={() => sendMessage(input)} disabled={!input.trim() || !sessionReady || loading}
                className="w-6 h-6 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                style={{ background: input.trim() ? "rgba(16,185,129,0.2)" : "transparent" }}>
                <span className="text-xs text-emerald-400">↑</span>
              </button>
            </div>
            <p className="text-[9px] font-mono text-zinc-700 text-center mt-1.5">
              Claude Managed Agents · Web search enabled · Sessions persist 2hrs
            </p>
          </div>
        </div>
      )}
    </>
  );
}
