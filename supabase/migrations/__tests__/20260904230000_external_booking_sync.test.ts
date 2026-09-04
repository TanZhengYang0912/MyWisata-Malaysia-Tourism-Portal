import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260904230000_external_booking_sync.sql"),
  "utf8",
);

describe("external booking synchronization & outbox migration", () => {
  it("enforces database capacity authority, outbox queueing, and idempotency constraints", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.external_booking_sources");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.external_reservations");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.sync_outbox");
    expect(migration).toContain("uq_source_external_booking UNIQUE (source_id, external_booking_id)");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.apply_external_reservation");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("conflict_status = 'overbooked'");
    expect(migration).toContain("CREATE TRIGGER slot_outbox_enqueue");
  });
});
