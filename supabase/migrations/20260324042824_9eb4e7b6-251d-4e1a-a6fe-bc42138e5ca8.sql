
-- Portfolio holdings table
CREATE TABLE public.portfolio_holdings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ticker TEXT NOT NULL,
  company_name TEXT,
  shares NUMERIC NOT NULL DEFAULT 0,
  avg_cost NUMERIC NOT NULL DEFAULT 0,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, ticker)
);

-- Enable RLS
ALTER TABLE public.portfolio_holdings ENABLE ROW LEVEL SECURITY;

-- Users can only see their own holdings
CREATE POLICY "Users can view own holdings"
ON public.portfolio_holdings
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own holdings
CREATE POLICY "Users can insert own holdings"
ON public.portfolio_holdings
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own holdings
CREATE POLICY "Users can update own holdings"
ON public.portfolio_holdings
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own holdings
CREATE POLICY "Users can delete own holdings"
ON public.portfolio_holdings
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
