// supabase/functions/fetch-ipo-intelligence/index.ts
// Called when user clicks "Refresh" on the IPO Intelligence page.
// 1. Calls Claude API with web search enabled
// 2. Validates the JSON response
// 3. Scores each company with the deterministic risk engine
// 4. Writes results to Supabase
// 5. Returns scored results to the frontend

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
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

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

type ClaudeTextBlock = { type: 'text'; text: string };

async function callClaude(prompt: string, maxTokens = 8192) {
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
      max_tokens: maxTokens,
      system: CLAUDE_SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!claudeRes.ok) {
    const err = await claudeRes.text();
    throw new Error(`Claude API error: ${err}`);
  }

  const claudeData = await claudeRes.json();
  const textBlock = claudeData.content
    ?.filter((b: { type: string }) => b.type === 'text')
    ?.map((b: ClaudeTextBlock) => b.text)
    ?.join('');

  if (!textBlock) throw new Error('No text response from Claude');

  return textBlock;
}

async function repairJsonWithClaude(raw: string) {
  const repairRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: 'You repair JSON. Return only one valid JSON array. No markdown, no explanations.',
      messages: [{
        role: 'user',
        content: `Convert this into one valid JSON array. Preserve fields and values. Drop prose outside the array. If the array is truncated, close the current object/array safely and return only complete objects.\n\n${raw}`,
      }],
    }),
  });

  if (!repairRes.ok) {
    const err = await repairRes.text();
    throw new Error(`Claude JSON repair error: ${err}`);
  }

  const repairData = await repairRes.json();
  const repairedText = repairData.content
    ?.filter((b: { type: string }) => b.type === 'text')
    ?.map((b: ClaudeTextBlock) => b.text)
    ?.join('');

  if (!repairedText) throw new Error('No repair response from Claude');

  return repairedText;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { horizon, customQuery } = await req.json() as {
      horizon: IpoHorizon;
      customQuery?: string;
    };

    if (!['imminent','near','medium','long'].includes(horizon)) {
      return new Response(
        JSON.stringify({ error: 'Invalid horizon' }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // --- Call Claude with web search ---
    const textBlock = await callClaude(buildClaudePrompt(horizon, customQuery));

    // --- Validate and score ---
    let facts;
    try {
      facts = validateClaudeResponse(textBlock);
    } catch (e) {
      console.error('Claude raw text (first 1500 chars):', textBlock.slice(0, 1500));
      const repairedText = await repairJsonWithClaude(textBlock);
      try {
        facts = validateClaudeResponse(repairedText);
      } catch (repairError) {
        console.error('Claude repaired text (first 1500 chars):', repairedText.slice(0, 1500));
        throw repairError;
      }
    }

    if (!facts.length) throw new Error('No valid IPO entries returned');

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
      { headers: jsonHeaders }
    );

  } catch (err) {
    console.error('fetch-ipo-intelligence error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
