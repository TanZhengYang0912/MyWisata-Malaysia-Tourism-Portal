-- Correct system-authored knowledge-base branding without changing publication
-- state. Old vectors describe the previous body; keyword fallback remains usable
-- until the existing reindex process regenerates them.
UPDATE public.chatbot_kb_documents
SET body = regexp_replace(body, 'MyWisata', 'MyLawatan', 'gi'),
  embedding = NULL,
  embedded_at = NULL
WHERE body ~* 'MyWisata';
