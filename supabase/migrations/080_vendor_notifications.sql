ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS outlet_id UUID REFERENCES public.outlets(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS audience_role TEXT;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_audience_role_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_audience_role_check
  CHECK (audience_role IS NULL OR audience_role IN ('vendor_owner', 'outlet_manager'));

-- 079 created a partial event-key index. Replace it with a full unique index so
-- Supabase can infer `ON CONFLICT (event_key)`; PostgreSQL still permits
-- multiple NULL event keys under a normal unique index.
DROP INDEX IF EXISTS notifications_event_key_unique;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_key_unique
  ON public.notifications(event_key);

CREATE INDEX IF NOT EXISTS notifications_vendor_scope_idx
  ON public.notifications(user_id, vendor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_outlet_scope_idx
  ON public.notifications(user_id, outlet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_vendor_category_idx
  ON public.notifications(user_id, vendor_id, category, created_at DESC);

NOTIFY pgrst, 'reload schema';
