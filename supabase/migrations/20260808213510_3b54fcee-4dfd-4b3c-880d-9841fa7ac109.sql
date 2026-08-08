REVOKE EXECUTE ON FUNCTION public.record_user_device(uuid, text, text, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.account_sharing_status(uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.record_user_device(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_sharing_status(uuid) TO service_role;