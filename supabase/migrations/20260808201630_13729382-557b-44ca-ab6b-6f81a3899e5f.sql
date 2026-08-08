CREATE OR REPLACE FUNCTION public.sync_ai_credit_wallet(_user_id uuid)
RETURNS public.ai_credit_wallets LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w public.ai_credit_wallets;
  this_period date := date_trunc('month', now())::date;
  tier text := public.ai_effective_tier(_user_id);
  allowance numeric := public.ai_plan_allowance(tier);
  prev_allowance numeric;
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

  prev_allowance := w.allowance_granted;

  IF w.allowance_period_start < this_period THEN
    UPDATE public.ai_credit_wallets
      SET balance = GREATEST(balance - prev_allowance, 0) + allowance,
          allowance_granted = allowance,
          allowance_period_start = this_period,
          updated_at = now()
      WHERE user_id = _user_id
      RETURNING * INTO w;
    INSERT INTO public.ai_credit_ledger (user_id, delta, feature, note, balance_after)
    VALUES (_user_id, allowance, 'plan_allowance', 'Monthly ' || tier || ' allowance', w.balance);
  ELSIF prev_allowance < allowance THEN
    UPDATE public.ai_credit_wallets
      SET balance = balance + (allowance - prev_allowance),
          allowance_granted = allowance,
          updated_at = now()
      WHERE user_id = _user_id
      RETURNING * INTO w;
    INSERT INTO public.ai_credit_ledger (user_id, delta, feature, note, balance_after)
    VALUES (_user_id, allowance - prev_allowance, 'plan_allowance', 'Plan upgrade to ' || tier, w.balance);
  END IF;

  RETURN w;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_ai_credit_wallet(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_ai_credit_wallet(uuid) TO service_role;