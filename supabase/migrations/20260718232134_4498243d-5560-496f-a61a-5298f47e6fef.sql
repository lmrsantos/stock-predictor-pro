ALTER TABLE public.portfolio_holdings ADD COLUMN IF NOT EXISTS purchase_date DATE;
UPDATE public.portfolio_holdings SET purchase_date = added_at::date WHERE purchase_date IS NULL;