-- trips schema
CREATE TABLE public.trips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    start_date date,
    end_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE public.trip_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    experience_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    sequence integer NOT NULL DEFAULT 0,
    scheduled_date date,
    scheduled_time time without time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id)
);

-- RLS
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own trips"
    ON public.trips
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage items in their own trips"
    ON public.trip_items
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = trip_items.trip_id
            AND trips.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = trip_items.trip_id
            AND trips.user_id = auth.uid()
        )
    );
