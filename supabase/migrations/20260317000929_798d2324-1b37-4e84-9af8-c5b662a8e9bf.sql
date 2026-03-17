
CREATE TABLE public.geopolitical_sentiment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tension_score INTEGER NOT NULL CHECK (tension_score >= 0 AND tension_score <= 100),
  severity TEXT NOT NULL DEFAULT 'low',
  key_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.geopolitical_sentiment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read geopolitical sentiment"
  ON public.geopolitical_sentiment FOR SELECT
  TO anon, authenticated
  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.geopolitical_sentiment;
