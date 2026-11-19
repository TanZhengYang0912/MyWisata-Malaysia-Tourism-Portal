import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261117134300_customer_trip_batch_add.sql", "utf8");

it("locks and validates one owned trip before an atomic bounded batch write", () => {
  expect(sql).toMatch(/SECURITY DEFINER SET search_path = ''/i);
  expect(sql).toMatch(/auth\.uid\(\) IS NULL/);
  expect(sql).toMatch(/user_id=auth\.uid\(\) FOR UPDATE/);
  expect(sql).toMatch(/p_expected_version IS NULL OR t\.updated_at IS DISTINCT FROM p_expected_version/);
  expect(sql).toMatch(/jsonb_array_length\(p_input->'selections'\) NOT BETWEEN 1 AND 10/);
  expect(sql).toMatch(/trip_batch_duplicate/);
  expect(sql).toMatch(/app_private\.mutate_customer_trip\(t\.id,version,'add'/);
  expect(sql).toMatch(/lat=coalesce\(p\.place_lat,o\.lat,i\.lat\),lng=coalesce\(p\.place_lng,o\.lng,i\.lng\)/);
  expect(sql).toMatch(/JOIN public\.outlets o ON o\.id=\(selection->>'outlet_id'\)::uuid/);
  expect(sql).toMatch(/app_private\.mutate_customer_trip\(t\.id,version,'reorder'/);
  expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.mutate_customer_trip_batch\(text,timestamptz,jsonb\) TO authenticated/);
  expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.mutate_customer_trip_batch[^;]+TO (PUBLIC|anon|service_role)/i);
});
