import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, LogIn } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  role: "user" | "assistant";
  content: string;
  isTyping?: boolean; // true while typewriter is animating
}

interface ChatContext {
  ticker?: string;
  price?: number;
  rSquared?: number;
  annualReturn?: number;
  slope?: number;
  fundamentals?: any;
}

interface ChatBubbleProps {
  context?: ChatContext;
}

// Typewriter: reveals text char-by-char with human-like timing
function useTypewriter(fullText: string, active: boolean, onDone: () => void) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    if (!active || !fullText) return;
    setDisplayed("");
    indexRef.current = 0;

    const tick = () => {
      const i = indexRef.current;
      if (i >= fullText.length) {
        onDone();
        return;
      }
      const char = fullText[i];
      indexRef.current = i + 1;
      setDisplayed(fullText.slice(0, i + 1));

      // Variable speed: pause at punctuation, faster on spaces
      let delay = 18 + Math.random() * 22; // base 18-40ms
      if (char === '.' || char === '!' || char === '?') delay = 180 + Math.random() * 120;
      else if (char === ',') delay = 80 + Math.random() * 60;
      else if (char === ' ') delay = 10 + Math.random() * 15;
      else if (char === '\n') delay = 100 + Math.random() * 80;

      setTimeout(tick, delay);
    };

    // Initial brief pause before typing starts
    const t = setTimeout(tick, 300 + Math.random() * 200);
    return () => clearTimeout(t);
  }, [fullText, active]);

  return displayed;
}

function TypewriterMessage({ content, onDone }: { content: string; onDone: () => void }) {
  const displayed = useTypewriter(content, true, onDone);

  return (
    <div className="prose prose-sm prose-invert max-w-none [&>p]:m-0">
      <ReactMarkdown>{displayed}</ReactMarkdown>
      <span className="inline-block w-[2px] h-[14px] bg-primary ml-0.5 animate-pulse align-text-bottom" />
    </div>
  );
}

export function ChatBubble({ context }: ChatBubbleProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false); // typewriter in progress
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevTickerRef = useRef<string | undefined>(undefined);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  useEffect(() => {
    if (open && inputRef.current && user) {
      inputRef.current.focus();
    }
  }, [open, user]);

  // Auto-open and fetch insight when ticker changes
  useEffect(() => {
    const ticker = context?.ticker;
    if (!ticker || !user) return;
    if (prevTickerRef.current === ticker) return;
    
    // Skip the very first mount (default ticker)
    const isFirstMount = prevTickerRef.current === undefined;
    prevTickerRef.current = ticker;
    if (isFirstMount) return;

    let cancelled = false;

    // Clear previous conversation and auto-fetch insight
    const autoMessage: Message = { role: "user", content: `Give me a quick overview of ${ticker}` };
    setMessages([autoMessage]);
    setOpen(true);
    setLoading(true);

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("chat-insights", {
          body: { messages: [autoMessage], context },
        });
        if (cancelled) return;
        if (error) throw error;
        setMessages([autoMessage, { role: "assistant", content: data.reply, isTyping: true }]);
        setTyping(true);
      } catch {
        if (cancelled) return;
        setMessages([autoMessage, { role: "assistant", content: "Hmm, couldn't grab that info right now. Try asking again!", isTyping: true }]);
        setTyping(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [context?.ticker, user]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || typing) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("chat-insights", {
        body: {
          messages: newMessages,
          context,
        },
      });

      if (error) throw error;

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, isTyping: true },
      ]);
      setTyping(true);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Give me a sec... try asking that again!",
          isTyping: true,
        },
      ]);
      setTyping(true);
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, context]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating button */}
      <motion.button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
        whileTap={{ scale: 0.95 }}
        aria-label="Chat"
      >
        {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 z-50 w-[360px] max-h-[500px] rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-sm font-mono font-bold text-foreground">
                Market Insights
              </span>
              <span className="text-[10px] text-muted-foreground ml-auto uppercase tracking-wider">
                Not financial advice
              </span>
            </div>

            {!user ? (
              /* Login gate */
              <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
                <MessageCircle className="w-10 h-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground text-center">
                  Sign in to chat with our Market Insights Specialist
                </p>
                <button
                  onClick={() => navigate("/auth")}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  Sign in
                </button>
              </div>
            ) : (
              <>
                {/* Messages */}
                <div
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-none"
                  style={{ minHeight: 200, maxHeight: 360 }}
                >
                  {messages.length === 0 && (
                    <div className="text-center py-8 space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Hey! Ask me anything about markets, tickers, or trends.
                      </p>
                      {context?.ticker && (
                        <p className="text-xs text-muted-foreground">
                          I can see you're looking at{" "}
                          <span className="text-primary font-mono font-bold">
                            {context.ticker}
                          </span>
                        </p>
                      )}
                    </div>
                  )}
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {msg.role === "assistant" ? (
                          msg.isTyping ? (
                            <TypewriterMessage
                              content={msg.content}
                              onDone={() => {
                                setTyping(false);
                                setMessages((prev) =>
                                  prev.map((m, j) =>
                                    j === i ? { ...m, isTyping: false } : m
                                  )
                                );
                              }}
                            />
                          ) : (
                            <div className="prose prose-sm prose-invert max-w-none [&>p]:m-0">
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                          )
                        ) : (
                          msg.content
                        )}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="bg-secondary rounded-xl px-3 py-2 text-sm text-muted-foreground flex items-center gap-1.5">
                        <span className="flex gap-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Input */}
                <div className="p-3 border-t border-border">
                  <div className="flex gap-2">
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask about a ticker or trend..."
                      className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                      disabled={loading || typing}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!input.trim() || loading}
                      className="px-3 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
