// components/QuantAgent.tsx
// QuantAgent — Claude (Messages API) + web search, history managed client-side.

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
          <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
        )}
      </div>
    </div>
  );
}

export function QuantAgent({ context }: QuantAgentProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  // Anthropic-format history (role + string content)
  const historyRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [ready, setReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { if (open && ready) setTimeout(() => inputRef.current?.focus(), 100); }, [open, ready]);

  useEffect(() => {
    if (!open || ready || initializing) return;
    (async () => {
      setInitializing(true);
      try {
        const { data, error } = await supabase.functions.invoke("quant-agent", {
          body: { action: "init", context },
        });
        if (error) throw new Error(error.message);
        historyRef.current = [];
        setMessages([{
          id: "greeting",
          role: "agent",
          content: data?.greeting || `Ready to analyze ${context.ticker}.`,
          timestamp: new Date(),
        }]);
        setReady(true);
      } catch (e) {
        setMessages([{
          id: "error",
          role: "agent",
          content: `Failed to initialize: ${(e as Error).message}`,
          timestamp: new Date(),
        }]);
        setReady(true);
      } finally {
        setInitializing(false);
      }
    })();
  }, [open, ready, initializing, context]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading || !ready) return;

    const userMsg: Message = { id: `user-${Date.now()}`, role: "user", content: trimmed, timestamp: new Date() };
    const thinkingMsg: Message = { id: `thinking-${Date.now()}`, role: "agent", content: "", timestamp: new Date(), thinking: true };
    setMessages(prev => [...prev, userMsg, thinkingMsg]);
    setInput("");
    setLoading(true);

    const nextHistory = [...historyRef.current, { role: "user" as const, content: trimmed }];

    try {
      const { data, error } = await supabase.functions.invoke("quant-agent", {
        body: { action: "chat", messages: nextHistory, context },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const reply = data?.reply || "No response.";
      historyRef.current = [...nextHistory, { role: "assistant", content: reply }];

      setMessages(prev => [
        ...prev.filter(m => !m.thinking),
        { id: `agent-${Date.now()}`, role: "agent", content: reply, timestamp: new Date() },
      ]);
    } catch (e) {
      setMessages(prev => [
        ...prev.filter(m => !m.thinking),
        { id: `error-${Date.now()}`, role: "agent", content: `Error: ${(e as Error).message}`, timestamp: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading, ready, context]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  return (
    <>
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

      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-96 flex flex-col rounded-2xl overflow-hidden"
          style={{
            height: "520px",
            background: "rgba(9,9,11,0.97)",
            border: "1px solid rgba(39,39,42,0.8)",
            boxShadow: "0 0 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(16,185,129,0.1)",
            backdropFilter: "blur(20px)",
          }}>
          <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/80"
            style={{ background: "rgba(16,185,129,0.05)" }}>
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <span className="text-sm">🧠</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono font-semibold text-zinc-100 tracking-wide">QuantAgent</p>
              <p className="text-[10px] font-mono text-zinc-500 truncate">
                {ready ? `${context.ticker} · Claude · Web Search` : initializing ? "Initializing..." : "Starting..."}
              </p>
            </div>
            <div className={`w-2 h-2 rounded-full ${ready ? "bg-emerald-400" : "bg-amber-400"} animate-pulse`} />
          </div>

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

          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
            {initializing ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="w-6 h-6 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                <p className="text-[10px] font-mono text-zinc-500 animate-pulse text-center">Starting...</p>
              </div>
            ) : (
              <>
                {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {ready && messages.length <= 2 && (
            <div className="px-3 pb-2 flex gap-1.5 flex-wrap">
              {QUICK_ACTIONS.slice(0, 3).map(action => (
                <button key={action} onClick={() => sendMessage(action)} disabled={loading}
                  className="text-[9px] font-mono px-2 py-1 rounded-lg border border-zinc-700 text-zinc-400 hover:border-emerald-500/40 hover:text-emerald-400 transition-all disabled:opacity-40 whitespace-nowrap">
                  {action}
                </button>
              ))}
            </div>
          )}

          <div className="px-3 pb-3">
            <div className="flex items-center gap-2 rounded-xl border border-zinc-700/60 bg-zinc-900/60 px-3 py-2 focus-within:border-emerald-500/40 transition-colors">
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown} disabled={!ready || loading}
                placeholder={ready ? `Ask about ${context.ticker}...` : "Initializing..."}
                className="flex-1 bg-transparent text-xs font-mono text-zinc-200 placeholder-zinc-600 outline-none" />
              <button onClick={() => sendMessage(input)} disabled={!input.trim() || !ready || loading}
                className="w-6 h-6 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                style={{ background: input.trim() ? "rgba(16,185,129,0.2)" : "transparent" }}>
                <span className="text-xs text-emerald-400">↑</span>
              </button>
            </div>
            <p className="text-[9px] font-mono text-zinc-700 text-center mt-1.5">
              Claude · Web search enabled
            </p>
          </div>
        </div>
      )}
    </>
  );
}
