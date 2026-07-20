CREATE TABLE public.macro_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_key text NOT NULL UNIQUE,
  value numeric,
  previous_value numeric,
  change_30d numeric,
  as_of_date date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.macro_indicators TO anon, authenticated;
GRANT ALL ON public.macro_indicators TO service_role;

ALTER TABLE public.macro_indicators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Macro indicators are publicly readable"
  ON public.macro_indicators FOR SELECT
  USING (true);
