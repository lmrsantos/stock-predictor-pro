import { Link } from "react-router-dom";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-6 font-mono text-sm leading-relaxed">
        <Link to="/terminal" className="text-xs text-muted-foreground hover:text-foreground">← Back</Link>
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
          <p>
            <strong>AI-generated content may contain errors, hallucinations, or
            outdated information</strong> and should never be the sole basis for
            a financial decision. Market data is sourced from third parties and
            may be delayed, inaccurate, or incomplete. You are solely responsible
            for independently verifying any information before acting on it.
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
            Insights, Quant Agent chatbot, Hot Stocks scanner, or any backtest —
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
          <h2 className="text-lg font-semibold">7. Subscriptions, Billing, and Refunds</h2>
          <p>
            Paid plans (Pro, Elite) are billed in advance on a recurring monthly
            or yearly basis through our payment processor (Stripe).{" "}
            <strong>Subscriptions auto-renew</strong> at the end of each billing
            cycle at the then-current rate until canceled.
          </p>
          <p>
            <strong>Cancellation:</strong> You may cancel at any time from the
            Account page. Cancellation takes effect at the end of the current
            billing period; you retain access to paid features until that date.
          </p>
          <p>
            <strong>Refunds:</strong> All payments are{" "}
            <strong>non-refundable</strong>, except where required by applicable
            law. We do not provide refunds or credits for partial billing
            periods, unused time, or downgrades.
          </p>
          <p>
            <strong>After cancellation or non-payment:</strong> Access to paid
            features is revoked at the end of the paid period. Account data
            (saved tickers, portfolio entries) is retained for 30 days, after
            which it may be permanently deleted.
          </p>
          <p>
            We reserve the right to change pricing on 30 days' notice. Price
            changes do not affect the current paid billing period.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">8. Intellectual Property</h2>
          <p>
            All content, software, algorithms, models, datasets, designs, and
            documentation comprising the Service — including but not limited to
            the QuantPulse™ scoring model, the autoencoder anomaly engine,
            regression and cycle-analysis algorithms, thematic intelligence
            content, UI, and copy — are the{" "}
            <strong>exclusive property of QuantForecast</strong> and its
            licensors, protected by copyright, trademark, and trade-secret law.
          </p>
          <p>
            You are granted a limited, non-exclusive, non-transferable,
            revocable license to use the Service for personal, non-commercial
            purposes. You may{" "}
            <strong>
              not copy, modify, reverse-engineer, decompile, redistribute,
              sublicense, sell, or create derivative works
            </strong>{" "}
            of any part of the Service.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">9. Prohibited Uses</h2>
          <p>You agree NOT to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              scrape, crawl, harvest, mirror, or use automated means (bots,
              scripts, headless browsers) to access the Service without prior
              written permission;
            </li>
            <li>
              resell, redistribute, syndicate, or republish any signals, data,
              backtests, or AI output produced by the Service;
            </li>
            <li>
              circumvent rate limits, paywalls, usage caps, authentication, or
              any other technical restriction;
            </li>
            <li>
              use the Service to build a competing product, model, or dataset;
            </li>
            <li>
              upload malware, attempt to overload our infrastructure, or
              interfere with other users;
            </li>
            <li>
              use the Service for unlawful activity, market manipulation, or
              securities fraud.
            </li>
          </ul>
          <p>
            Violations may result in immediate account termination without
            refund and legal action.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">10. Privacy</h2>
          <p>
            Your use of the Service is also governed by our{" "}
            <Link to="/privacy" className="underline">Privacy Policy</Link>,
            which describes what personal information we collect, how we use it,
            and the third-party processors (including Stripe for payments and
            our authentication and database provider) that handle your data. By
            using the Service you consent to the practices described in the
            Privacy Policy.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">11. Governing Law &amp; Arbitration</h2>
          <p>
            These Terms are governed by the laws of the State of Delaware,
            United States, without regard to its conflict-of-laws principles.
          </p>
          <p>
            <strong>Binding arbitration.</strong> Any dispute, claim, or
            controversy arising out of or relating to these Terms or the
            Service shall be resolved by <strong>final and binding
            arbitration</strong> administered by the American Arbitration
            Association under its Commercial Arbitration Rules, seated in
            Delaware, in English. Judgment on the award may be entered in any
            court of competent jurisdiction.
          </p>
          <p>
            <strong>Class-action waiver.</strong> You and QuantForecast each
            agree to bring claims only in an individual capacity, and{" "}
            <strong>
              waive any right to participate in a class, collective, or
              representative action
            </strong>
            . If this waiver is found unenforceable, the arbitration clause is
            severed and the dispute proceeds in the state or federal courts of
            Delaware, to whose exclusive jurisdiction you consent.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">12. Changes</h2>
          <p>
            We may update these Terms at any time. Continued use of the Service
            after changes constitutes acceptance of the revised Terms.
          </p>
        </section>

        <p className="text-xs text-muted-foreground pt-6">
          Questions? Contact contact@quant-forecast.com · quant-forecast.com
        </p>
      </div>
    </div>
  );
}
