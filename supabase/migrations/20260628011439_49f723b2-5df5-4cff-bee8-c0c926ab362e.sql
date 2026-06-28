
-- Subscriptions table
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  stripe_subscription_id text NOT NULL UNIQUE,
  stripe_customer_id text NOT NULL,
  product_id text NOT NULL,
  price_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_id ON public.subscriptions(stripe_subscription_id);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscription" ON public.subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role manages subscriptions" ON public.subscriptions
  FOR ALL USING (auth.role() = 'service_role');

-- Usage counters
CREATE TABLE public.usage_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  feature text NOT NULL,
  day date NOT NULL DEFAULT CURRENT_DATE,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, feature, day)
);
CREATE INDEX idx_usage_user_day ON public.usage_counters(user_id, day);

GRANT SELECT ON public.usage_counters TO authenticated;
GRANT ALL ON public.usage_counters TO service_role;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own usage" ON public.usage_counters
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role manages usage" ON public.usage_counters
  FOR ALL USING (auth.role() = 'service_role');

-- API cost tracking (global)
CREATE TABLE public.api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_name text NOT NULL,
  day date NOT NULL DEFAULT CURRENT_DATE,
  calls integer NOT NULL DEFAULT 0,
  cost_usd numeric(10,4) NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (api_name, day)
);
CREATE INDEX idx_api_usage_day ON public.api_usage(day);

GRANT ALL ON public.api_usage TO service_role;
ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

-- API config (kill switches + caps)
CREATE TABLE public.api_config (
  api_name text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  daily_cap_usd numeric(10,2),
  daily_cap_calls integer,
  notes text,
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT ON public.api_config TO authenticated;
GRANT ALL ON public.api_config TO service_role;
ALTER TABLE public.api_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view config" ON public.api_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages config" ON public.api_config
  FOR ALL USING (auth.role() = 'service_role');

INSERT INTO public.api_config (api_name, daily_cap_usd, daily_cap_calls, notes) VALUES
  ('fmp', NULL, 250, 'Financial Modeling Prep — adjust to ~80% of plan limit'),
  ('anthropic', 10.00, NULL, 'Claude — global daily $ cap'),
  ('lovable_ai', 5.00, NULL, 'Lovable AI Gateway — internal cap'),
  ('yahoo', NULL, 2000, 'Yahoo Finance — soft cap to avoid IP bans');

-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users view own role" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Active subscription helper
CREATE OR REPLACE FUNCTION public.has_active_subscription(user_uuid uuid, check_env text DEFAULT 'sandbox')
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = user_uuid
      AND environment = check_env
      AND (
        (status IN ('active','trialing') AND (current_period_end IS NULL OR current_period_end > now()))
        OR (status = 'canceled' AND current_period_end > now())
      )
  );
$$;

-- Get user tier helper (returns 'free', 'pro', or 'elite')
CREATE OR REPLACE FUNCTION public.get_user_tier(user_uuid uuid, check_env text DEFAULT 'sandbox')
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT CASE
      WHEN price_id IN ('elite_monthly','elite_yearly') THEN 'elite'
      WHEN price_id IN ('pro_monthly','pro_yearly') THEN 'pro'
      ELSE 'free'
    END
    FROM public.subscriptions
    WHERE user_id = user_uuid
      AND environment = check_env
      AND (
        (status IN ('active','trialing') AND (current_period_end IS NULL OR current_period_end > now()))
        OR (status = 'canceled' AND current_period_end > now())
      )
    ORDER BY created_at DESC
    LIMIT 1),
    'free'
  );
$$;
