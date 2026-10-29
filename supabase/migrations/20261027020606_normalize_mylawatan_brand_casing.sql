-- Normalize the user-confirmed product spelling. Preserve publication state and
-- invalidate embeddings derived from the previous title/body.
UPDATE public.chatbot_kb_documents
SET title = replace(title, 'MyLawatan', 'MYLawatan'),
  body = replace(body, 'MyLawatan', 'MYLawatan'),
  embedding = NULL,
  embedded_at = NULL
WHERE title LIKE '%MyLawatan%' OR body LIKE '%MyLawatan%';
