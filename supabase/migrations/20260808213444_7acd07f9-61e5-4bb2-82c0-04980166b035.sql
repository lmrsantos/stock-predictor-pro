-- 1. Tier + allowance updates -------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_tier(user_uuid uuid, check_env text DEFAULT 'sandbox'::text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT CASE
      WHEN price_id IN ('elite_monthly','elite_yearly') THEN 'elite'
      WHEN price_id IN ('plus_monthly','plus_yearly') THEN 'plus'
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
$function$;

CREATE OR REPLACE FUNCTION public.ai_plan_allowance(_tier text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _tier
    WHEN 'elite' THEN 2500
    WHEN 'plus' THEN 1200
    WHEN 'pro' THEN 500
    ELSE 20
  END::numeric;
$function$;

CREATE OR REPLACE FUNCTION public.ai_device_allowance(_tier text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _tier
    WHEN 'elite' THEN 6
    WHEN 'plus' THEN 4
    WHEN 'pro' THEN 3
    ELSE 2
  END::integer;
$function$;

-- 2. Device / login-sharing tracking -----------------------------------------
CREATE TABLE public.user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  ip_hash text,
  user_agent text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

CREATE INDEX user_devices_user_last_seen_idx ON public.user_devices (user_id, last_seen DESC);

GRANT SELECT ON public.user_devices TO authenticated;
GRANT ALL ON public.user_devices TO service_role;

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own devices"
  ON public.user_devices FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all devices"
  ON public.user_devices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages devices"
  ON public.user_devices FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.record_user_device(
  _user_id uuid,
  _device_id text,
  _ip_hash text,
  _user_agent text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tier text := public.ai_effective_tier(_user_id);
  allowance integer := public.ai_device_allowance(tier);
  devices_24h integer;
  devices_7d integer;
  ips_24h integer;
BEGIN
  IF _device_id IS NULL OR length(_device_id) < 8 THEN
    RAISE EXCEPTION 'Invalid device id';
  END IF;

  INSERT INTO public.user_devices (user_id, device_id, ip_hash, user_agent)
  VALUES (_user_id, _device_id, _ip_hash, _user_agent)
  ON CONFLICT (user_id, device_id) DO UPDATE
    SET last_seen = now(),
        ip_hash = COALESCE(EXCLUDED.ip_hash, public.user_devices.ip_hash),
        user_agent = COALESCE(EXCLUDED.user_agent, public.user_devices.user_agent);

  SELECT count(*) INTO devices_24h FROM public.user_devices
    WHERE user_id = _user_id AND last_seen > now() - interval '24 hours';
  SELECT count(*) INTO devices_7d FROM public.user_devices
    WHERE user_id = _user_id AND last_seen > now() - interval '7 days';
  SELECT count(DISTINCT ip_hash) INTO ips_24h FROM public.user_devices
    WHERE user_id = _user_id AND ip_hash IS NOT NULL AND last_seen > now() - interval '24 hours';

  RETURN jsonb_build_object(
    'tier', tier,
    'device_allowance', allowance,
    'devices_24h', devices_24h,
    'devices_7d', devices_7d,
    'networks_24h', ips_24h,
    'over_limit', devices_24h > allowance,
    'suspected_sharing', (devices_24h > allowance) OR (ips_24h >= allowance + 2)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.account_sharing_status(_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tier text := public.ai_effective_tier(_user_id);
  allowance integer := public.ai_device_allowance(tier);
  devices_24h integer;
  devices_7d integer;
  ips_24h integer;
BEGIN
  SELECT count(*) INTO devices_24h FROM public.user_devices
    WHERE user_id = _user_id AND last_seen > now() - interval '24 hours';
  SELECT count(*) INTO devices_7d FROM public.user_devices
    WHERE user_id = _user_id AND last_seen > now() - interval '7 days';
  SELECT count(DISTINCT ip_hash) INTO ips_24h FROM public.user_devices
    WHERE user_id = _user_id AND ip_hash IS NOT NULL AND last_seen > now() - interval '24 hours';

  RETURN jsonb_build_object(
    'tier', tier,
    'device_allowance', allowance,
    'devices_24h', devices_24h,
    'devices_7d', devices_7d,
    'networks_24h', ips_24h,
    'over_limit', devices_24h > allowance,
    'suspected_sharing', (devices_24h > allowance) OR (ips_24h >= allowance + 2)
  );
END;
$function$;