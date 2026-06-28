import { Link } from "react-router-dom";

export default function Disclaimer() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-6 font-mono text-sm leading-relaxed">
        <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Back</Link>
        <h1 className="text-2xl font-bold">Full Disclaimer</h1>

        <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-4 space-y-2">
          <p className="font-semibold text-amber-200">
            QuantForecast is NOT a registered investment adviser.
          </p>
          <p className="text-amber-100/80 text-xs">
            All content is provided for informational and educational purposes
            only. Nothing on this site constitutes investment, financial, tax,
            or legal advice or a recommendation to buy, sell, or hold any
            security.
          </p>
        </div>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">What this Service is</h2>
          <p>
            A quantitative-research and educational platform. It applies linear
            regression, autoencoder anomaly detection, macro regime
            classification, and historical backtesting to publicly available
            market data, and surfaces the results in a research interface.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">What this Service is not</h2>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>It is not a brokerage and does not execute trades.</li>
            <li>It is not personalized investment advice.</li>
            <li>It does not consider your full financial situation, tax position, or objectives.</li>
            <li>"Illustrative" dollar amounts shown anywhere on the site are mathematical examples only — never recommendations.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Past performance &amp; forecasts</h2>
          <p>
            Backtests are hypothetical. They do not reflect actual trading,
            slippage, taxes, or live execution. Forecasts derived from
            regression or machine-learning models are mathematical projections,
            not predictions, and may be materially wrong.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Your responsibility</h2>
          <p>
            Always consult a licensed financial adviser, tax professional, or
            attorney in your jurisdiction before making any investment
            decision. You assume full responsibility for any action you take
            based on content from this Service.
          </p>
        </section>

        <p className="text-xs text-muted-foreground pt-4">
          See also our{" "}
          <Link to="/terms" className="underline hover:text-foreground">
            Terms of Service
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
