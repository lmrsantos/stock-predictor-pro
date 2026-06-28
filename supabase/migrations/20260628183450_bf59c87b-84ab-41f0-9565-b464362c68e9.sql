
CREATE TABLE public.legal_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  document text NOT NULL,
  version text NOT NULL,
  acknowledgment_text text NOT NULL,
  user_agent text,
  page_url text,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.legal_acknowledgments TO authenticated;
GRANT INSERT ON public.legal_acknowledgments TO anon;
GRANT ALL ON public.legal_acknowledgments TO service_role;

ALTER TABLE public.legal_acknowledgments ENABLE ROW LEVEL SECURITY;

-- Anyone (logged-in or anonymous) can insert an acknowledgment record
CREATE POLICY "Anyone can insert acknowledgments"
  ON public.legal_acknowledgments
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Users can read their own acknowledgments
CREATE POLICY "Users read own acknowledgments"
  ON public.legal_acknowledgments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins can read all
CREATE POLICY "Admins read all acknowledgments"
  ON public.legal_acknowledgments
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_legal_ack_user ON public.legal_acknowledgments(user_id);
CREATE INDEX idx_legal_ack_document ON public.legal_acknowledgments(document, version);
