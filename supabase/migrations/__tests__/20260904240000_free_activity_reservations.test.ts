import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260904240000_free_activity_reservations.sql"),
  "utf8",
);

describe("free activity reservations migration", () => {
  it("enforces free_reservation zero-payment bypass and capacity booking", () => {
    expect(migration).toContain("'free_reservation'");
    expect(migration).toContain("free_reservation_requires_zero_total");
    expect(migration).toContain("INSERT INTO public.bookings");
    expect(migration).toContain("INSERT INTO public.ticket_passes");
    expect(migration).toContain("booking_capacity_unavailable");
    expect(migration).toContain("UPDATE public.products");
    expect(migration).toContain("slug = 'merdeka-square-heritage-walk'");
  });
});
