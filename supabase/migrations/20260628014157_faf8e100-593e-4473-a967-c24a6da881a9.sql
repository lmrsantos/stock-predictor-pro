
-- 1. Auto-grant admin to admin@quantforecast.com on verified email
CREATE OR REPLACE FUNCTION public.grant_admin_for_quantforecast()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND lower(NEW.email) = 'admin@quantforecast.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_qf_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_qf_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_admin_for_quantforecast();

DROP TRIGGER IF EXISTS on_auth_user_confirmed_grant_qf_admin ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_grant_qf_admin
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (old.email_confirmed_at IS NULL AND new.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.grant_admin_for_quantforecast();

-- Backfill if user already exists
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users
WHERE lower(email) = 'admin@quantforecast.com' AND email_confirmed_at IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Drop Anthropic cap (no longer used)
DELETE FROM public.api_config WHERE api_name = 'anthropic';
