
-- Table to store stock price history from Yahoo Finance
CREATE TABLE public.stock_prices (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    ticker TEXT NOT NULL,
    date DATE NOT NULL,
    open NUMERIC NOT NULL,
    high NUMERIC NOT NULL,
    low NUMERIC NOT NULL,
    close NUMERIC NOT NULL,
    volume BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (ticker, date)
);

-- Index for fast lookups by ticker and date range
CREATE INDEX idx_stock_prices_ticker_date ON public.stock_prices (ticker, date DESC);

-- Enable RLS (public read, no direct writes from client)
ALTER TABLE public.stock_prices ENABLE ROW LEVEL SECURITY;

-- Anyone can read stock prices (public market data)
CREATE POLICY "Stock prices are publicly readable"
ON public.stock_prices FOR SELECT
USING (true);
