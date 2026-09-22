import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260921170400_restrict_ticket_food_rpc_execute.sql"), "utf8");

describe("ticket and food RPC execute grants", () => {
  it("allows authenticated checkout but removes anonymous direct access", () => {
    expect(migration).toMatch(/prepare_checkout_with_food_service_modes[\s\S]*?FROM PUBLIC, anon/i);
    expect(migration).toMatch(/prepare_checkout_with_food_service_modes[\s\S]*?TO authenticated, service_role/i);
  });

  it("limits food fulfilment to the trusted service role", () => {
    expect(migration).toMatch(/fulfil_food_order_group[\s\S]*?FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/fulfil_food_order_group[\s\S]*?TO service_role/i);
  });
});
