import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ChevronRight, RotateCcw, TrendingUp, Shield, Coins, Zap } from "lucide-react";
import {
  classifyRegime,
  buildAllocation,
  getReEntryTriggers,
  getAvoidList,
  type InvestorProfile,
  type PortfolioRecommendation,
  type AllocationBucket,
} from "@/lib/portfolio-engine";

// ─── Intake Questions ─────────────────────────────────────────────────────────

interface Question {
  id:      keyof InvestorProfile | "amount_input";
  text:    string;
  sub?:    string;
  options: { label: string; value: string | boolean | number | null; emoji: string }[];
}

const QUESTIONS: Question[] = [
  {
    id: "horizon",
    text: "When do you need this money?",
    sub: "This determines your liquidity requirements",
    options: [
      { label: "Within 1 year", value: "short",  emoji: "⚡" },
      { label: "1–5 years",     value: "medium", emoji: "📅" },
      { label: "5+ years",      value: "long",   emoji: "🏔️" },
    ],
  },
  {
    id: "riskBehavior",
    text: "If your portfolio dropped 20% tomorrow, what would you do?",
    sub: "Be honest — this reveals your true risk tolerance",
    options: [
      { label: "Sell everything — protect what I have", value: "sell", emoji: "🚪" },
      { label: "Hold and wait for recovery",            value: "hold", emoji: "⏳" },
      { label: "Buy more — great opportunity",          value: "buy",  emoji: "💪" },
    ],
  },
  {
    id: "incomeNeeded",
    text: "Do you need monthly income from your investments?",
    sub: "Dividends, coupons, or distributions",
    options: [
      { label: "Yes — I rely on investment income", value: true,  emoji: "💰" },
      { label: "No — I reinvest everything",        value: false, emoji: "📈" },
    ],
  },
  {
    id: "taxAdvantaged",
    text: "What type of account are you investing in?",
    sub: "Affects which instruments are most efficient",
    options: [
      { label: "IRA / 401(k) / Roth — tax-advantaged", value: true,  emoji: "🏛️" },
      { label: "Regular brokerage — taxable",           value: false, emoji: "📋" },
    ],
  },
  {
    id: "canLockFunds",
    text: "Can you lock funds for 3–12 months?",
    sub: "CDs offer higher rates but restrict access",
    options: [
      { label: "Yes — I have separate emergency funds", value: true,  emoji: "🔒" },
      { label: "No — I need full liquidity",            value: false, emoji: "💧" },
    ],
  },
  {
    id: "amount_input",
    text: "How much are you looking to invest?",
    sub: "Optional — helps us give specific dollar amounts",
    options: [
      { label: "Under $10,000",    value: 5000,   emoji: "💵" },
      { label: "$10k – $50k",      value: 25000,  emoji: "💵💵" },
      { label: "$50k – $200k",     value: 100000, emoji: "💵💵💵" },
      { label: "Over $200k",       value: 500000, emoji: "🏦" },
      { label: "Prefer not to say", value: null,  emoji: "🤐" },
    ],
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function RegimeBadge({ regime }: { regime: RegimeAssessment }) {
  const analogs = regime.analogs ?? [];
  return (
    <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 dark:border-amber-800/40 dark:bg-amber-950/20 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-mono font-bold text-amber-900 dark:text-amber-300">{regime.label}</span>
        <span className="text-[10px] font-mono text-amber-800 dark:text-amber-400 whitespace-nowrap">
          {regime.confidence}% confidence
        </span>
      </div>
      <p className="text-[11px] font-mono text-foreground/80 leading-relaxed">{regime.description}</p>

      {analogs.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[9px] font-mono uppercase tracking-widest text-amber-800 dark:text-amber-400">
            Closest historical analogs
          </p>
          {analogs.map((a) => (
            <div key={a.id} className="rounded-lg border border-border/60 bg-background/60 p-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono font-semibold text-foreground">
                  {a.years} · {a.name}
                </span>
                <span className="text-[10px] font-mono text-foreground/70">{a.similarity}% match</span>
              </div>
              <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-500 dark:bg-amber-400"
                  style={{ width: `${a.similarity}%` }}
                />
              </div>
              {a.drivers.length > 0 && (
                <p className="text-[9px] font-mono text-muted-foreground leading-relaxed">
                  Matching: {a.drivers.join(" · ")}
                </p>
              )}
              <p className="text-[9px] font-mono text-muted-foreground leading-relaxed">
                Then: {a.outcome}
              </p>
            </div>
          ))}
          <p className="text-[9px] font-mono text-muted-foreground leading-relaxed pt-0.5">
            Matches are scored across inflation, real rates, curve shape, energy stress, valuation,
            volatility, geopolitics, gold bid, index concentration and credit stress — recomputed from live data.
          </p>
        </div>
      )}
    </div>
  );
}


function BucketCard({ bucket }: { bucket: AllocationBucket }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-all"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{bucket.emoji}</span>
          <div className="text-left">
            <p className="text-sm font-mono font-semibold text-foreground">{bucket.name}</p>
            <p className="text-[10px] font-mono text-muted-foreground">
              {bucket.amount ? `$${bucket.amount.toLocaleString()} · ` : ""}{bucket.pct}% of portfolio
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${bucket.pct}%` }}
            />
          </div>
          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-4 space-y-3">
          <p className="text-[10px] font-mono text-muted-foreground leading-relaxed">{bucket.rationale}</p>
          <div className="space-y-2">
            {bucket.instruments.map(({ instrument, pct, amount }) => (
              <div key={instrument.ticker} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-primary w-16">{instrument.ticker}</span>
                  <div>
                    <p className="text-[10px] font-mono text-foreground">{instrument.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {instrument.yield && (
                        <span className="text-[9px] font-mono text-emerald-400">{instrument.yield}% yield</span>
                      )}
                      {instrument.fdic && (
                        <span className="text-[9px] font-mono text-sky-400 px-1 py-0.5 rounded bg-sky-500/10">FDIC</span>
                      )}
                      <span className="text-[9px] font-mono text-muted-foreground">{instrument.liquidity}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-mono font-bold text-foreground">{pct}%</p>
                  {amount && <p className="text-[9px] font-mono text-muted-foreground">${amount.toLocaleString()}</p>}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[9px] font-mono text-muted-foreground italic">{bucket.instruments[0]?.instrument.rationale}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const ACK_KEY = "qf_advisor_ack_v1";
const ACK_VERSION = "2026-06-28";
const ACK_TEXT =
  "I understand this is educational content only, not investment advice, and I accept full responsibility for my own investment decisions.";

export function PortfolioAdvisor() {
  const [acknowledged, setAcknowledged] = useState<boolean>(
    () => typeof window !== "undefined" && localStorage.getItem(ACK_KEY) === "1"
  );
  const [ackSaving, setAckSaving] = useState(false);
  const [ackChecked, setAckChecked] = useState(false);
  const [step, setStep]           = useState<"intake" | "loading" | "result" | "chat">("intake");
  const [questionIdx, setQuestionIdx] = useState(0);
  const [profile, setProfile]     = useState<Partial<InvestorProfile>>({ exclusions: [] });
  const [recommendation, setRec]  = useState<PortfolioRecommendation | null>(null);
  const [macroCtx, setMacroCtx]   = useState<Record<string, number | boolean | string> | null>(null);
  const [chatMsg, setChatMsg]      = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [advisorResponse, setAdvisorResponse] = useState("");

  const currentQ = QUESTIONS[questionIdx];

  const handleAnswer = async (value: string | boolean | number | null) => {
    const key = currentQ.id === "amount_input" ? "amount" : currentQ.id;
    const updated = { ...profile, [key]: value };
    setProfile(updated);

    if (questionIdx < QUESTIONS.length - 1) {
      setQuestionIdx(questionIdx + 1);
    } else {
      // All questions answered — build recommendation
      setStep("loading");
      await buildRecommendation(updated as InvestorProfile);
    }
  };

  const buildRecommendation = async (p: InvestorProfile) => {
    try {
      // Fetch live macro data
      const { data: macroData } = await supabase.functions.invoke("portfolio-advisor", {
        body: { action: "fetch_macro_context" },
      });
      setMacroCtx(macroData);

      // Classify regime
      const regime = classifyRegime(
        macroData.oilPrice,
        macroData.goldPrice,
        macroData.capeRatio,
        macroData.geoScore,
        macroData.bondYieldRising,
      );

      // Build allocation
      const buckets  = buildAllocation(regime, p);
      const triggers = getReEntryTriggers(regime);
      const avoid    = getAvoidList(regime, p);

      const rec: PortfolioRecommendation = {
        regime,
        profile: p,
        buckets,
        totalPct: buckets.reduce((s, b) => s + b.pct, 0),
        reEntryTriggers: triggers,
        avoidList: avoid,
        summary: `Based on the ${regime.label} regime and your ${p.horizon} horizon, an investor profile matching your inputs has historically been associated with a defensive-leaning allocation. ${regime.description} This is an illustrative educational model, not a recommendation.`,
        generatedAt: new Date().toISOString(),
      };
      setRec(rec);

      // Get QuantAgent analysis
      const profileSummary = `
Investor: ${p.horizon} horizon, ${p.riskBehavior} on dips, income needed: ${p.incomeNeeded}, 
tax-advantaged: ${p.taxAdvantaged}, can lock funds: ${p.canLockFunds}, 
amount: ${p.amount ? `$${p.amount.toLocaleString()}` : "not specified"}

Current regime: ${regime.label} (${regime.confidence}% confidence)
Oil: $${macroData.oilPrice}, Gold: $${macroData.goldPrice}, CAPE: ${macroData.capeRatio}x, 
Geo tension: ${macroData.geoScore}/100, Bond yields rising: ${macroData.bondYieldRising}

Proposed allocation:
${buckets.map(b => `${b.emoji} ${b.name}: ${b.pct}%`).join("\n")}

Please provide your portfolio analysis and recommendation given this regime and investor profile.
Search for any relevant current market news before responding.`;

      const { data: analysis } = await supabase.functions.invoke("portfolio-advisor", {
        body: {
          action: "get_analysis",
          macroContext: macroData,
          profile: p,
          message: profileSummary,
          history: [],
        },
      });

      setAdvisorResponse(analysis?.response || "");
      setChatHistory([
        { role: "user",      content: profileSummary },
        { role: "assistant", content: analysis?.response || "" },
      ]);

      setStep("result");
    } catch (e) {
      console.error("Portfolio build error:", e);
      setStep("intake");
    }
  };

  const sendChatMessage = async () => {
    if (!chatMsg.trim() || chatLoading) return;
    const msg = chatMsg.trim();
    setChatMsg("");
    setChatLoading(true);

    const newHistory = [...chatHistory, { role: "user", content: msg }];
    setChatHistory(newHistory);

    try {
      const { data } = await supabase.functions.invoke("portfolio-advisor", {
        body: {
          action: "get_analysis",
          macroContext: macroCtx,
          profile,
          message: msg,
          history: newHistory.slice(-6),
        },
      });
      const reply = data?.response || "Unable to get response.";
      setChatHistory([...newHistory, { role: "assistant", content: reply }]);
    } catch (e) {
      console.error(e);
    } finally {
      setChatLoading(false);
    }
  };

  const reset = () => {
    setStep("intake");
    setQuestionIdx(0);
    setProfile({ exclusions: [] });
    setRec(null);
    setChatHistory([]);
    setAdvisorResponse("");
  };

  // ── Acknowledgment Gate ───────────────────────────────────────────────────
  if (!acknowledged) {
    return (
      <div className="flex flex-col gap-4 max-w-lg mx-auto py-8 px-4">
        <div className="text-center space-y-1">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            QuantForecast · Portfolio Insights
          </p>
          <h2 className="text-xl font-mono font-bold text-foreground">
            Before You Continue
          </h2>
        </div>

        <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4 space-y-3 text-[11px] font-mono text-amber-100/90 leading-relaxed">
          <p className="font-semibold text-amber-200">
            This tool is for educational and informational purposes only.
          </p>
          <ul className="space-y-1.5 list-disc list-inside text-amber-100/80">
            <li>QuantForecast is <strong>not a registered investment adviser</strong>.</li>
            <li>Output is an <strong>illustrative model</strong>, not a personalized recommendation to buy, sell, or hold any security.</li>
            <li>Any dollar figures shown are purely for illustration math — not advice to invest that amount.</li>
            <li>Always consult a licensed financial adviser before making investment decisions.</li>
          </ul>
          <p className="text-[10px] text-amber-200/70">
            Read the full{" "}
            <a href="/terms" target="_blank" rel="noreferrer" className="underline">Terms</a>
            {" "}and{" "}
            <a href="/disclaimer" target="_blank" rel="noreferrer" className="underline">Disclaimer</a>.
          </p>
        </div>

        <label className="flex items-start gap-2 p-3 rounded-lg border border-border bg-card/60 cursor-pointer">
          <input
            type="checkbox"
            checked={ackChecked}
            onChange={(e) => setAckChecked(e.target.checked)}
            className="mt-0.5 accent-primary"
          />
          <span className="text-[11px] font-mono text-foreground leading-relaxed">
            I understand this is educational content only, not investment advice,
            and I accept full responsibility for my own investment decisions.
          </span>
        </label>

        <button
          disabled={!ackChecked || ackSaving}
          onClick={async () => {
            setAckSaving(true);
            try {
              const { data: { user } } = await supabase.auth.getUser();
              await supabase.from("legal_acknowledgments").insert({
                user_id: user?.id ?? null,
                document: "portfolio_insights_disclaimer",
                version: ACK_VERSION,
                acknowledgment_text: ACK_TEXT,
                user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
                page_url: typeof window !== "undefined" ? window.location.href : null,
              });
            } catch (e) {
              console.error("Failed to record acknowledgment:", e);
            } finally {
              localStorage.setItem(ACK_KEY, "1");
              setAcknowledged(true);
              setAckSaving(false);
            }
          }}
          className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-mono font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {ackSaving ? "Recording…" : "I Understand — Continue"}
        </button>
      </div>
    );
  }

  // ── Intake UI ─────────────────────────────────────────────────────────────
  if (step === "intake") {
    const progress = (questionIdx / QUESTIONS.length) * 100;
    return (
      <div className="flex flex-col gap-6 max-w-lg mx-auto py-6 px-4">
        {/* Header */}
        <div className="text-center space-y-1">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            QuantForecast · Portfolio Insights
          </p>
          <h2 className="text-xl font-mono font-bold text-foreground">
            Let's Build Your Portfolio
          </h2>
          <p className="text-xs text-muted-foreground">
            {QUESTIONS.length - questionIdx} questions remaining
          </p>
        </div>

        {/* Progress */}
        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Question */}
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-mono font-semibold text-foreground">
              {currentQ.text}
            </h3>
            {currentQ.sub && (
              <p className="text-[11px] font-mono text-muted-foreground">{currentQ.sub}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {currentQ.options.map(opt => (
              <button
                key={String(opt.value)}
                onClick={() => handleAnswer(opt.value)}
                className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card/60 hover:border-primary/50 hover:bg-muted/50 transition-all text-left group"
              >
                <span className="text-xl">{opt.emoji}</span>
                <span className="text-sm font-mono text-foreground group-hover:text-foreground transition-colors">
                  {opt.label}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto group-hover:text-primary transition-colors" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 px-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <div className="text-center space-y-1">
          <p className="text-sm font-mono text-foreground">Analyzing macro regime...</p>
          <p className="text-[10px] font-mono text-muted-foreground">
            Fetching live oil, gold, bond and geopolitical data
          </p>
        </div>
        <div className="flex flex-col gap-1.5 text-[10px] font-mono text-muted-foreground text-center">
          <p>🛢️ Checking oil price vs $100 threshold...</p>
          <p>🪙 Reading gold at all-time highs...</p>
          <p>📊 Classifying 1970s+1999 hybrid regime...</p>
          <p>💼 Building your personalized allocation...</p>
          <p>🧠 QuantAgent analyzing with web search...</p>
        </div>
      </div>
    );
  }

  // ── Result ────────────────────────────────────────────────────────────────
  if (step === "result" && recommendation) {
    const { regime, buckets, reEntryTriggers, avoidList } = recommendation;
    const totalAmount = profile.amount;

    return (
      <div className="flex flex-col gap-4 max-w-2xl mx-auto py-4 px-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Portfolio Insights</p>
            <h2 className="text-lg font-mono font-bold text-foreground">Illustrative Model Output</h2>
            <p className="text-[10px] font-mono text-muted-foreground mt-0.5">Educational only — not a recommendation.</p>
          </div>
          <button onClick={reset} className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors">
            <RotateCcw className="w-3 h-3" />
            Start over
          </button>
        </div>

        {/* Regime */}
        <RegimeBadge regime={regime} />

        {/* Macro signals */}
        {macroCtx && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Oil (WTI)", value: `$${macroCtx.oilPrice}`, alert: Number(macroCtx.oilPrice) > 100 },
              { label: "Gold", value: `$${Number(macroCtx.goldPrice).toLocaleString()}`, alert: Number(macroCtx.goldPrice) > 3000 },
              { label: "10yr Yield", value: `${macroCtx.yield10yr}%`, alert: Boolean(macroCtx.bondYieldRising) },
            ].map(item => (
              <div key={item.label} className={`rounded-lg p-2.5 border ${item.alert ? "border-amber-800/40 bg-amber-950/20" : "border-border bg-card/60"}`}>
                <p className="text-[9px] font-mono text-muted-foreground uppercase">{item.label}</p>
                <p className={`text-sm font-mono font-bold ${item.alert ? "text-amber-400" : "text-foreground"}`}>{item.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Portfolio allocation */}
        <div className="space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Illustrative Allocation Model (percentages){totalAmount ? ` · math on $${totalAmount.toLocaleString()} for illustration only` : ""}
          </p>
          {buckets.map(bucket => (
            <BucketCard key={bucket.name} bucket={bucket} />
          ))}
        </div>

        {/* QuantAgent analysis */}
        {advisorResponse && (
          <div className="rounded-xl border border-sky-800/30 bg-sky-950/10 p-4 space-y-2">
            <p className="text-[10px] font-mono uppercase tracking-widest text-sky-400">
              🧠 QuantAgent Analysis
            </p>
            <div className="text-[11px] font-mono text-foreground leading-relaxed space-y-2">
              {advisorResponse.split("\n").filter(l => l.trim()).map((line, i) => (
                <p key={i} className={line.startsWith("**") ? "text-foreground font-semibold" : "text-muted-foreground"}>
                  {line.replace(/\*\*/g, "")}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Re-entry triggers */}
        <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-widest text-emerald-500">
            ⚡ Re-Entry Triggers
          </p>
          <div className="space-y-1">
            {reEntryTriggers.slice(0, 4).map((t, i) => (
              <p key={i} className="text-[10px] font-mono text-muted-foreground leading-relaxed">
                · {t}
              </p>
            ))}
          </div>
        </div>

        {/* Avoid list */}
        <div className="rounded-xl border border-red-900/30 bg-red-950/10 p-4 space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-widest text-red-400">
            🚫 What to Avoid Now
          </p>
          <div className="space-y-1">
            {avoidList.slice(0, 4).map((a, i) => (
              <p key={i} className="text-[10px] font-mono text-muted-foreground leading-relaxed">
                · {a}
              </p>
            ))}
          </div>
        </div>

        {/* Chat with advisor */}
        <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Ask Portfolio Insights
          </p>

          {/* Chat messages */}
          {chatHistory.slice(2).map((msg, i) => (
            <div key={i} className={`p-3 rounded-lg text-[11px] font-mono leading-relaxed ${
              msg.role === "user"
                ? "bg-primary/10 text-foreground ml-4"
                : "bg-muted/50 text-muted-foreground mr-4"
            }`}>
              {msg.content.split("\n").filter(l => l.trim()).slice(0, 8).map((line, j) => (
                <p key={j}>{line.replace(/\*\*/g, "")}</p>
              ))}
            </div>
          ))}

          {chatLoading && (
            <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Analyzing...
            </div>
          )}

          <div className="flex gap-2">
            <input
              value={chatMsg}
              onChange={e => setChatMsg(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendChatMessage()}
              placeholder="Ask about any instrument, risk, or scenario..."
              className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-[11px] font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
            <button
              onClick={sendChatMessage}
              disabled={chatLoading || !chatMsg.trim()}
              className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-[11px] font-mono disabled:opacity-50"
            >
              Send
            </button>
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {[
              "What about TIPS for inflation?",
              "Should I buy gold directly?",
              "How do I ladder CDs?",
              "When should I add tech back?",
            ].map(q => (
              <button
                key={q}
                onClick={() => { setChatMsg(q); }}
                className="text-[9px] font-mono px-2 py-1 rounded border border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-all"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[9px] font-mono text-muted-foreground text-center leading-relaxed border border-amber-900/40 bg-amber-950/10 rounded-lg p-3">
          <strong className="text-amber-300">Not investment advice.</strong> QuantForecast is not a registered
          investment adviser. This is an illustrative educational model based on
          quantitative signals and macro regime analysis — not a recommendation to
          buy, sell, or hold any security. Any dollar figures are for illustration
          math only. Always consult a licensed financial adviser before investing.
        </p>
      </div>
    );
  }

  return null;
}
