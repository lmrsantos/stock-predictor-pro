import { Link } from "react-router-dom";
import {
  ArrowRight,
  LineChart,
  Sparkles,
  Network,
  Layers,
  ShieldCheck,
  Zap,
  Bot,
  BarChart3,
  Check,
  TrendingUp,
  Gauge,
  Scale,
  Waves,
  Rocket,
  Clock,
  BookOpen,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import quantAgentHero from "@/assets/quantagent-hero.jpg";

/**
 * QuantForecast marketing landing page.
 * Inspired by mercury.com / stripe.com / schwab.com — narrative full-width
 * sections, deep indigo gradients, generous type, product proof.
 */
export default function Landing() {
  const { user } = useAuth();

  return (
    <div
      className="min-h-screen bg-[#07071a] text-white overflow-x-hidden"
      style={{ fontFamily: "'Sora','Manrope',system-ui,sans-serif" }}
    >
      {/* Google fonts */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700&display=swap"
      />

      {/* ─── NAV ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#07071a]/70 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-400 to-fuchsia-500 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold tracking-tight">QuantForecast</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-white/70">
            <a href="#product" className="hover:text-white">Product</a>
            <a href="#linkages" className="hover:text-white">Linkage Engine</a>
            <Link to="/ipo-intelligence" className="hover:text-white">IPO Intelligence</Link>
            <a href="#how" className="hover:text-white">How it works</a>
            <Link to="/pricing" className="hover:text-white">Pricing</Link>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Link
                to="/terminal"
                className="text-sm px-4 py-2 rounded-full bg-white text-[#07071a] font-medium hover:bg-white/90"
              >
                Open terminal
              </Link>
            ) : (
              <>
                <Link to="/auth" className="text-sm text-white/80 hover:text-white px-3 py-2">
                  Sign in
                </Link>
                <Link
                  to="/auth"
                  className="text-sm px-4 py-2 rounded-full bg-white text-[#07071a] font-medium hover:bg-white/90 flex items-center gap-1"
                >
                  Get started <ArrowRight className="w-4 h-4" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ─── QUANTAGENT SPOTLIGHT ────────────────────────────── */}
      <section id="quantagent" className="py-24 border-b border-white/5 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-10 -right-32 w-[520px] h-[520px] rounded-full bg-fuchsia-600/20 blur-3xl" />
          <div className="absolute bottom-0 -left-32 w-[520px] h-[520px] rounded-full bg-indigo-600/25 blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="relative order-2 lg:order-1">
            <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-fuchsia-500/30 via-indigo-500/30 to-sky-500/20 blur-2xl" />
            <div className="relative rounded-2xl border border-white/10 overflow-hidden shadow-[0_30px_120px_-20px_rgba(139,92,246,0.5)]">
              <img
                src={quantAgentHero}
                alt="QuantAgent — an AI quant analyst driving the QuantForecast terminal"
                width={1280}
                height={960}
                loading="lazy"
                className="w-full h-auto"
              />
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 text-xs text-fuchsia-200 mb-6">
              <Bot className="w-3 h-3" />
              Meet QuantAgent
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6 leading-tight">
              An AI quant that <span className="bg-gradient-to-r from-fuchsia-300 via-indigo-300 to-sky-300 bg-clip-text text-transparent">drives the terminal</span> for you.
            </h2>
            <p className="text-white/70 text-lg leading-relaxed mb-8">
              Talk to QuantAgent like a senior desk analyst — it reads your regression,
              backtest, macro regime, and linkage graph in context, and it can{" "}
              <span className="text-white">actually navigate the platform</span> when
              you ask. Say <em>"switch to NVDA"</em>, <em>"open Hot Stocks"</em>, or{" "}
              <em>"take me to the Linkage Engine"</em> — and it just happens.
            </p>
            <ul className="space-y-3 mb-10">
              {[
                'Type "switch to TSLA" → the chart reloads instantly',
                'Type "open the Linkage Engine" → the page opens',
                "Grounded on your live model, fundamentals & macro context",
                "Every reply cites the numbers — no vibes, no hallucinated tickers",
              ].map((f) => (
                <li key={f} className="flex items-start gap-3 text-white/80">
                  <Check className="w-5 h-5 text-fuchsia-300 shrink-0 mt-0.5" /> {f}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to={user ? "/terminal" : "/auth"}
                className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-full font-semibold text-[#07071a] bg-gradient-to-r from-fuchsia-300 via-indigo-200 to-sky-300 shadow-[0_0_40px_-5px_rgba(217,70,239,0.7)] hover:shadow-[0_0_60px_-5px_rgba(217,70,239,0.9)] transition-shadow"
              >
                <Sparkles className="w-4 h-4" />
                Try QuantAgent free
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                to="/terminal"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-white/15 text-white/80 hover:bg-white/5 hover:text-white text-sm"
              >
                See it in the terminal →
              </Link>
            </div>
            <p className="text-xs text-white/40 mt-4">
              No card required. Educational analysis — not financial advice.
            </p>
          </div>
        </div>
      </section>

      {/* ─── HERO ────────────────────────────────────────────── */}
      <section className="relative pt-24 pb-32 overflow-hidden">
        {/* aurora bg */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-indigo-600/30 blur-3xl" />
          <div className="absolute top-20 right-0 w-[500px] h-[500px] rounded-full bg-fuchsia-600/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] rounded-full bg-sky-500/20 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs text-white/70 mb-8">
            <Sparkles className="w-3 h-3 text-indigo-300" />
            Cross-Sector Linkage Engine now live
          </div>
          <h1
            className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6 max-w-4xl mx-auto"
            style={{ fontFamily: "'Sora',sans-serif" }}
          >
            The quant terminal for{" "}
            <span className="bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-sky-300 bg-clip-text text-transparent">
              serious investors.
            </span>
          </h1>
          <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto mb-10 leading-relaxed">
            Regression forecasts, probability cones, sector backtests, and a lead-lag
            linkage graph — the same toolkit desks pay $2k/month for, reimagined for you.
          </p>
          <div className="flex items-center justify-center gap-3 mb-16">
            <Link
              to={user ? "/terminal" : "/auth"}
              className="px-6 py-3 rounded-full bg-white text-[#07071a] font-semibold hover:bg-white/90 flex items-center gap-2"
            >
              {user ? "Open terminal" : "Start free"} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/terminal"
              className="px-6 py-3 rounded-full border border-white/15 hover:bg-white/5 font-medium"
            >
              See live demo →
            </Link>
          </div>

          {/* Product screenshot / mock */}
          <div className="relative mx-auto max-w-5xl">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/30 blur-2xl" />
            <div className="relative rounded-2xl border border-white/10 bg-[#0d0d24] p-4 shadow-2xl">
              <div className="flex items-center gap-1.5 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
                <div className="ml-3 text-[10px] text-white/40 font-mono">
                  quant-forecast.com/terminal
                </div>
              </div>
              <MockTerminal />
            </div>
          </div>
        </div>
      </section>

      {/* ─── LOGO STRIP ──────────────────────────────────────── */}
      <section className="border-y border-white/5 bg-white/[0.02] py-8">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-xs uppercase tracking-widest text-white/40 mb-4">
            Modeled after professional terminals like
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-white/50 text-sm font-medium">
            <span>Bloomberg</span>
            <span>·</span>
            <span>FactSet</span>
            <span>·</span>
            <span>Koyfin</span>
            <span>·</span>
            <span>YCharts</span>
            <span>·</span>
            <span>Refinitiv</span>
          </div>
        </div>
      </section>

      {/* ─── FEATURE GRID ────────────────────────────────────── */}
      <section id="product" className="py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-16">
            <div className="text-xs uppercase tracking-widest text-indigo-300 mb-3">
              The platform
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              One terminal. Every quant workflow.
            </h2>
            <p className="text-white/60 text-lg">
              Forecast it, prove it out-of-sample, check the historical base rate, then
              size it. Nine modules, one context — no spreadsheet stitching.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              icon={<LineChart className="w-5 h-5" />}
              title="Regression Forecasts"
              body="Adaptive slope-shrink regression with 1σ / 2σ probability cones and mean-reversion pull — so trends aren't blindly extrapolated into a reversal."
              accent="from-indigo-500/20 to-transparent"
            />
            <FeatureCard
              icon={<Gauge className="w-5 h-5" />}
              title="Out-of-Sample Backtest"
              body="Rolling-window holdout: the model is cut off 30 bars back and forecasts blind, then scored against the real price. Model fit /100, honestly earned."
              accent="from-sky-500/20 to-transparent"
              badge="Rebuilt"
            />
            <FeatureCard
              icon={<Scale className="w-5 h-5" />}
              title="Base-Rate Evidence"
              body="Every setup is compared to its volatility-bucket baseline. You see the excess hit rate and sample size — not a green arrow with no denominator."
              accent="from-emerald-500/20 to-transparent"
              badge="New"
            />
            <FeatureCard
              icon={<Network className="w-5 h-5" />}
              title="Linkage Engine"
              body="22 economically-motivated lead-lag pairs, BH-corrected & split-half validated. See which sector moves first — and what usually follows."
              accent="from-fuchsia-500/20 to-transparent"
              badge="Signature"
            />
            <FeatureCard
              icon={<Waves className="w-5 h-5" />}
              title="Cycle & Fibonacci Levels"
              body="Structural pivot detection maps real peaks and troughs, then projects the next support and resistance band with nearby retracement levels."
              accent="from-violet-500/20 to-transparent"
            />
            <FeatureCard
              icon={<Layers className="w-5 h-5" />}
              title="Sector Backtest"
              body="13 curated sectors, 227 symbols, walk-forward scored. Find the regime before it finds your portfolio."
              accent="from-cyan-500/20 to-transparent"
            />
            <FeatureCard
              icon={<Zap className="w-5 h-5" />}
              title="Hot Stocks Screener"
              body="QuantPulse momentum + linkage tilt across three risk profiles, with a 'Strong evidence only' filter that hides anything the base rates don't support."
              accent="from-amber-500/20 to-transparent"
            />
            <FeatureCard
              icon={<Bot className="w-5 h-5" />}
              title="QuantAgent"
              body="A senior-quant assistant grounded on your live chart, fundamentals and macro regime — and it can navigate the terminal for you."
              accent="from-rose-500/20 to-transparent"
            />
            <FeatureCard
              icon={<BarChart3 className="w-5 h-5" />}
              title="Portfolio Advisor"
              body="Liquidity-aware allocations with no duplicated tickers, 30D and 1Y trajectory projections, and clearly labeled annual yield vs. liquidity."
              accent="from-teal-500/20 to-transparent"
            />
            <FeatureCard
              icon={<Rocket className="w-5 h-5" />}
              title="IPO Intelligence"
              body="Fresh listings scored on lockup risk, float, and dilution pressure — the part of the market where price history can't help you."
              accent="from-orange-500/20 to-transparent"
            />
            <FeatureCard
              icon={<Clock className="w-5 h-5" />}
              title="Extended-Hours Prices"
              body="Pre-market and after-hours prints appear next to the last close automatically, Yahoo-style, based on the session you're actually in."
              accent="from-lime-500/20 to-transparent"
            />
            <FeatureCard
              icon={<BookOpen className="w-5 h-5" />}
              title="Explains Itself"
              body="Every metric ships with a 'what is it / how to read it' tooltip, plus a full methodology page. Learn the math while you use it."
              accent="from-indigo-500/20 to-transparent"
            />
          </div>
        </div>
      </section>

      {/* ─── EVIDENCE / HONESTY SPOTLIGHT ────────────────────── */}
      <section id="evidence" className="py-32 border-t border-white/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/30 via-transparent to-transparent pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 text-xs text-emerald-200 mb-6">
              <Scale className="w-3 h-3" />
              Proof, not promises
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              Most tools show you a forecast. We show you its track record.
            </h2>
            <p className="text-white/70 text-lg leading-relaxed mb-8">
              Every projection is scored the hard way: the model is blinded to the most
              recent 30 bars, forced to forecast, and graded against what actually
              happened. When the fit is weak, we cap the confidence instead of dressing
              it up.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                "True out-of-sample holdout — no lookahead, ever",
                "Conditioned base rates vs. volatility-bucket baselines",
                "Excess hit rate and sample size shown on every setup",
                "Confidence gate caps the score when calibration error is high",
              ].map((f) => (
                <li key={f} className="flex items-start gap-3 text-white/80">
                  <Check className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" /> {f}
                </li>
              ))}
            </ul>
            <a
              href="/methodology"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-[#07071a] font-medium hover:bg-white/90"
            >
              Read the methodology <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { k: "Blind horizon", v: "30 bars", d: "Model sees nothing after the cutoff" },
              { k: "Linkage pairs", v: "22", d: "BH-corrected & split-half validated" },
              { k: "Backtest universe", v: "227 symbols", d: "Across 13 curated sectors" },
              { k: "Evidence gate", v: "+5pp", d: "Minimum excess over baseline" },
            ].map((s) => (
              <div key={s.k} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">{s.k}</div>
                <div className="text-2xl font-bold mb-1">{s.v}</div>
                <p className="text-white/50 text-xs leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ─── LINKAGE SPOTLIGHT ───────────────────────────────── */}
      <section id="linkages" className="py-32 border-t border-white/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/40 via-transparent to-transparent pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-400/30 bg-indigo-500/10 text-xs text-indigo-200 mb-6">
              <Sparkles className="w-3 h-3" />
              The unfair advantage
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              Watch sectors talk to each other.
            </h2>
            <p className="text-white/70 text-lg leading-relaxed mb-8">
              The Cross-Sector Linkage Graph maps 22 hand-curated causal relationships —
              semiconductors leading software, energy leading transports, credit spreads
              leading small caps — validated with proper multiple-testing correction.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                "Bonferroni-Holm & Benjamini-Hochberg corrected",
                "Split-half validated to weed out false positives",
                "Powers Hot Stocks confidence & QuantAgent macro reasoning",
              ].map((f) => (
                <li key={f} className="flex items-start gap-3 text-white/80">
                  <Check className="w-5 h-5 text-indigo-300 shrink-0 mt-0.5" /> {f}
                </li>
              ))}
            </ul>
            <Link
              to="/linkages"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-[#07071a] font-medium hover:bg-white/90"
            >
              Explore the graph <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <MockLinkageGraph />
        </div>
      </section>

      <section id="how" className="py-32 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-16">
            <div className="text-xs uppercase tracking-widest text-indigo-300 mb-3">
              How it works
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
              From ticker to thesis in under a minute.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { n: "01", t: "Search any symbol", b: "Pull a year of daily closes, fundamentals, and analyst consensus in one query." },
              { n: "02", t: "Read the regression", b: "R², slope, drift, probability cones — every metric explains itself with a tooltip." },
              { n: "03", t: "Stress-test the thesis", b: "Backtest the symbol, backtest the sector, ask QuantAgent what could go wrong." },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                <div className="text-xs font-mono text-indigo-300 mb-4">{s.n}</div>
                <h3 className="font-semibold text-lg mb-2">{s.t}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TRUST / SECURITY ────────────────────────────────── */}
      <section className="py-24 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <TrustBlock
            icon={<ShieldCheck className="w-5 h-5" />}
            title="Educational, not advisory"
            body="QuantForecast is not a registered investment adviser. Every metric ships with context so you decide."
          />
          <TrustBlock
            icon={<Layers className="w-5 h-5" />}
            title="Your data, your control"
            body="Portfolios and preferences are encrypted at rest, protected by row-level security, and never sold."
          />
          <TrustBlock
            icon={<Zap className="w-5 h-5" />}
            title="Live prices, cached math"
            body="Daily closes stream from Yahoo & FMP. Heavy models run in-browser or on-cache for zero lag."
          />
        </div>
      </section>

      {/* ─── PRICING TEASER ──────────────────────────────────── */}
      <section className="py-32 border-t border-white/5 bg-gradient-to-b from-transparent to-indigo-950/30">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Simple pricing. No seat math.
          </h2>
          <p className="text-white/60 text-lg mb-10">
            Start free. Upgrade when the terminal pays for itself.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
            {[
              { name: "Free", price: "$0", desc: "The regression chart, on us." },
              { name: "Pro", price: "$19", desc: "Full toolkit + Linkage read-only.", highlight: true },
              { name: "Elite", price: "$49", desc: "Live Linkage re-runs & exports." },
            ].map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl p-6 border ${
                  p.highlight
                    ? "border-indigo-400/50 bg-indigo-500/10"
                    : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <div className="text-sm text-white/60 mb-1">{p.name}</div>
                <div className="text-3xl font-bold mb-2">
                  {p.price}
                  <span className="text-sm font-normal text-white/50">/mo</span>
                </div>
                <p className="text-sm text-white/60">{p.desc}</p>
              </div>
            ))}
          </div>
          <Link
            to="/pricing"
            className="inline-flex items-center gap-2 mt-10 px-6 py-3 rounded-full bg-white text-[#07071a] font-semibold hover:bg-white/90"
          >
            See full pricing <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ─── FINAL CTA ───────────────────────────────────────── */}
      <section className="py-32 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
            Ready to trade with{" "}
            <span className="bg-gradient-to-r from-indigo-300 to-fuchsia-300 bg-clip-text text-transparent">
              conviction?
            </span>
          </h2>
          <p className="text-white/60 text-lg mb-10">
            Open the terminal in your browser. No install, no card, no wait.
          </p>
          <Link
            to={user ? "/terminal" : "/auth"}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white text-[#07071a] font-semibold text-lg hover:bg-white/90"
          >
            {user ? "Open terminal" : "Start free"} <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* ─── FOOTER ──────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-12 text-sm text-white/50">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-indigo-400 to-fuchsia-500" />
              <span className="font-semibold text-white">QuantForecast</span>
            </div>
            <p className="text-xs">The quant terminal for serious investors.</p>
          </div>
          <FooterCol
            title="Product"
            links={[
              ["Terminal", "/terminal"],
              ["Linkage Engine", "/linkages"],
              ["Sector Backtest", "/sector-backtest"],
              ["Pricing", "/pricing"],
            ]}
          />
          <FooterCol
            title="Company"
            links={[
              ["Terms", "/terms"],
              ["Privacy", "/privacy"],
              ["Disclaimer", "/disclaimer"],
            ]}
          />
          <FooterCol
            title="Contact"
            links={[["contact@quant-forecast.com", "mailto:contact@quant-forecast.com"]]}
          />
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-10 pt-6 border-t border-white/5 text-xs">
          © {new Date().getFullYear()} QuantForecast · Not a registered investment adviser.
          For informational and educational purposes only.
        </div>
      </footer>
    </div>
  );
}

/* ─── PRESENTATIONAL SUB-COMPONENTS ─────────────────────────── */

function FeatureCard({
  icon,
  title,
  body,
  accent,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  accent: string;
  badge?: string;
}) {
  return (
    <div className={`relative rounded-2xl border border-white/10 bg-gradient-to-br ${accent} p-6 hover:border-white/20 transition-colors`}>
      {badge && (
        <span className="absolute top-4 right-4 text-[10px] uppercase tracking-widest text-indigo-300 border border-indigo-400/30 rounded-full px-2 py-0.5">
          {badge}
        </span>
      )}
      <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center mb-4 text-white">
        {icon}
      </div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-white/60 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function TrustBlock({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center mb-4 text-indigo-300">
        {icon}
      </div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-white/60 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-white/40 mb-3">{title}</div>
      <ul className="space-y-2">
        {links.map(([label, href]) => (
          <li key={label}>
            {href.startsWith("mailto:") ? (
              <a href={href} className="hover:text-white">
                {label}
              </a>
            ) : (
              <Link to={href} className="hover:text-white">
                {label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MockTerminal() {
  return (
    <div className="grid grid-cols-4 gap-3 p-4 bg-[#07071a] rounded-xl min-h-[320px]">
      <div className="col-span-1 space-y-2">
        {["^GSPC", "AAPL", "NVDA", "TSLA", "MSFT", "GOOGL"].map((t, i) => (
          <div
            key={t}
            className={`text-xs font-mono px-2 py-1.5 rounded ${
              i === 0 ? "bg-indigo-500/20 text-indigo-200" : "text-white/60 hover:bg-white/5"
            }`}
          >
            {t}
          </div>
        ))}
      </div>
      <div className="col-span-3 rounded-lg bg-white/[0.03] border border-white/5 p-4">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <div className="text-xs text-white/50 font-mono">^GSPC · S&amp;P 500</div>
            <div className="text-2xl font-bold">44,910.65</div>
          </div>
          <div className="text-emerald-300 text-sm font-mono">+128.42 (+0.29%)</div>
        </div>
        <svg viewBox="0 0 400 140" className="w-full h-32">
          <defs>
            <linearGradient id="cone" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,90 L60,80 L110,85 L160,70 L210,72 L260,55 L400,20 L400,120 L260,90 L210,105 L160,105 L110,120 L60,115 L0,125 Z"
            fill="url(#cone)"
          />
          <polyline
            fill="none"
            stroke="#a5b4fc"
            strokeWidth="2"
            points="0,100 60,95 110,98 160,85 210,88 260,72 310,68 400,55"
          />
          <polyline
            fill="none"
            stroke="#f0abfc"
            strokeWidth="2"
            strokeDasharray="4 4"
            points="260,72 310,60 360,48 400,38"
          />
        </svg>
        <div className="grid grid-cols-4 gap-2 mt-3 text-[10px] font-mono">
          {[
            ["R²", "0.87"],
            ["Slope", "+$0.12/d"],
            ["σ 30d", "1.2%"],
            ["Signal", "BULL"],
          ].map(([k, v]) => (
            <div key={k} className="p-2 rounded bg-white/5">
              <div className="text-white/40">{k}</div>
              <div className="text-white">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MockLinkageGraph() {
  const nodes = [
    { x: 80, y: 40, l: "Semis" },
    { x: 240, y: 30, l: "Software" },
    { x: 360, y: 80, l: "Mega Tech" },
    { x: 60, y: 180, l: "Energy" },
    { x: 200, y: 220, l: "Transports" },
    { x: 340, y: 200, l: "Banks" },
    { x: 140, y: 300, l: "Small Cap" },
    { x: 310, y: 310, l: "Biotech" },
  ];
  const edges: [number, number][] = [
    [0, 1], [1, 2], [0, 2], [3, 4], [4, 5], [5, 2], [3, 6], [6, 4], [5, 7], [4, 7],
  ];
  return (
    <div className="relative rounded-2xl border border-white/10 bg-[#0d0d24] p-6 aspect-square max-w-[500px] mx-auto">
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-fuchsia-500/10" />
      <svg viewBox="0 0 420 380" className="relative w-full h-full">
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            stroke="#818cf8"
            strokeOpacity="0.4"
            strokeWidth="1.5"
          />
        ))}
        {nodes.map((n, i) => (
          <g key={i}>
            <circle cx={n.x} cy={n.y} r="22" fill="#4f46e5" fillOpacity="0.25" />
            <circle cx={n.x} cy={n.y} r="10" fill="#a5b4fc" />
            <text
              x={n.x}
              y={n.y + 38}
              textAnchor="middle"
              fill="#e0e7ff"
              fontSize="11"
              fontFamily="Manrope"
            >
              {n.l}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
