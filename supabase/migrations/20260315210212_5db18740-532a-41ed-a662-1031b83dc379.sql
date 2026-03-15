
-- Table to store company fundamentals (P/E, market cap, etc.)
CREATE TABLE public.stock_fundamentals (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    ticker TEXT NOT NULL UNIQUE,
    company_name TEXT,
    sector TEXT,
    industry TEXT,
    pe_ratio NUMERIC,
    forward_pe NUMERIC,
    market_cap BIGINT,
    eps NUMERIC,
    dividend_yield NUMERIC,
    fifty_two_week_high NUMERIC,
    fifty_two_week_low NUMERIC,
    currency TEXT DEFAULT 'USD',
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_fundamentals_ticker ON public.stock_fundamentals (ticker);

ALTER TABLE public.stock_fundamentals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fundamentals are publicly readable"
ON public.stock_fundamentals FOR SELECT
USING (true);
