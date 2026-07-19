CREATE TABLE public.linkage_cache (
  id integer PRIMARY KEY DEFAULT 1,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT linkage_cache_single_row CHECK (id = 1)
);

GRANT SELECT ON public.linkage_cache TO anon;
GRANT SELECT, INSERT, UPDATE ON public.linkage_cache TO authenticated;
GRANT ALL ON public.linkage_cache TO service_role;

ALTER TABLE public.linkage_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read linkage cache"
  ON public.linkage_cache FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can upsert linkage cache"
  ON public.linkage_cache FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update linkage cache"
  ON public.linkage_cache FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);
