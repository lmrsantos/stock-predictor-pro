CREATE TABLE public.checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','archived')),
  auto_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_entries jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text
);

CREATE INDEX checklists_user_ticker_idx ON public.checklists (user_id, ticker);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklists TO authenticated;
GRANT ALL ON public.checklists TO service_role;

ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own checklists" ON public.checklists
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_checklists_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER checklists_set_updated_at
  BEFORE UPDATE ON public.checklists
  FOR EACH ROW EXECUTE FUNCTION public.touch_checklists_updated_at();