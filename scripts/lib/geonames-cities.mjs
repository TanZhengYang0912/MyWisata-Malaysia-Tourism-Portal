export function parseGeoNamesCity(line) {
  const fields = line.split("\t");
  if (fields.length < 19 || fields[6] !== "P") return null;

  const geonamesId = Number(fields[0]);
  const latitude = Number(fields[4]);
  const longitude = Number(fields[5]);
  const population = Number(fields[14] || 0);
  const countryCode = fields[8]?.toUpperCase();
  const name = fields[1]?.trim();
  const asciiName = fields[2]?.trim() || name;

  if (!Number.isSafeInteger(geonamesId) || !name || !/^[A-Z]{2}$/.test(countryCode)) return null;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  if (!Number.isSafeInteger(population) || population < 0) return null;

  return {
    geonamesId,
    name,
    asciiName,
    alternateNames: fields[3]?.trim() ?? "",
    countryCode,
    admin1Code: fields[10]?.trim() || null,
    latitude,
    longitude,
    population,
    timezone: fields[17]?.trim() || null,
    modifiedOn: fields[18]?.trim() || null,
  };
}

export function* chunkCities(cities, batchSize) {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("Batch size must be a positive integer");
  for (let index = 0; index < cities.length; index += batchSize) {
    yield cities.slice(index, index + batchSize);
  }
}

export function resolveImportTransport({ databaseUrl, supabaseUrl, serviceRoleKey }) {
  if (databaseUrl) return "postgres";
  if (supabaseUrl && serviceRoleKey) return "supabase";
  throw new Error("GeoNames import credentials are required");
}

export function createSupabaseBatchUpserter(client) {
  return async function upsertSupabaseBatch(batch) {
    if (batch.length === 0) return;
    const { error } = await client
      .from("location_cities")
      .upsert(batch, { onConflict: "geonames_id", ignoreDuplicates: false });
    if (error) throw new Error(`GeoNames batch upsert failed: ${error.message}`);
  };
}

export function citySearchText(city) {
  return [city.name, city.asciiName, city.alternateNames]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase("und");
}

export const UPSERT_LOCATION_CITIES_SQL = `
  INSERT INTO public.location_cities (
    geonames_id, name, ascii_name, alternate_names, search_text, country_code,
    admin1_code, latitude, longitude, population, timezone, source_modified_on, updated_at
  )
  SELECT
    item.geonames_id, item.name, item.ascii_name, item.alternate_names,
    item.search_text, item.country_code, item.admin1_code, item.latitude,
    item.longitude, item.population, item.timezone, item.source_modified_on, now()
  FROM jsonb_to_recordset($1::jsonb) AS item(
    geonames_id BIGINT,
    name TEXT,
    ascii_name TEXT,
    alternate_names TEXT,
    search_text TEXT,
    country_code TEXT,
    admin1_code TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    population BIGINT,
    timezone TEXT,
    source_modified_on DATE
  )
  ON CONFLICT (geonames_id) DO UPDATE SET
    name = EXCLUDED.name,
    ascii_name = EXCLUDED.ascii_name,
    alternate_names = EXCLUDED.alternate_names,
    search_text = EXCLUDED.search_text,
    country_code = EXCLUDED.country_code,
    admin1_code = EXCLUDED.admin1_code,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    population = EXCLUDED.population,
    timezone = EXCLUDED.timezone,
    source_modified_on = EXCLUDED.source_modified_on,
    updated_at = now()
`;

export function toDatabaseCity(city) {
  return {
    geonames_id: city.geonamesId,
    name: city.name,
    ascii_name: city.asciiName,
    alternate_names: city.alternateNames,
    search_text: citySearchText(city),
    country_code: city.countryCode,
    admin1_code: city.admin1Code,
    latitude: city.latitude,
    longitude: city.longitude,
    population: city.population,
    timezone: city.timezone,
    source_modified_on: city.modifiedOn,
  };
}
