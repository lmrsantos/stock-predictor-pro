DROP POLICY IF EXISTS "Authenticated users can upsert linkage cache" ON public.linkage_cache;
DROP POLICY IF EXISTS "Authenticated users can update linkage cache" ON public.linkage_cache;
REVOKE INSERT, UPDATE, DELETE ON public.linkage_cache FROM authenticated;

DROP POLICY IF EXISTS "Authenticated view config" ON public.api_config;
CREATE POLICY "Admins view config" ON public.api_config FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));