CREATE TABLE public.ipo_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  horizon TEXT NOT NULL CHECK (horizon IN ('imminent','near','medium','long')),
  name TEXT NOT NULL,
  sector TEXT NOT NULL,
  brief TEXT NOT NULL,
  stage TEXT NOT NULL,
  ipo_timeline_note TEXT,
  platforms JSONB NOT NULL DEFAULT '[]',
  min_investment TEXT,
  accredited_required BOOLEAN NOT NULL DEFAULT true,
  sources JSONB NOT NULL DEFAULT '[]',
  risk_tier TEXT NOT NULL CHECK (risk_tier IN ('lower','medium','high','very_high')),
  risk_label TEXT NOT NULL,
  risk_score INT NOT NULL,
  our_view TEXT NOT NULL,
  dimension_scores JSONB NOT NULL,
  raw_facts JSONB NOT NULL,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON public.ipo_intelligence (horizon);
CREATE INDEX ON public.ipo_intelligence (risk_tier);
CREATE INDEX ON public.ipo_intelligence (sector);

GRANT SELECT ON public.ipo_intelligence TO anon, authenticated;
GRANT ALL ON public.ipo_intelligence TO service_role;

ALTER TABLE public.ipo_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read ipo_intelligence"
  ON public.ipo_intelligence FOR SELECT
  USING (true);

CREATE POLICY "Service role manages ipo_intelligence"
  ON public.ipo_intelligence FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');