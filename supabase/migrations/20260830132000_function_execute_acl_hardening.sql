-- Supabase roles can retain explicit EXECUTE grants even after PUBLIC is
-- revoked. State every application boundary directly.

REVOKE EXECUTE ON FUNCTION public.search_location_cities(TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_location_cities(TEXT, TEXT, INTEGER)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.resolve_profile_location_city(UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_profile_location_city(UUID, TEXT)
  TO authenticated;

-- Trigger-only helper. The trigger continues to invoke it as the function
-- owner; no application role needs direct execution.
REVOKE EXECUTE ON FUNCTION public.detach_location_city_users()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_resolve_recommendation_place(UUID, TEXT, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_recommendation_place(UUID, TEXT, UUID)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_review_recommendation_translation(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_recommendation_translation(UUID, UUID, TEXT, TEXT)
  TO authenticated;
