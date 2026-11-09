CREATE TABLE public.event_pickup_codes (
  group_key TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id),
  location_id UUID NOT NULL REFERENCES public.promotion_campaign_locations(id),
  pickup_date DATE NOT NULL,
  pickup_slot_id UUID REFERENCES public.promotion_campaign_pickup_slots(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_pickup_codes_code_format CHECK (
    code ~ '^E[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$'
  )
);

CREATE INDEX event_pickup_codes_order_id_idx ON public.event_pickup_codes(order_id);
CREATE INDEX event_pickup_codes_pickup_slot_id_idx ON public.event_pickup_codes(pickup_slot_id) WHERE pickup_slot_id IS NOT NULL;

ALTER TABLE public.event_pickup_codes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.event_pickup_codes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.event_pickup_codes TO service_role;

NOTIFY pgrst, 'reload schema';
