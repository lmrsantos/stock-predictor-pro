// components/QuantAgent.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Replaces ChatBubble with a Claude Managed Agent powered financial analyst.
//
// Uses Claude Managed Agents API (beta: managed-agents-2026-04-01):
//   - Persistent sessions per user+ticker (agent remembers past conversations)
//   - Memory store: user risk profile, past backtest results, watchlist
//   - Web search + Moody's MCP for live fundamental data
//   - claude-opus-4-7 for financial reasoning
//   - Dreaming: agent self-improves from past sessions in background
//
// Drop-in replacement for ChatBubble — same props, smarter agent.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentContext {
  ticker: string;
  price?: number;
  rSquared?: number;
  annualReturn?: number;
  slope?: number;
  fundamentals?: Record<string, unknown>;
  website?: string;
  backtestResult?: {
    confidenceScore: number;
    signal: string;
    walkForwardAccuracy: number;
    hitRate: number;
    regime: string;
    forecastPct: number;
  };
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

// ─── Supabase edge function caller ────────────────────────────────────────────
// All Managed Agent API calls are proxied through a Supabase edge function
// to keep the Anthropic API key server-side only.

async function callAgentProxy(action: string, payload: Record<string, unknown>) {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.functions.invoke("quant-agent", {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  return data;
}

// ─── Message bubble ───────────────────────────────────────────────────────────

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
            <span className="text-[10px]">Analyzing...</span>
          </div>
        ) : (
          <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
        )}
      </div>
    </div>
  );
}

// ─── Quick action pills ───────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  "Should I buy this stock right now?",
  "What are the key risks?",
  "Compare to sector average",
  "Explain the backtest result",
  "What's the fair value estimate?",
];

// ─── Main component ───────────────────────────────────────────────────────────

export function QuantAgent({ context }: QuantAgentProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open && sessionReady) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, sessionReady]);

  // Initialize agent session when panel opens
  useEffect(() => {
    if (!open || sessionReady || initializing) return;
    initSession();
  }, [open]);

  const initSession = async () => {
    setInitializing(true);
    try {
      // 1. Create or retrieve the persistent agent for financial analysis
      const agentRes = await callAgentProxy("get_or_create_agent", {
        name: "QuantForecast Financial Analyst",
        model: "claude-opus-4-7",
        system: buildSystemPrompt(context),
      });
      setAgentId(agentRes.agent_id);

      // 2. Start a session tied to this ticker (sessions are per ticker per user)
      const sessionRes = await callAgentProxy("create_session", {
        agent_id: agentRes.agent_id,
        ticker: context.ticker,
        context,
      });
      setSessionId(sessionRes.session_id);
      setSessionReady(true);

      // 3. Show a greeting that reflects the current stock context
      const greeting = buildGreeting(context, sessionRes.is_returning);
      setMessages([{
        id: "greeting",
        role: "agent",
        content: greeting,
        timestamp: new Date(),
      }]);

      // 4. If returning session, load recent message history
      if (sessionRes.is_returning && sessionRes.recent_messages?.length) {
        setMessages(prev => [
          ...prev,
          ...sessionRes.recent_messages.map((m: { role: string; content: string }, i: number) => ({
            id: `history-${i}`,
            role: m.role as "user" | "agent",
            content: m.content,
            timestamp: new Date(),
          }))
        ]);
      }
    } catch (e) {
      setMessages([{
        id: "error",
        role: "agent",
        content: `Failed to initialize agent: ${(e as Error).message}. Falling back to standard chat.`,
        timestamp: new Date(),
      }]);
      setSessionReady(true); // allow fallback chat
    } finally {
      setInitializing(false);
    }
  };

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

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
      const res = await callAgentProxy("send_message", {
        session_id: sessionId,
        agent_id: agentId,
        message: text.trim(),
        context,
      });

      setMessages(prev => [
        ...prev.filter(m => !m.thinking),
        {
          id: `agent-${Date.now()}`,
          role: "agent",
          content: res.response,
          timestamp: new Date(),
        }
      ]);
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
  }, [sessionId, agentId, context, loading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95"
        style={{
          background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
          boxShadow: "0 0 30px rgba(16,185,129,0.4), 0 4px 20px rgba(0,0,0,0.4)",
        }}
        title="QuantAgent — AI Financial Analyst"
      >
        <span className="text-xl">{open ? "✕" : "🧠"}</span>
        {/* Pulse ring when not open */}
        {!open && (
          <span className="absolute inset-0 rounded-full animate-ping opacity-20"
            style={{ background: "#10b981" }} />
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 w-96 flex flex-col rounded-2xl overflow-hidden"
          style={{
            height: "520px",
            background: "rgba(9,9,11,0.97)",
            border: "1px solid rgba(39,39,42,0.8)",
            boxShadow: "0 0 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(16,185,129,0.1)",
            backdropFilter: "blur(20px)",
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/80"
            style={{ background: "rgba(16,185,129,0.05)" }}>
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <span className="text-sm">🧠</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono font-semibold text-zinc-100 tracking-wide">
                QuantAgent
              </p>
              <p className="text-[10px] font-mono text-zinc-500 truncate">
                {sessionReady
                  ? `Analyzing ${context.ticker} · Claude Opus 4.7`
                  : initializing
                  ? "Initializing persistent session..."
                  : "Starting up..."}
              </p>
            </div>
            <div className={`w-2 h-2 rounded-full ${sessionReady ? "bg-emerald-400" : "bg-amber-400"} animate-pulse`} />
          </div>

          {/* Context bar */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800/50 bg-zinc-900/30">
            <span className="text-[10px] font-mono text-zinc-500">
              {context.ticker}
            </span>
            {context.price && (
              <span className="text-[10px] font-mono text-zinc-400">
                ${context.price.toLocaleString()}
              </span>
            )}
            {context.backtestResult && (
              <>
                <span className="text-zinc-700 text-[10px]">·</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    color: context.backtestResult.signal === "BUY" ? "#34d399"
                      : context.backtestResult.signal === "SELL" ? "#f87171" : "#fbbf24",
                    background: context.backtestResult.signal === "BUY" ? "rgba(52,211,153,0.1)"
                      : context.backtestResult.signal === "SELL" ? "rgba(248,113,113,0.1)" : "rgba(251,191,36,0.1)",
                  }}>
                  {context.backtestResult.signal} · {context.backtestResult.confidenceScore.toFixed(0)}/100
                </span>
              </>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
            {initializing ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="w-6 h-6 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                <p className="text-[10px] font-mono text-zinc-500 animate-pulse text-center">
                  Starting persistent agent session<br />with Claude Opus 4.7...
                </p>
              </div>
            ) : (
              <>
                {messages.map(msg => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {/* Quick actions */}
          {sessionReady && messages.length <= 2 && (
            <div className="px-3 pb-2 flex gap-1.5 flex-wrap">
              {QUICK_ACTIONS.slice(0, 3).map(action => (
                <button
                  key={action}
                  onClick={() => sendMessage(action)}
                  disabled={loading}
                  className="text-[9px] font-mono px-2 py-1 rounded-lg border border-zinc-700 text-zinc-400 hover:border-emerald-500/40 hover:text-emerald-400 transition-all disabled:opacity-40 whitespace-nowrap"
                >
                  {action}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-3 pb-3">
            <div className="flex items-center gap-2 rounded-xl border border-zinc-700/60 bg-zinc-900/60 px-3 py-2 focus-within:border-emerald-500/40 transition-colors">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!sessionReady || loading}
                placeholder={sessionReady ? `Ask about ${context.ticker}...` : "Initializing..."}
                className="flex-1 bg-transparent text-xs font-mono text-zinc-200 placeholder-zinc-600 outline-none"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || !sessionReady || loading}
                className="w-6 h-6 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                style={{ background: input.trim() ? "rgba(16,185,129,0.2)" : "transparent" }}
              >
                <span className="text-xs text-emerald-400">↑</span>
              </button>
            </div>
            <p className="text-[9px] font-mono text-zinc-700 text-center mt-1.5">
              Powered by Claude Managed Agents · Memory persists across sessions
            </p>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx: AgentContext): string {
  return `You are QuantAgent, a professional quantitative financial analyst embedded in the QuantForecast platform.

You have deep expertise in:
- Statistical analysis and regression modeling
- Technical analysis and price action
- Risk management and portfolio construction  
- Options, ETFs, bonds, REITs, and alternative investments
- Macro economics and sector rotation

Current stock context:
- Ticker: ${ctx.ticker}
- Current Price: ${ctx.price ? `$${ctx.price}` : "N/A"}
${ctx.annualReturn ? `- Projected Annual Return (regression): ${(ctx.annualReturn * 100).toFixed(1)}%` : ""}
${ctx.rSquared ? `- R² (trend reliability): ${ctx.rSquared.toFixed(3)}` : ""}
${ctx.backtestResult ? `- Backtest Signal: ${ctx.backtestResult.signal}
- Backtest Confidence: ${ctx.backtestResult.confidenceScore.toFixed(0)}/100
- Walk-Forward Accuracy: ${ctx.backtestResult.walkForwardAccuracy.toFixed(1)}%
- Direction Hit Rate: ${ctx.backtestResult.hitRate.toFixed(1)}%
- Market Regime: ${ctx.backtestResult.regime}
- Forecasted Move: ${ctx.backtestResult.forecastPct > 0 ? "+" : ""}${ctx.backtestResult.forecastPct.toFixed(1)}%` : ""}

Your memory store contains:
- The user's risk profile and investment preferences (built over time)
- Past conversations and recommendations for this ticker
- Other tickers the user has analyzed
- Portfolio context if shared

Guidelines:
- Be direct and specific — give actionable insights, not vague disclaimers
- Reference the backtest data when relevant
- Flag risks clearly but don't over-hedge every statement
- Remember context from previous sessions with this user
- If you don't have enough information, ask one focused question
- Keep responses concise — 2-4 sentences for simple questions, structured for complex ones
- Always end with a clear bottom line when asked for a recommendation

You are NOT a licensed financial advisor. Always note this when giving specific investment recommendations.`;
}

function buildGreeting(ctx: AgentContext, isReturning: boolean): string {
  if (isReturning) {
    return `Welcome back. I remember our previous analysis of ${ctx.ticker}${ctx.price ? ` — currently at $${ctx.price.toLocaleString()}` : ""}. What would you like to explore today?`;
  }

  if (ctx.backtestResult) {
    const signal = ctx.backtestResult.signal;
    const confidence = ctx.backtestResult.confidenceScore.toFixed(0);
    const color = signal === "BUY" ? "bullish" : signal === "SELL" ? "bearish" : "cautious";
    return `I've loaded the backtest results for ${ctx.ticker}. The model is ${color} with a ${confidence}/100 confidence score and ${ctx.backtestResult.hitRate.toFixed(0)}% directional accuracy. What would you like to know?`;
  }

  return `I'm ready to analyze ${ctx.ticker}${ctx.price ? ` at $${ctx.price.toLocaleString()}` : ""}. Run a backtest first for deeper insights, or ask me anything about this stock.`;
}
