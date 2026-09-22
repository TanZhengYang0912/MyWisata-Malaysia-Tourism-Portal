REVOKE EXECUTE ON FUNCTION public.admit_ticket_pass(UUID, UUID, UUID, UUID, INTEGER, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admit_ticket_pass(UUID, UUID, UUID, UUID, INTEGER, TEXT, JSONB)
  TO service_role;
