CREATE TABLE public.retail_pickup_codes (
  order_item_id UUID PRIMARY KEY REFERENCES public.order_items(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT retail_pickup_codes_code_format CHECK (
    code ~ '^P[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$'
  )
);

ALTER TABLE public.retail_pickup_codes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.retail_pickup_codes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.retail_pickup_codes TO service_role;

NOTIFY pgrst, 'reload schema';
