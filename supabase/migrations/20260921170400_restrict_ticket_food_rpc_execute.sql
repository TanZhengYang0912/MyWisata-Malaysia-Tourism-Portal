-- CREATE OR REPLACE preserves pre-existing per-role grants. Explicitly remove
-- direct access left by earlier versions before granting only intended roles.
REVOKE ALL ON FUNCTION public.prepare_checkout_with_food_service_modes(
  UUID, UUID[], TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, UUID, JSONB, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_checkout_with_food_service_modes(
  UUID, UUID[], TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, UUID, JSONB, JSONB
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fulfil_food_order_group(UUID, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfil_food_order_group(UUID, UUID, UUID, UUID)
  TO service_role;
