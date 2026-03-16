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

export function ChatBubble({ context }: ChatBubbleProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
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
    if (!ticker || !user || loading) return;
    if (prevTickerRef.current === ticker) return;
    
    // Skip the very first mount (default ticker)
    const isFirstMount = prevTickerRef.current === undefined;
    prevTickerRef.current = ticker;
    if (isFirstMount) return;

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
        if (error) throw error;
        setMessages([autoMessage, { role: "assistant", content: data.reply }]);
      } catch {
        setMessages([autoMessage, { role: "assistant", content: "Hmm, couldn't grab that info right now. Try asking again!" }]);
      } finally {
        setLoading(false);
      }
    })();
  }, [context?.ticker, user]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

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
        { role: "assistant", content: data.reply },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Give me a sec... try asking that again!",
        },
      ]);
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
                          <div className="prose prose-sm prose-invert max-w-none [&>p]:m-0">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        ) : (
                          msg.content
                        )}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="bg-secondary rounded-xl px-3 py-2 text-sm text-muted-foreground">
                        <span className="animate-pulse">thinking...</span>
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
                      disabled={loading}
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
