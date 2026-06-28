import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-6 font-mono text-sm leading-relaxed">
        <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Back</Link>
        <h1 className="text-2xl font-bold">Privacy Policy</h1>
        <p className="text-muted-foreground text-xs">Last updated: {new Date().toLocaleDateString()}</p>

        <p>
          This Privacy Policy explains what information QuantForecast (the
          "Service", "we", "us") collects, how we use it, and your rights. It
          supplements our{" "}
          <Link to="/terms" className="underline">Terms of Service</Link>.
        </p>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">1. Information We Collect</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Account data:</strong> email address, hashed password,
              account creation date, subscription tier.
            </li>
            <li>
              <strong>Usage data:</strong> tickers viewed, scans run, feature
              counters, IP address, browser/user-agent, timestamps.
            </li>
            <li>
              <strong>Payment data:</strong> handled directly by Stripe — we
              receive only customer ID, plan, status, and last-4 of the card.
              We never see or store full card numbers.
            </li>
            <li>
              <strong>User-provided inputs:</strong> portfolio entries, risk
              profile, chat messages you send to the AI agent.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">2. How We Use It</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>operate, secure, and improve the Service;</li>
            <li>authenticate you and enforce subscription entitlements;</li>
            <li>process payments and send transactional emails (receipts, password reset);</li>
            <li>monitor usage limits and prevent abuse;</li>
            <li>comply with legal obligations.</li>
          </ul>
          <p>
            We do <strong>not</strong> sell your personal information. We do not
            use your portfolio inputs or chat messages to train third-party AI
            models beyond what is required to return the response to you.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">3. Third-Party Processors</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Stripe</strong> — payments and subscription billing.</li>
            <li><strong>Lovable Cloud</strong> (Supabase) — authentication, database, edge functions, hosting.</li>
            <li><strong>Lovable AI Gateway</strong> (Google Gemini) — AI chat and commentary generation.</li>
            <li><strong>Financial Modeling Prep, Yahoo Finance</strong> — market data.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">4. Data Retention</h2>
          <p>
            Account and usage data are retained while your account is active.
            After cancellation or deletion request, data is purged within 30
            days, except where retention is required by law (e.g. tax/financial
            records held by Stripe for up to 7 years).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">5. Your Rights (GDPR / CCPA)</h2>
          <p>
            Depending on your jurisdiction, you may have the right to access,
            correct, delete, export, or restrict processing of your personal
            data, and to opt out of "sale" of personal information (we do not
            sell). To exercise any right, email{" "}
            <a href="mailto:contact@quant-forecast.com" className="underline">
              contact@quant-forecast.com
            </a>
            . We will respond within 30 days.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">6. Cookies</h2>
          <p>
            We use only essential cookies and local storage required for
            authentication and session management. We do not currently use
            third-party advertising or tracking cookies.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">7. Security</h2>
          <p>
            Data is encrypted in transit (TLS) and at rest by our infrastructure
            providers. No method of transmission or storage is 100% secure; you
            use the Service at your own risk.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">8. International Transfers</h2>
          <p>
            Your data may be processed in the United States and other
            jurisdictions where our providers operate. By using the Service you
            consent to such transfers.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">9. Children</h2>
          <p>
            The Service is not directed to anyone under 18 and we do not
            knowingly collect data from minors.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">10. Changes</h2>
          <p>
            We may update this Policy. Material changes will be announced in-app
            or by email. Continued use constitutes acceptance.
          </p>
        </section>

        <p className="text-xs text-muted-foreground pt-6">
          Contact: contact@quant-forecast.com · quant-forecast.com
        </p>
      </div>
    </div>
  );
}
