import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUp,
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
  Github,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { BootPreloader } from "@/components/BootPreloader";

/**
 * QuantForecast marketing landing page.
 * Narrative full-width sections, deep indigo gradients, generous type,
 * product proof. All motion respects prefers-reduced-motion.
 */
export default function Landing() {
  const { user } = useAuth();
  const [booted, setBooted] = useState(false);

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

      {/* Animated left-in underline for nav & inline text links */}
      <style>{`
        .qf-link { position: relative; }
        .qf-link::after {
          content: ""; position: absolute; left: 0; bottom: -2px;
          height: 1px; width: 100%; background: currentColor;
          transform: scaleX(0); transform-origin: left;
          transition: transform 180ms ease-out;
        }
        .qf-link:hover::after { transform: scaleX(1); }
        @media (prefers-reduced-motion: reduce) {
          .qf-link::after { transition: none; }
        }
      `}</style>

      <BootPreloader onDone={() => setBooted(true)} />

      {/* ─── 1. NAV ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#07071a]/70 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-400 to-fuchsia-500 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold tracking-tight">QuantForecast</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-white/70">
            <a href="#product" className="qf-link hover:text-white">Products</a>
            <a href="#evidence" className="qf-link hover:text-white">Forecast Methodology</a>
            <a href="#quantagent" className="qf-link hover:text-white">QuantAgent</a>
            <a href="#educational" className="qf-link hover:text-white">Educational</a>
            <a href="#pricing" className="qf-link hover:text-white">Pricing</a>
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

      {/* ─── 2. HERO ─────────────────────────────────────────── */}
      <section
        className="relative pt-24 pb-32 overflow-hidden"
        style={{ opacity: booted ? 1 : 0, transition: "opacity 500ms ease-out" }}
      >
        {/* aurora bg */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-indigo-600/30 blur-3xl" />
          <div className="absolute top-20 right-0 w-[500px] h-[500px] rounded-full bg-fuchsia-600/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] rounded-full bg-sky-500/20 blur-3xl" />
        </div>

        {/* animated linkage particle field */}
        <ParticleField />

        <div className="relative max-w-7xl mx-auto px-6 text-center">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs text-white/70 mb-8">
              <Sparkles className="w-3 h-3 text-indigo-300" />
              Every signal ships with its own error rate
            </div>
          </Reveal>
          <Reveal delay={80}>
            <h1
              className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6 max-w-4xl mx-auto"
              style={{ fontFamily: "'Sora',sans-serif" }}
            >
              Most stock tools never say &ldquo;I don&rsquo;t know.&rdquo;
              <br />
              <span className="bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-sky-300 bg-clip-text text-transparent">
                This one does. Often.
              </span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto mb-10 leading-relaxed">
              Regression forecasts, out-of-sample scoring, and historical base rates —
              each with its sample size and track record attached. When the models can&rsquo;t
              read a stock, QuantForecast says so, instead of inventing a signal.
            </p>
          </Reveal>

          <Reveal delay={240}>
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
              <a
                href="https://github.com/lmrsantos/stock-predictor-pro"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 rounded-full border border-white/15 hover:bg-white/5 font-medium flex items-center gap-2"
              >
                <Github className="w-4 h-4" />
                View source
              </a>
            </div>
          </Reveal>

          {/* Product screenshot / mock */}
          <Reveal delay={320}>
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
          </Reveal>
        </div>
      </section>

      {/* ─── 3. BLOOMBERG COMPARISON LINE ────────────────────── */}
      <section className="border-y border-white/5 bg-white/[0.02] py-10">
        <Reveal>
          <div className="max-w-3xl mx-auto px-6 text-center">
            <p className="text-lg md:text-2xl font-semibold leading-snug">
              A Bloomberg terminal costs about $65 a day.
              <br className="hidden md:block" />{" "}
              <span className="bg-gradient-to-r from-indigo-300 to-fuchsia-300 bg-clip-text text-transparent">
                This one starts at $1.63.
              </span>
            </p>
            <p className="text-[11px] text-white/40 mt-4">
              Bloomberg is a trademark of Bloomberg L.P. QuantForecast is not affiliated
              with Bloomberg.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ─── 4. PROOF ────────────────────────────────────────── */}
      <section className="py-28 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6">
          <Reveal>
            <div className="text-center mb-14">
              <div className="text-xs uppercase tracking-widest text-indigo-300 mb-3">
                What honesty looks like
              </div>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
                Here is our product refusing to answer.
              </h2>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Reveal delay={80}>
              <ProofCard header="CSX · symbol detail">
                <ProofLine>Direction not reliable — correct in 6 of 12 windows</ProofLine>
                <ProofLine>Expected move ±9.9% over 30 days</ProofLine>
                <ProofLine>Model fit 25/100</ProofLine>
                <ProofLine>Ensemble mean — no single model validated</ProofLine>
                <ProofLine>No defined setups match this symbol</ProofLine>
                <ProofLine>No validated cross-sector linkages for this sector</ProofLine>
                <p className="text-white/45 text-sm leading-relaxed mt-5">
                  The models contribute nothing here. Any decision rests on fundamentals,
                  valuation, and your own judgement.
                </p>
              </ProofCard>
            </Reveal>

            <Reveal delay={160}>
              <ProofCard header="Track record filter">
                <ProofLine>
                  <span className="text-white/70">Strong evidence filter</span>
                  <span className="text-white/25"> ...... </span>
                  <span className="text-white">rarely more than a handful</span>
                </ProofLine>
                <ProofLine>
                  <span className="text-white/70">Hot only</span>
                  <span className="text-white/25"> .................... </span>
                  <span className="text-white">a short list, most days</span>
                </ProofLine>
                <p className="text-white/45 text-sm leading-relaxed mt-5">
                  Most days, almost nothing clears the evidence bar. We show you the empty
                  list rather than filling it.
                </p>
              </ProofCard>
            </Reveal>
          </div>

          <Reveal delay={240}>
            <p className="text-center text-sm text-white/45 mt-10 max-w-2xl mx-auto">
              These are real screens from the product, not mockups. Tools that always have
              a signal are selling you one.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ─── 5. FEATURE GRID ─────────────────────────────────── */}
      <section className="py-32">
        <div className="max-w-7xl mx-auto px-6">
          <Reveal>
            <div id="product" className="scroll-mt-24 max-w-2xl mb-16">

              <div className="text-xs uppercase tracking-widest text-indigo-300 mb-3">
                The platform
              </div>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
                One terminal. Every quant workflow.
              </h2>
              <p className="text-white/60 text-lg">
                Forecast it, prove it out-of-sample, check the historical base rate, then
                size it. Twelve modules, one context — no spreadsheet stitching.
              </p>
            </div>
          </Reveal>

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
              body="22 economically-motivated lead-lag pairs, corrected for false positives and validated on both halves of the history. See which sector moves first — and what usually follows."
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
              body="43 curated baskets, 371 symbols, walk-forward scored. Find the regime before it finds your portfolio."
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
              title="Portfolio Insights"
              body="Liquidity-aware allocations with no duplicated tickers, 30D and 1Y trajectory projections, and clearly labeled annual yield vs. liquidity."
              accent="from-teal-500/20 to-transparent"
            />
            <div id="ipo" className="scroll-mt-24">
              <FeatureCard
                icon={<Rocket className="w-5 h-5" />}
                title="IPO Intelligence"
                body="Fresh listings scored on lockup risk, float, and dilution pressure — the part of the market where price history can't help you."
                accent="from-orange-500/20 to-transparent"
              />
            </div>

            <FeatureCard
              icon={<Clock className="w-5 h-5" />}
              title="Extended-Hours Prices"
              body="Pre-market and after-hours prints appear next to the last close automatically, based on the session you're actually in."
              accent="from-lime-500/20 to-transparent"
            />
            <FeatureCard
              icon={<BookOpen className="w-5 h-5" />}
              title="Portfolio Analyses"
              body="Break down your holdings by sector, see concentration risk, and track projected value over time — all in one place."
              accent="from-indigo-500/20 to-transparent"
            />
          </div>
        </div>
      </section>

      {/* ─── 6. LINKAGE SPOTLIGHT ────────────────────────────── */}
      <section id="linkages" className="scroll-mt-20 py-32 border-t border-white/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/40 via-transparent to-transparent pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <Reveal>
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
                leading small caps — each one tested before it is shown.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "Corrected for the false positives that appear when you test many pairs at once",
                  "Each relationship must hold in both halves of the history, not just one",
                  "Feeds Hot Stocks rankings and QuantAgent's macro reasoning",
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
          </Reveal>

          <MockLinkageGraph />
        </div>
      </section>

      {/* ─── 6b. THE CURATED UNIVERSE ─────────────────────────── */}
      <section className="py-32 border-t border-white/5 relative overflow-hidden">
        <div className="relative max-w-7xl mx-auto px-6">
          <Reveal>
            <div className="max-w-3xl">
              <div className="text-[11px] uppercase tracking-widest text-white/40 mb-4">
                The closed world
              </div>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
                371 symbols. 43 baskets. One coherent scoreboard.
              </h2>
              <p className="text-white/70 text-lg leading-relaxed">
                Ranking, linkage detection and base rates only mean something against a known
                population. The terminal charts any ticker you type — but the automated engines
                run on a curated universe, so every score is comparable to every other score.
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-14">
            {[
              {
                t: "Subsectors, not just sectors",
                b: "Most tools stop at \u201cTechnology.\u201d We separate Semis: Memory from Semis: AI & GPU, Data Center REITs from Real Estate, Rare Earth from Materials — so the linkage graph can surface a rotation inside a sector, not just between them.",
              },
              {
                t: "One stock, several homes",
                b: "A mega-cap can lead more than one theme. AAPL sits in both Mega-cap Tech and Software: Cloud Infra, and the engine picks the right composite for the question being asked.",
              },
              {
                t: "Names get dropped, not padded",
                b: "Any symbol without at least 60 days of cached history is removed before it can be ranked. A thin or newly listed name never appears with a confident-looking score attached.",
              },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 90}>
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 h-full">
                  <h3 className="font-semibold mb-3">{c.t}</h3>
                  <p className="text-white/60 text-sm leading-relaxed">{c.b}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 7. EVIDENCE / METHODOLOGY ───────────────────────── */}
      <section id="evidence" className="scroll-mt-20 py-32 border-t border-white/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/30 via-transparent to-transparent pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <Reveal>
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
                happened.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "True out-of-sample holdout — no lookahead, ever",
                  "Conditioned base rates vs. volatility-bucket baselines",
                  "Every setup shows how often it beat its baseline, and on how many occurrences",
                  "When the model fits badly, we cap the score instead of dressing it up",
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
          </Reveal>

          <div className="grid grid-cols-2 gap-4">
            {[
              { k: "Blind horizon", to: 30, suffix: " bars", d: "Model sees nothing after the cutoff" },
              { k: "Linkage pairs", to: 22, suffix: "", d: "Multiple-testing corrected & split-half validated" },
              { k: "Curated universe", to: 371, suffix: "", d: "Across 43 sector and subsector baskets" },
              { k: "Evidence gate", to: 5, prefix: "+", suffix: "pp", d: "Minimum excess over baseline" },
            ].map((s, i) => (
              <Reveal key={s.k} delay={i * 80}>
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 h-full">
                  <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">{s.k}</div>
                  <div className="text-2xl font-bold mb-1">
                    <CountUp to={s.to} prefix={s.prefix} suffix={s.suffix} />
                  </div>
                  <p className="text-white/50 text-xs leading-relaxed">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 8. QUANTAGENT SPOTLIGHT ─────────────────────────── */}
      <section id="quantagent" className="scroll-mt-20 py-24 border-t border-white/5 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-10 -right-32 w-[520px] h-[520px] rounded-full bg-fuchsia-600/20 blur-3xl" />
          <div className="absolute bottom-0 -left-32 w-[520px] h-[520px] rounded-full bg-indigo-600/25 blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <Reveal>
            <div className="relative order-2 lg:order-1">
              <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-fuchsia-500/30 via-indigo-500/30 to-sky-500/20 blur-2xl" />
              <MockAgentChat />
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 text-xs text-fuchsia-200 mb-6">
                <Bot className="w-3 h-3" />
                Meet QuantAgent
              </div>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6 leading-tight">
                An AI quant that{" "}
                <span className="bg-gradient-to-r from-fuchsia-300 via-indigo-300 to-sky-300 bg-clip-text text-transparent">
                  drives the terminal
                </span>{" "}
                for you.
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
                  "Every reply cites the numbers — and says so when the numbers are thin",
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
          </Reveal>
        </div>
      </section>

      {/* ─── 9. HOW IT WORKS ─────────────────────────────────── */}
      <section id="how" className="scroll-mt-20 py-32 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <Reveal>
            <div className="max-w-2xl mb-16">
              <div className="text-xs uppercase tracking-widest text-indigo-300 mb-3">
                How it works
              </div>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
                From ticker to thesis in under a minute.
              </h2>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { n: "01", t: "Search any symbol", b: "Daily closes, fundamentals, analyst consensus — plus the live pre-market or after-hours print when the session calls for it." },
              { n: "02", t: "Read the forecast", b: "Shrunk regression slope, 1σ/2σ cones, cycle pivots and nearby Fibonacci levels. Every metric explains itself." },
              { n: "03", t: "Check the receipts", b: "Out-of-sample model fit and conditioned base rates tell you how often this setup actually worked before." },
              { n: "04", t: "Position it", b: "Sector linkages, Hot Stocks tilts and the liquidity-aware Portfolio Insights turn the thesis into an allocation." },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 80}>
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 h-full">
                  <div className="text-xs font-mono text-indigo-300 mb-4">{s.n}</div>
                  <h3 className="font-semibold text-lg mb-2">{s.t}</h3>
                  <p className="text-white/60 text-sm leading-relaxed">{s.b}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 10. EDUCATIONAL ─────────────────────────────────── */}
      <section id="educational" className="scroll-mt-20 py-32 border-t border-white/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-sky-950/30 via-transparent to-transparent pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <Reveal>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-sky-400/30 bg-sky-500/10 text-xs text-sky-200 mb-6">
                <BookOpen className="w-3 h-3" />
                Learn as you analyze
              </div>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
                Every metric explains itself.
              </h2>
              <p className="text-white/70 text-lg leading-relaxed mb-8">
                QuantForecast is a teaching terminal, not a black box. Hover any number
                and you get a plain-English <span className="text-white">&ldquo;What is it?&rdquo;</span> and{" "}
                <span className="text-white">&ldquo;How to read it?&rdquo;</span> with a worked example — so you
                understand the slope, the cone, and the base rate before you act on them.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "Plain-English definitions and worked examples on every metric",
                  "Regression cones, base rates, and linkage tilts each show their own math",
                  "Market-structure labels (HH, HL, LH, LL) drawn directly on the chart",
                  "Built for the curious investor — no jargon wall, no separate course",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-3 text-white/80">
                    <Check className="w-5 h-5 text-sky-300 shrink-0 mt-0.5" /> {f}
                  </li>
                ))}
              </ul>
              <Link
                to={user ? "/terminal" : "/auth"}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-[#07071a] font-medium hover:bg-white/90"
              >
                Try the terminal <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="relative">
              <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-sky-500/20 via-indigo-500/20 to-fuchsia-500/10 blur-2xl" />
              <div className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                <div className="text-xs uppercase tracking-widest text-white/40">
                  A metric, explained
                </div>
                <div className="rounded-xl border border-white/10 bg-[#0b0b22] p-4">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-white/80 text-sm">1σ probability cone</span>
                    <span className="text-sky-300 font-mono text-sm">+/- $3.40</span>
                  </div>
                  <div className="h-px bg-white/10 my-3" />
                  <div className="text-xs text-white/50 leading-relaxed">
                    <span className="text-white/70 font-medium">What is it?</span> The
                    band where the model expects the price to land ~68% of the time over
                    the forecast horizon, based on residual volatility.
                  </div>
                  <div className="text-xs text-white/50 leading-relaxed mt-2">
                    <span className="text-white/70 font-medium">How to read it:</span> A
                    narrow cone means low disagreement (but low expected move). A wide
                    cone means the model is honest about uncertainty — treat the
                    forecast accordingly.
                  </div>
                </div>
                <p className="text-xs text-white/40 text-center">
                  Every metric on the terminal works this way.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── 11. TRUST / SECURITY ────────────────────────────── */}
      <section className="py-24 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: <ShieldCheck className="w-5 h-5" />,
              title: "Educational, not advisory",
              body: "QuantForecast is not a registered investment adviser. Every metric ships with context so you decide.",
            },
            {
              icon: <Layers className="w-5 h-5" />,
              title: "Your data, your control",
              body: "Portfolios and preferences are encrypted at rest, protected by row-level security, and never sold.",
            },
            {
              icon: <Zap className="w-5 h-5" />,
              title: "Live prices, cached math",
              body: "Daily closes stream from Yahoo & FMP. Heavy models run in-browser or on-cache for zero lag.",
            },
          ].map((t, i) => (
            <Reveal key={t.title} delay={i * 80}>
              <TrustBlock icon={t.icon} title={t.title} body={t.body} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─── 11. PRICING TEASER ──────────────────────────────── */}
      <section id="pricing" className="scroll-mt-20 py-32 border-t border-white/5 bg-gradient-to-b from-transparent to-indigo-950/30">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <Reveal>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Simple pricing. No seat math.
            </h2>
            <p className="text-white/60 text-lg mb-10">
              Start free. Upgrade when the terminal pays for itself.
            </p>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 text-left">
            {[
              { name: "Market Pulse", price: "$0", who: "Light user", actions: "20 AI actions / mo", desc: "Regression chart on any ticker, 30-day horizon, 2 linkages unlocked." },
              { name: "Sector Intel", price: "$49", who: "Medium user", actions: "500 AI actions / mo", desc: "All 22 linkages, event catalog, backtests, all Hot Stocks tiers, CSV exports.", highlight: true },
              { name: "Signal Pro", price: "$89", who: "Heavy user", actions: "1,200 AI actions / mo", desc: "Everything in Sector Intel plus live linkage re-runs, custom horizons and room to work all day." },
              { name: "Custom Intel", price: "$149", who: "Power user", actions: "2,500 AI actions / mo", desc: "Your own leader → follower pairs, saved & monitored, plus API access." },
            ].map((p, i) => (
              <Reveal key={p.name} delay={i * 70}>
                <div
                  className={`rounded-2xl p-6 border h-full ${
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
                  <div className="text-[11px] font-mono uppercase tracking-widest text-white/50 mb-1">{p.who}</div>
                  <div className="text-sm text-white/80 mb-2">{p.actions}</div>
                  <p className="text-sm text-white/60">{p.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <p className="text-xs text-white/40 mt-6">
            An AI action = one QuantAgent question (1), one portfolio proposal (3) or one IPO report (5).
            Charts, forecasts and backtests are unlimited on every paid plan. Plans are personal — one
            person, a few devices.
          </p>

          <Link
            to="/pricing"
            className="inline-flex items-center gap-2 mt-10 px-6 py-3 rounded-full bg-white text-[#07071a] font-semibold hover:bg-white/90"
          >
            See full pricing <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ─── 12. FINAL CTA ───────────────────────────────────── */}
      <section className="py-32 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <Reveal>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
              Stop guessing which{" "}
              <span className="bg-gradient-to-r from-indigo-300 to-fuchsia-300 bg-clip-text text-transparent">
                signals are real.
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
          </Reveal>
        </div>
      </section>

      {/* ─── 13. FOOTER ──────────────────────────────────────── */}
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
              ["IPO Intelligence", "/ipo-intelligence"],
              ["Portfolio", "/portfolio"],
              ["Pricing", "/pricing"],
            ]}
          />
          <FooterCol
            title="Company"
            links={[
              ["Methodology", "/methodology"],
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

      <BackToTop />
    </div>
  );
}

/** Floating "back to top" pill; appears after the first screen. */
function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 600);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        })
      }
      className={`fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#07071a]/80 backdrop-blur-xl px-4 py-2.5 text-sm text-white/80 shadow-lg transition-all hover:text-white hover:border-white/30 ${
        show ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-3"
      }`}
    >
      <ArrowUp className="w-4 h-4" /> Top
    </button>
  );
}

/* ─── MOTION PRIMITIVES ──────────────────────────────────────── */

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Fires once when the element scrolls into view. */
function useInViewOnce<T extends HTMLElement>(rootMargin = "-10% 0px") {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin, threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, rootMargin]);
  return { ref, seen };
}

/** Fade up 16px, 400ms, once. Disabled under reduced motion. */
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduced = usePrefersReducedMotion();
  const { ref, seen } = useInViewOnce<HTMLDivElement>();
  const on = reduced || seen;
  return (
    <div
      ref={ref}
      style={{
        opacity: on ? 1 : 0,
        transform: on ? "translateY(0)" : "translateY(16px)",
        transition: reduced ? undefined : `opacity 400ms ease-out ${delay}ms, transform 400ms ease-out ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function CountUp({ to, prefix = "", suffix = "" }: { to: number; prefix?: string; suffix?: string }) {
  const reduced = usePrefersReducedMotion();
  const { ref, seen } = useInViewOnce<HTMLSpanElement>();
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!seen) return;
    if (reduced) {
      setVal(to);
      return;
    }
    const start = performance.now();
    const dur = 850;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(to * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, reduced, to]);

  return (
    <span ref={ref}>
      {prefix}
      {val}
      {suffix}
    </span>
  );
}

/** Slow-drifting particles connected by faint proximity lines, behind the hero. */
function ParticleField() {
  const reduced = usePrefersReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const COUNT = 50;
    const LINK = 108;

    type P = { x: number; y: number; vx: number; vy: number };
    let pts: P[] = [];

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      w = rect?.width ?? window.innerWidth;
      h = rect?.height ?? 600;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const seed = () => {
      pts = Array.from({ length: COUNT }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16,
      }));
    };

    resize();
    seed();

    let raf = 0;
    let running = true;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      }
      ctx.lineWidth = 0.6;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d = Math.hypot(dx, dy);
          if (d < LINK) {
            ctx.strokeStyle = `rgba(129,140,248,${(1 - d / LINK) * 0.15})`;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
      }
      ctx.fillStyle = "rgba(165,180,252,0.15)";
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      if (running) raf = requestAnimationFrame(draw);
    };
    draw();

    // Pause the loop while the hero is off-screen.
    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          const visible = entries.some((e) => e.isIntersecting);
          if (visible && !running) {
            running = true;
            raf = requestAnimationFrame(draw);
          } else if (!visible && running) {
            running = false;
            cancelAnimationFrame(raf);
          }
        },
        { threshold: 0 },
      );
      io.observe(canvas);
    }

    const onResize = () => {
      resize();
      seed();
    };
    window.addEventListener("resize", onResize);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io?.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [reduced]);

  if (reduced) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none select-none"
      style={{ pointerEvents: "none" }}
    />
  );
}

/* ─── PRESENTATIONAL SUB-COMPONENTS ─────────────────────────── */

function ProofCard({ header, children }: { header: string; children: React.ReactNode }) {
  return (
    <div className="h-full rounded-2xl border border-white/10 bg-[#0d0d24] p-5 shadow-2xl">
      <div className="flex items-center gap-1.5 mb-4">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
        <div className="ml-3 text-[10px] text-white/40 font-mono">{header}</div>
      </div>
      <div className="rounded-xl bg-[#07071a] border border-white/5 p-4">{children}</div>
    </div>
  );
}

function ProofLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[13px] leading-relaxed text-white/70 py-1 border-b border-white/5 last:border-0">
      {children}
    </div>
  );
}

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
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 h-full">
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
              <a href={href} className="qf-link hover:text-white">
                {label}
              </a>
            ) : (
              <Link to={href} className="qf-link hover:text-white">
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

/** Styled mock of the QuantAgent chat panel, using the MockTerminal card treatment. */
function MockAgentChat() {
  return (
    <div className="relative rounded-2xl border border-white/10 bg-[#0d0d24] p-4 shadow-[0_30px_120px_-20px_rgba(139,92,246,0.5)]">
      <div className="flex items-center gap-1.5 mb-3">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
        <div className="ml-3 text-[10px] text-white/40 font-mono">
          quant-forecast.com/terminal · QuantAgent
        </div>
      </div>
      <div className="rounded-xl bg-[#07071a] border border-white/5 p-4 space-y-3">
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-500/20 border border-indigo-400/20 px-3.5 py-2 text-sm text-indigo-50">
            switch to NVDA and tell me if the trend is real
          </div>
        </div>
        <div className="flex justify-start">
          <div className="max-w-[92%] rounded-2xl rounded-bl-sm bg-white/[0.04] border border-white/10 px-3.5 py-2.5 text-sm text-white/80 leading-relaxed">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-fuchsia-300 mb-2">
              <Bot className="w-3 h-3" /> QuantAgent
            </div>
            Chart switched to NVDA. The 90-day slope is positive, but out-of-sample model
            fit is 41/100 and direction was correct in 7 of 12 windows — that is close to a
            coin flip.
            <div className="mt-2 font-mono text-[12px] text-white/55 space-y-0.5">
              <div>model fit ......... 41/100</div>
              <div>direction ........ 7 of 12 windows</div>
              <div>expected move .... ±7.2% / 30d</div>
            </div>
            <div className="mt-2 text-white/60">
              I would not call this trend validated. Treat it as weak evidence.
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {["Open Hot Stocks", "Show base rates", "Run the backtest"].map((s) => (
            <span
              key={s}
              className="text-[11px] px-2.5 py-1 rounded-full border border-white/10 text-white/55"
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

type LinkNode = { x: number; y: number; l: string; macro?: boolean };

const LG_NODES: LinkNode[] = [
  { x: 80, y: 55, l: "Semis" },
  { x: 250, y: 42, l: "Software" },
  { x: 355, y: 115, l: "Mega Tech" },
  { x: 330, y: 245, l: "Banks" },
  { x: 70, y: 175, l: "Energy" },
  { x: 205, y: 315, l: "Transports" },
  { x: 195, y: 160, l: "10Y", macro: true },
  { x: 62, y: 300, l: "Oil", macro: true },
  { x: 355, y: 340, l: "Gold", macro: true },
];

/** [leader, follower, sign (+1 positive / -1 inverse), lag label] */
const LG_EDGES: [number, number, 1 | -1, string][] = [
  [6, 3, -1, "3d"],
  [7, 4, 1, "2d"],
  [0, 1, 1, "3d"],
  [1, 2, 1, "2d"],
  [4, 5, -1, "4d"],
  [8, 3, -1, "3d"],
  [0, 2, 1, "2d"],
  [7, 5, -1, "3d"],
];

/** Quadratic curve leader→follower with a gentle perpendicular bow. */
function lgCurve(a: LinkNode, b: LinkNode) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (-dy / len) * len * 0.16;
  const cy = my + (dx / len) * len * 0.16;
  const d = `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
  // midpoint of the quadratic (t = 0.5) for the lag label
  const lx = 0.25 * a.x + 0.5 * cx + 0.25 * b.x;
  const ly = 0.25 * a.y + 0.5 * cy + 0.25 * b.y;
  // sampled arc length for the stroke-dash draw
  let approx = 0;
  let px = a.x;
  let py = a.y;
  for (let i = 1; i <= 16; i++) {
    const t = i / 16;
    const qx = (1 - t) ** 2 * a.x + 2 * (1 - t) * t * cx + t * t * b.x;
    const qy = (1 - t) ** 2 * a.y + 2 * (1 - t) * t * cy + t * t * b.y;
    approx += Math.hypot(qx - px, qy - py);
    px = qx;
    py = qy;
  }
  return { d, len: approx, lx, ly };
}

const EDGE_MS = 620;
const EDGE_STAGGER = 110;
const NODE_STAGGER = 70;

function MockLinkageGraph() {
  const reduced = usePrefersReducedMotion();
  const { ref, seen } = useInViewOnce<HTMLDivElement>();
  const active = reduced || seen;

  const nodesDone = LG_NODES.length * NODE_STAGGER;

  return (
    <div
      ref={ref}
      className="relative rounded-2xl border border-white/10 bg-[#0d0d24] p-6 aspect-square max-w-[500px] mx-auto"
    >
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-fuchsia-500/10" />
      <style>{`
        @keyframes qf-draw { to { stroke-dashoffset: 0; } }
        @keyframes qf-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes qf-travel { from { offset-distance: 0% } to { offset-distance: 100% } }
      `}</style>
      <svg viewBox="0 0 420 380" className="relative w-full h-full">
        {/* edges */}
        {LG_EDGES.map(([a, b, sign, lag], i) => {
          const { d, len, lx, ly } = lgCurve(LG_NODES[a], LG_NODES[b]);
          const color = sign > 0 ? "#34d399" : "#f87171";
          const delay = nodesDone + i * EDGE_STAGGER;
          return (
            <g key={`e${i}`}>
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeOpacity="0.5"
                strokeWidth="1.5"
                strokeDasharray={reduced ? undefined : len}
                style={
                  reduced
                    ? undefined
                    : {
                        strokeDashoffset: active ? 0 : len,
                        animation: active ? `qf-draw ${EDGE_MS}ms ease-out ${delay}ms both` : undefined,
                      }
                }
              />
              {/* glowing dot travelling leader → follower, after the edge completes */}
              {!reduced && active && (
                <circle
                  r="3"
                  fill={color}
                  fillOpacity="0.9"
                  style={{
                    offsetPath: `path('${d}')`,
                    filter: `drop-shadow(0 0 4px ${color})`,
                    animation: `qf-travel 2.1s linear ${delay + EDGE_MS}ms infinite, qf-fade 300ms ease-out ${delay + EDGE_MS}ms both`,
                  }}
                />
              )}
              {/* lag label at the curve midpoint */}
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                fill={color}
                fontSize="9"
                fontFamily="'Geist Mono',monospace"
                opacity={reduced ? 1 : 0}
                style={
                  reduced
                    ? undefined
                    : { animation: active ? `qf-fade 300ms ease-out ${delay + EDGE_MS}ms both` : undefined }
                }
              >
                {lag}
              </text>
            </g>
          );
        })}

        {/* nodes: sectors = rounded rects, macro = diamonds */}
        {LG_NODES.map((n, i) => (
          <g
            key={n.l}
            opacity={reduced ? 1 : 0}
            style={
              reduced
                ? undefined
                : { animation: active ? `qf-fade 320ms ease-out ${i * NODE_STAGGER}ms both` : undefined }
            }
          >
            {n.macro ? (
              <rect
                x={n.x - 13}
                y={n.y - 13}
                width="26"
                height="26"
                rx="4"
                fill="#1e1b4b"
                stroke="#fbbf24"
                strokeOpacity="0.7"
                transform={`rotate(45 ${n.x} ${n.y})`}
              />
            ) : (
              <rect
                x={n.x - 34}
                y={n.y - 13}
                width="68"
                height="26"
                rx="8"
                fill="#1e1b4b"
                stroke="#818cf8"
                strokeOpacity="0.7"
              />
            )}
            <text
              x={n.x}
              y={n.macro ? n.y + 30 : n.y + 4}
              textAnchor="middle"
              fill="#e0e7ff"
              fontSize={n.macro ? 10 : 10}
              fontFamily="'Geist Mono',monospace"
            >
              {n.l}
            </text>
          </g>
        ))}
      </svg>

      <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-4 text-[10px] text-white/45 font-mono">
        <span className="flex items-center gap-1">
          <span className="w-3 h-[2px] bg-emerald-400 inline-block" /> positive
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-[2px] bg-red-400 inline-block" /> inverse
        </span>
        <span>◆ macro</span>
      </div>
    </div>
  );
}
