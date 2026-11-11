-- Anonymous guest chat access is mediated by the server's HttpOnly credential.
-- Public REST access must not bypass the credential checks in chatbot routes.
DROP POLICY IF EXISTS demo_allow_all ON public.chatbot_sessions;
DROP POLICY IF EXISTS demo_allow_all ON public.chatbot_messages;

ALTER TABLE public.chatbot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.chatbot_sessions, public.chatbot_messages FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.chatbot_sessions, public.chatbot_messages FROM authenticated;
GRANT SELECT ON TABLE public.chatbot_sessions, public.chatbot_messages TO authenticated;
GRANT ALL ON TABLE public.chatbot_sessions, public.chatbot_messages TO service_role;
