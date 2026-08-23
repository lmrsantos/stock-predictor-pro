DROP POLICY IF EXISTS "Anyone can insert acknowledgments" ON public.legal_acknowledgments;
CREATE POLICY "Insert own acknowledgments" ON public.legal_acknowledgments
FOR INSERT TO anon, authenticated
WITH CHECK (
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
  OR (auth.uid() IS NULL AND user_id IS NULL)
);