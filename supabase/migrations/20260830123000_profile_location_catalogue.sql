-- Provider-neutral global city catalogue for Profile autocomplete.
-- Source rows are imported explicitly from GeoNames cities1000.zip (CC BY 4.0).

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE TABLE public.location_cities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geonames_id     BIGINT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  ascii_name      TEXT NOT NULL,
  alternate_names TEXT NOT NULL DEFAULT '',
  search_text     TEXT NOT NULL,
  country_code    TEXT NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  admin1_code     TEXT,
  latitude        DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude       DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  population      BIGINT NOT NULL DEFAULT 0 CHECK (population >= 0),
  timezone        TEXT,
  source_modified_on DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX location_cities_country_population_idx
  ON public.location_cities(country_code, population DESC);
CREATE INDEX location_cities_search_trgm_idx
  ON public.location_cities USING GIN (search_text extensions.gin_trgm_ops);

ALTER TABLE public.location_cities ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.location_cities FROM anon, authenticated;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES public.location_cities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS country_code TEXT CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  ADD COLUMN IF NOT EXISTS city_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (city_source IN ('manual', 'catalogue'));

UPDATE public.users
   SET country_code = 'MY'
 WHERE country_code IS NULL
   AND lower(btrim(COALESCE(country, ''))) = 'malaysia';

ALTER TABLE public.users
  ADD CONSTRAINT users_city_source_shape CHECK (
    (city_source = 'catalogue' AND city_id IS NOT NULL)
    OR (city_source = 'manual' AND city_id IS NULL)
  );

CREATE OR REPLACE FUNCTION public.detach_location_city_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.users
     SET city_id = NULL,
         city_source = 'manual',
         updated_at = now()
   WHERE city_id = OLD.id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.detach_location_city_users() FROM PUBLIC;

CREATE TRIGGER location_cities_detach_users_before_delete
  BEFORE DELETE ON public.location_cities
  FOR EACH ROW EXECUTE FUNCTION public.detach_location_city_users();

CREATE OR REPLACE FUNCTION public.search_location_cities(
  p_country_code TEXT,
  p_query TEXT,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  admin1_code TEXT,
  country_code TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT city.id, city.name, city.admin1_code, city.country_code
    FROM public.location_cities city
   WHERE city.country_code = upper(p_country_code)
     AND p_country_code ~* '^[A-Z]{2}$'
     AND length(btrim(p_query)) BETWEEN 2 AND 100
     AND p_query !~ '[%_]'
     AND city.search_text ILIKE '%' || btrim(p_query) || '%'
   ORDER BY
     CASE
       WHEN lower(city.name) = lower(btrim(p_query)) THEN 0
       WHEN lower(city.name) LIKE lower(btrim(p_query)) || '%' THEN 1
       WHEN lower(city.ascii_name) LIKE lower(btrim(p_query)) || '%' THEN 2
       ELSE 3
     END,
     city.population DESC,
     city.name ASC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 5), 1), 5);
$$;

REVOKE ALL ON FUNCTION public.search_location_cities(TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_location_cities(TEXT, TEXT, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_profile_location_city(
  p_city_id UUID,
  p_country_code TEXT
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  country_code TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT city.id, city.name, city.country_code
    FROM public.location_cities city
   WHERE city.id = p_city_id
     AND city.country_code = upper(p_country_code)
     AND p_country_code ~* '^[A-Z]{2}$'
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_profile_location_city(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_profile_location_city(UUID, TEXT) TO authenticated;

COMMENT ON TABLE public.location_cities IS
  'Provider-neutral Profile city catalogue imported from GeoNames cities1000 (CC BY 4.0).';
COMMENT ON COLUMN public.location_cities.alternate_names IS
  'Search-only GeoNames aliases; never returned by the customer API.';
COMMENT ON COLUMN public.users.city_id IS
  'Optional internal canonical city reference; public Profile rendering continues to use users.city.';
