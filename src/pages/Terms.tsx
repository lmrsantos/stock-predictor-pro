import { Link } from "react-router-dom";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-6 font-mono text-sm leading-relaxed">
        <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Back</Link>
        <h1 className="text-2xl font-bold">Terms of Service</h1>
        <p className="text-muted-foreground text-xs">Last updated: {new Date().toLocaleDateString()}</p>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">1. Not Investment Advice</h2>
          <p>
            QuantForecast (the "Service") is an educational and informational
            quantitative-research platform. <strong>QuantForecast is NOT a
            registered investment adviser, broker-dealer, financial planner,
            tax adviser, or fiduciary</strong> under the U.S. Investment Advisers
            Act of 1940, FINRA, the SEC, or any equivalent regulator in any
            other jurisdiction.
          </p>
          <p>
            Nothing on this Service — including quantitative signals, regression
            forecasts, backtests, AI-generated commentary, allocation models,
            "hot stocks" lists, or chatbot responses — constitutes a
            recommendation, solicitation, offer, or endorsement to buy, sell,
            hold, or transact in any security, derivative, fund, cryptocurrency,
            or other financial instrument.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">2. Educational Purpose Only</h2>
          <p>
            All output is provided "as is" for general informational and
            educational purposes. You are solely responsible for your own
            investment decisions and should consult a licensed financial
            adviser, tax professional, and/or attorney in your jurisdiction
            before acting on any information.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">3. No Warranty</h2>
          <p>
            Market data is sourced from third parties and may be delayed,
            inaccurate, or incomplete. Past performance, backtests, regression
            slopes, and AI commentary do not guarantee or predict future results.
            Investing in securities involves substantial risk of loss, including
            loss of principal.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">4. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, QuantForecast, its
            operators, contributors, and affiliates shall not be liable for any
            direct, indirect, incidental, consequential, or punitive damages
            arising from your use of the Service or reliance on any content,
            including but not limited to trading losses, missed opportunities,
            or data inaccuracies.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">5. User Acknowledgment</h2>
          <p>
            By using the Service — and in particular by using the Portfolio
            Advisor, Quant Agent chatbot, Hot Stocks scanner, or any backtest —
            you acknowledge and agree that (a) you have read and understood
            these terms, (b) you understand the Service is informational only,
            and (c) you accept full responsibility for any investment decisions
            you make.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">6. Eligibility</h2>
          <p>
            You must be at least 18 years old and legally able to enter into
            this agreement in your jurisdiction. The Service is not directed at
            residents of jurisdictions where the provision or use of the
            Service would be contrary to local law.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">7. Changes</h2>
          <p>
            We may update these Terms at any time. Continued use of the Service
            after changes constitutes acceptance of the revised Terms.
          </p>
        </section>

        <p className="text-xs text-muted-foreground pt-6">
          Questions? Contact admin@quantforecast.com.
        </p>
      </div>
    </div>
  );
}
