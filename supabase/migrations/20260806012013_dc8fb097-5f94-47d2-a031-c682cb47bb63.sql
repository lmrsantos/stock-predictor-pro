CREATE TABLE public.symbol_metadata (
  ticker text PRIMARY KEY,
  ipo_date date,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.symbol_metadata TO anon;
GRANT SELECT ON public.symbol_metadata TO authenticated;
GRANT ALL ON public.symbol_metadata TO service_role;

ALTER TABLE public.symbol_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Symbol metadata is publicly readable"
ON public.symbol_metadata FOR SELECT
USING (true);