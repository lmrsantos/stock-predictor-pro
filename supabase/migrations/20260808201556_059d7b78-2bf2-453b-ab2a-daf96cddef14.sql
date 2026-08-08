CREATE TABLE public.ai_credit_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric NOT NULL DEFAULT 0,
  allowance_granted numeric NOT NULL DEFAULT 0,
  allowance_period_start date NOT NULL DEFAULT date_trunc('month', now())::date,
  purchased_total numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_credit_wallets TO authenticated;
GRANT ALL ON public.ai_credit_wallets TO service_role;
ALTER TABLE public.ai_credit_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own credit wallet" ON public.ai_credit_wallets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.ai_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta numeric NOT NULL,
  feature text NOT NULL,
  note text,
  balance_after numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_credit_ledger_user_created_idx ON public.ai_credit_ledger (user_id, created_at DESC);
GRANT SELECT ON public.ai_credit_ledger TO authenticated;
GRANT ALL ON public.ai_credit_ledger TO service_role;
ALTER TABLE public.ai_credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own credit ledger" ON public.ai_credit_ledger
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.ai_plan_allowance(_tier text)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _tier WHEN 'elite' THEN 2000 WHEN 'pro' THEN 500 ELSE 20 END::numeric;
$$;

CREATE OR REPLACE FUNCTION public.ai_effective_tier(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.get_user_tier(_user_id, 'live') <> 'free' THEN public.get_user_tier(_user_id, 'live')
    ELSE public.get_user_tier(_user_id, 'sandbox')
  END;
$$;

CREATE OR REPLACE FUNCTION public.sync_ai_credit_wallet(_user_id uuid)
RETURNS public.ai_credit_wallets LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w public.ai_credit_wallets;
  this_period date := date_trunc('month', now())::date;
  tier text := public.ai_effective_tier(_user_id);
  allowance numeric := public.ai_plan_allowance(tier);
BEGIN
  SELECT * INTO w FROM public.ai_credit_wallets WHERE user_id = _user_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.ai_credit_wallets (user_id, balance, allowance_granted, allowance_period_start)
    VALUES (_user_id, allowance, allowance, this_period)
    RETURNING * INTO w;
    INSERT INTO public.ai_credit_ledger (user_id, delta, feature, note, balance_after)
    VALUES (_user_id, allowance, 'plan_allowance', 'Monthly ' || tier || ' allowance', w.balance);
    RETURN w;
  END IF;

  IF w.allowance_period_start < this_period THEN
    -- Unused plan allowance expires; purchased credits roll over.
    UPDATE public.ai_credit_wallets
      SET balance = GREATEST(balance - allowance_granted, 0) + allowance,
          allowance_granted = allowance,
          allowance_period_start = this_period,
          updated_at = now()
      WHERE user_id = _user_id
      RETURNING * INTO w;
    INSERT INTO public.ai_credit_ledger (user_id, delta, feature, note, balance_after)
    VALUES (_user_id, allowance, 'plan_allowance', 'Monthly ' || tier || ' allowance', w.balance);
  ELSIF w.allowance_granted < allowance THEN
    -- Mid-period upgrade: top up to the higher plan allowance.
    UPDATE public.ai_credit_wallets
      SET balance = balance + (allowance - allowance_granted),
          allowance_granted = allowance,
          updated_at = now()
      WHERE user_id = _user_id
      RETURNING * INTO w;
    INSERT INTO public.ai_credit_ledger (user_id, delta, feature, note, balance_after)
    VALUES (_user_id, allowance - w.allowance_granted, 'plan_allowance', 'Plan upgrade to ' || tier, w.balance);
  END IF;

  RETURN w;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_ai_credits(_user_id uuid, _feature text, _cost numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w public.ai_credit_wallets;
BEGIN
  IF _cost IS NULL OR _cost <= 0 THEN
    RAISE EXCEPTION 'Invalid cost';
  END IF;

  w := public.sync_ai_credit_wallet(_user_id);

  IF w.balance < _cost THEN
    RETURN jsonb_build_object('allowed', false, 'balance', w.balance, 'cost', _cost,
      'tier', public.ai_effective_tier(_user_id));
  END IF;

  UPDATE public.ai_credit_wallets
    SET balance = balance - _cost, updated_at = now()
    WHERE user_id = _user_id
    RETURNING * INTO w;

  INSERT INTO public.ai_credit_ledger (user_id, delta, feature, note, balance_after)
  VALUES (_user_id, -_cost, _feature, NULL, w.balance);

  RETURN jsonb_build_object('allowed', true, 'balance', w.balance, 'cost', _cost,
    'tier', public.ai_effective_tier(_user_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_ai_credits(_user_id uuid, _amount numeric, _note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w public.ai_credit_wallets;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  PERFORM public.sync_ai_credit_wallet(_user_id);

  UPDATE public.ai_credit_wallets
    SET balance = balance + _amount,
        purchased_total = purchased_total + _amount,
        updated_at = now()
    WHERE user_id = _user_id
    RETURNING * INTO w;

  INSERT INTO public.ai_credit_ledger (user_id, delta, feature, note, balance_after)
  VALUES (_user_id, _amount, 'credit_purchase', _note, w.balance);

  RETURN jsonb_build_object('balance', w.balance);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_credits(uuid, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_ai_credits(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_ai_credit_wallet(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_credits(uuid, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_ai_credits(uuid, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_ai_credit_wallet(uuid) TO service_role;