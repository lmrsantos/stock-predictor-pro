// supabase/functions/fetch-ipo-intelligence/index.ts
// Called when user clicks "Refresh" on the IPO Intelligence page.
// 1. Calls Claude API with web search enabled
// 2. Validates the JSON response
// 3. Scores each company with the deterministic risk engine
// 4. Writes results to Supabase
// 5. Returns scored results to the frontend

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildClaudePrompt,
  validateClaudeResponse,
  scoreIpoUniverse,
  CLAUDE_SYSTEM_PROMPT,
  type IpoHorizon,
} from '../_shared/ipo-risk-engine.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { horizon, customQuery } = await req.json() as {
      horizon: IpoHorizon;
      customQuery?: string;
    };

    if (!['imminent','near','medium','long'].includes(horizon)) {
      return new Response(
        JSON.stringify({ error: 'Invalid horizon' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    // --- Call Claude with web search ---
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'tools-2024-04-04',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: CLAUDE_SYSTEM_PROMPT,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: buildClaudePrompt(horizon, customQuery) }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      throw new Error(`Claude API error: ${err}`);
    }

    const claudeData = await claudeRes.json();

    // Extract the final text block (Claude may have web_search tool_use blocks first)
    const textBlock = claudeData.content
      ?.filter((b: { type: string }) => b.type === 'text')
      ?.map((b: { text: string }) => b.text)
      ?.join('');

    if (!textBlock) throw new Error('No text response from Claude');

    // --- Validate and score ---
    const facts   = validateClaudeResponse(textBlock);
    const scored  = scoreIpoUniverse(facts);

    // --- Write to Supabase ---
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Delete previous results for this horizon then insert fresh
    await supabase
      .from('ipo_intelligence')
      .delete()
      .eq('horizon', horizon);

    const rows = scored.map(s => ({
      horizon,
      name:               s.facts.name,
      sector:             s.facts.sector,
      brief:              s.facts.brief,
      stage:              s.facts.stage,
      ipo_timeline_note:  s.facts.ipoTimelineNote,
      platforms:          s.facts.platforms,
      min_investment:     s.facts.minInvestment,
      accredited_required: s.facts.accreditedRequired,
      sources:            s.facts.sources,
      risk_tier:          s.riskTier,
      risk_label:         s.riskLabel,
      risk_score:         s.normalizedScore,
      our_view:           s.ourView,
      dimension_scores:   s.dimensions,
      raw_facts:          s.facts,
      refreshed_at:       new Date().toISOString(),
    }));

    const { error: insertError } = await supabase
      .from('ipo_intelligence')
      .insert(rows);

    if (insertError) throw new Error(`Supabase insert error: ${insertError.message}`);

    return new Response(
      JSON.stringify({ data: scored, refreshedAt: new Date().toISOString() }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('fetch-ipo-intelligence error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
