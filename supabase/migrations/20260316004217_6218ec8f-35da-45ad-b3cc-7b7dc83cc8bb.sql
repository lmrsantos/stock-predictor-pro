
CREATE TABLE public.market_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  ticker TEXT,
  signal_type TEXT DEFAULT 'general',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.market_updates ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "Market updates are publicly readable"
ON public.market_updates
FOR SELECT
TO public
USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_updates;
