# QuantAgent Evidence-First Safety Gate

QuantAgent should not need a new prompt patch for every bad answer. Move factual safety out of model discretion and enforce it in the backend before and after generation.

## Build

1. **Deterministic request routing**
   - Classify each question in code as live/current, earnings, price/trend, company-specific, platform-data, or general education.
   - Extract ticker symbols and company names from the question and current context.
   - Automatically gather the required evidence before calling the model: earnings calendar for earnings, live quote for market numbers, and live research for current/company/event questions. The model no longer decides whether research happens.

2. **Evidence envelope**
   - Give every source a stable source ID, timestamp/as-of date, source name, and structured facts.
   - Instruct the model to answer current factual questions only from that envelope and attach source IDs to factual claims.
   - Keep platform metrics clearly separate from external facts so regression/backtest values are never presented as live-market facts.

3. **Post-generation claim gate**
   - For evidence-required questions, reject answers that contain unsupported dates, prices, percentages, named events, or no evidence references.
   - Replace a rejected answer with a transparent evidence-limited response rather than allowing a plausible guess through.
   - Preserve normal educational explanations when no live factual claim is required.

4. **Visible trust state**
   - Return and render a compact status on each answer: `Verified`, `Platform data`, or `Evidence unavailable`, with source names/as-of times where applicable.
   - Remove the generic “Searching web” claim when the request does not require research.

5. **Gateway failure behavior**
   - Surface the gateway's actual user-facing error message and status; do not turn blocked/credit/configuration failures into a generic assistant answer.
   - Keep retries limited to retryable statuses only and avoid charging the user for failed generation.

## Validation

- Test representative questions covering earnings, “what happened today,” current price, trend interpretation, company fundamentals, platform backtests, and timeless educational concepts.
- Include adversarial cases where live tools return no result; QuantAgent must withhold the claim instead of using memory.
- Invoke the deployed QuantAgent function and inspect the real responses before considering the change complete.

## Technical Scope

- Primary backend: `supabase/functions/quant-agent/index.ts`
- Answer trust display: `src/components/QuantAgent.tsx`
- No new product feature or navigation changes.