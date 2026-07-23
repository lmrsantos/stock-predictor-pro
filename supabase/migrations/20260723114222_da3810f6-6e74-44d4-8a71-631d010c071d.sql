
CREATE TABLE public.custom_linkage_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leader text NOT NULL,
  follower text NOT NULL,
  lag_days int,
  coefficient numeric,
  p_value numeric,
  p_adjusted numeric,
  r_squared_delta numeric,
  validated boolean,
  channel text,
  ran_at timestamptz NOT NULL DEFAULT now(),
  is_private boolean NOT NULL DEFAULT true,
  purchase_type text CHECK (purchase_type IN ('subscription','one_time'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_linkage_analyses TO authenticated;
GRANT ALL ON public.custom_linkage_analyses TO service_role;

ALTER TABLE public.custom_linkage_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own custom analyses"
  ON public.custom_linkage_analyses
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX custom_linkage_analyses_user_ran_idx
  ON public.custom_linkage_analyses (user_id, ran_at DESC);
