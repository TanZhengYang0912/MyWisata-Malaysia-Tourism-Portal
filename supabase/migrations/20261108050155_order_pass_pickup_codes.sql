CREATE TABLE public.ticket_pickup_codes (
  ticket_pass_id UUID PRIMARY KEY REFERENCES public.ticket_passes(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ticket_pickup_codes_code_format CHECK (
    code ~ '^T[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$'
  )
);

CREATE TABLE public.food_pickup_codes (
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT food_pickup_codes_order_outlet_key PRIMARY KEY (order_id, outlet_id),
  CONSTRAINT food_pickup_codes_code_format CHECK (
    code ~ '^F[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$'
  )
);

ALTER TABLE public.ticket_pickup_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_pickup_codes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ticket_pickup_codes FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.food_pickup_codes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.ticket_pickup_codes TO service_role;
GRANT SELECT, INSERT ON TABLE public.food_pickup_codes TO service_role;

NOTIFY pgrst, 'reload schema';
