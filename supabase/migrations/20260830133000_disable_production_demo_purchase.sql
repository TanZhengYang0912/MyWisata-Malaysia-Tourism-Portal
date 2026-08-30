-- Production migrations must never expose the development purchase simulator.
-- Local and staging environments may install the explicit test-support helper
-- after the canonical migration chain has completed.
UPDATE public.platform_settings
SET value = 'false',
    updated_at = NOW()
WHERE key = 'demo.mode';

DROP FUNCTION IF EXISTS public.create_demo_purchase(UUID, UUID, UUID);

NOTIFY pgrst, 'reload schema';
