import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const directory = path.dirname(fileURLToPath(import.meta.url));
const helperPath = path.join(directory, "geonames-cities.mjs");

test("provides the GeoNames city import helper", () => {
  assert.equal(existsSync(helperPath), true);
});

test("parses the documented cities1000 TSV fields without retaining the raw row", async () => {
  const { parseGeoNamesCity } = await import(pathToFileURL(helperPath).href);
  const row = [
    "1735161", "Kuala Lumpur", "Kuala Lumpur", "吉隆坡,KL,Kuala Lumpur",
    "3.1412", "101.68653", "P", "PPLC", "MY", "", "14", "", "", "",
    "1453975", "22", "56", "Asia/Kuala_Lumpur", "2024-01-01",
  ].join("\t");

  assert.deepEqual(parseGeoNamesCity(row), {
    geonamesId: 1735161,
    name: "Kuala Lumpur",
    asciiName: "Kuala Lumpur",
    alternateNames: "吉隆坡,KL,Kuala Lumpur",
    countryCode: "MY",
    admin1Code: "14",
    latitude: 3.1412,
    longitude: 101.68653,
    population: 1453975,
    timezone: "Asia/Kuala_Lumpur",
    modifiedOn: "2024-01-01",
  });
});

test("rejects malformed or non-populated-place rows", async () => {
  const { parseGeoNamesCity } = await import(pathToFileURL(helperPath).href);
  assert.equal(parseGeoNamesCity("broken"), null);
  const nonCity = ["1", "Lake", "Lake", "", "1", "2", "H", "LK", "MY", "", "", "", "", "", "0", "", "", "Asia/Kuala_Lumpur", "2024-01-01"].join("\t");
  assert.equal(parseGeoNamesCity(nonCity), null);
});

test("builds bounded JSON batches for parameterized upserts", async () => {
  const { chunkCities } = await import(pathToFileURL(helperPath).href);
  const values = Array.from({ length: 5 }, (_, index) => ({ geonamesId: index + 1 }));
  assert.deepEqual([...chunkCities(values, 2)].map((batch) => batch.length), [2, 2, 1]);
  assert.throws(() => [...chunkCities(values, 0)], /batch size/i);
});

test("selects an explicit PostgreSQL or Supabase service-role import transport", async () => {
  const { resolveImportTransport } = await import(pathToFileURL(helperPath).href);

  assert.equal(resolveImportTransport({ databaseUrl: "postgresql://example" }), "postgres");
  assert.equal(resolveImportTransport({ supabaseUrl: "https://example.supabase.co", serviceRoleKey: "secret" }), "supabase");
  assert.throws(() => resolveImportTransport({ supabaseUrl: "https://example.supabase.co" }), /credentials/i);
  assert.throws(() => resolveImportTransport({}), /credentials/i);
});

test("upserts service-role batches by geonames_id and surfaces safe errors", async () => {
  const { createSupabaseBatchUpserter } = await import(pathToFileURL(helperPath).href);
  const calls = [];
  const client = {
    from(table) {
      return {
        async upsert(rows, options) {
          calls.push({ table, rows, options });
          return { error: null };
        },
      };
    },
  };
  const upsert = createSupabaseBatchUpserter(client);
  await upsert([{ geonames_id: 1735161, name: "Kuala Lumpur" }]);

  assert.deepEqual(calls, [{
    table: "location_cities",
    rows: [{ geonames_id: 1735161, name: "Kuala Lumpur" }],
    options: { onConflict: "geonames_id", ignoreDuplicates: false },
  }]);

  const failing = createSupabaseBatchUpserter({
    from() {
      return { async upsert() { return { error: { message: "permission denied", details: "secret detail" } }; } };
    },
  });
  await assert.rejects(() => failing([{ geonames_id: 1 }]), /^Error: GeoNames batch upsert failed: permission denied$/);
});
