-- Public FAQ reads may see active documents only. Administrative writes stay
-- behind the authenticated service routes and service_role.
ALTER TABLE public.chatbot_kb_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "demo_allow_all" ON public.chatbot_kb_documents;
DROP POLICY IF EXISTS "chatbot_kb_documents_public_active_select" ON public.chatbot_kb_documents;
CREATE POLICY "chatbot_kb_documents_public_active_select"
  ON public.chatbot_kb_documents
  FOR SELECT
  TO anon, authenticated
  USING (is_active IS TRUE);

REVOKE ALL ON TABLE public.chatbot_kb_documents FROM anon, authenticated;
GRANT SELECT ON TABLE public.chatbot_kb_documents TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chatbot_kb_documents TO service_role;

NOTIFY pgrst, 'reload schema';
