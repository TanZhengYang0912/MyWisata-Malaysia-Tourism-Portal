import { describe, expect, it } from "vitest";

import {
  LEGACY_SAMPLE_PREFIX,
  buildPlaceCommunityDemoPlan,
} from "../lib/place-community-demo.mjs";

const places: Array<{
  id: string;
  level: "state" | "region" | "poi";
  name: string;
  state: string;
  district: string | null;
}> = [
  {
    id: "place-kl",
    level: "state",
    name: "Kuala Lumpur",
    state: "Kuala Lumpur",
    district: null,
  },
  {
    id: "place-heritage",
    level: "poi",
    name: "Jonker Street Night Market",
    state: "Melaka",
    district: "Bandar Hilir",
  },
];

const customers = [
  { id: "customer-alice" },
  { id: "customer-bob" },
  { id: "customer-carol" },
  { id: "customer-dave" },
];

describe("place community demo data", () => {
  it("creates three distinct, place-aware notes per active place", () => {
    const plan = buildPlaceCommunityDemoPlan({ places, customers, now: new Date("2026-09-12T00:00:00.000Z") });

    const rows = [...plan.updates, ...plan.inserts];
    expect(rows).toHaveLength(6);
    expect(new Set(rows.map((row) => row.body)).size).toBe(6);
    expect(rows.every((row) => row.body.includes("Kuala Lumpur") || row.body.includes("Jonker Street Night Market"))).toBe(true);
    expect(rows.every((row) => !/sample|mock|demo/i.test(row.body))).toBe(true);
    expect(rows.some((row) => row.is_anonymous)).toBe(true);
    expect(rows.some((row) => !row.is_anonymous)).toBe(true);
  });

  it("updates only legacy sample rows and leaves user-authored notes alone", () => {
    const plan = buildPlaceCommunityDemoPlan({
      places,
      customers,
      existingComments: [
        {
          id: "legacy-kl",
          place_id: "place-kl",
          user_id: "customer-alice",
          body: `${LEGACY_SAMPLE_PREFIX}Kuala Lumpur: use one neighbourhood as your base.`,
          status: "published",
          is_anonymous: false,
          created_at: "2026-09-01T10:00:00.000Z",
        },
        {
          id: "real-note",
          place_id: "place-kl",
          user_id: "real-customer",
          body: "The early train made this morning visit much easier.",
          status: "published",
          is_anonymous: false,
          created_at: "2026-09-02T10:00:00.000Z",
        },
      ],
      now: new Date("2026-09-12T00:00:00.000Z"),
    });

    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]).toMatchObject({ id: "legacy-kl", place_id: "place-kl" });
    expect(plan.updates[0].body).not.toContain(LEGACY_SAMPLE_PREFIX);
    expect(plan.inserts.some((row) => row.id === "real-note")).toBe(false);
    expect(plan).toEqual(buildPlaceCommunityDemoPlan({
      places,
      customers,
      existingComments: [
        {
          id: "legacy-kl",
          place_id: "place-kl",
          user_id: "customer-alice",
          body: `${LEGACY_SAMPLE_PREFIX}Kuala Lumpur: use one neighbourhood as your base.`,
          status: "published",
          is_anonymous: false,
          created_at: "2026-09-01T10:00:00.000Z",
        },
        {
          id: "real-note",
          place_id: "place-kl",
          user_id: "real-customer",
          body: "The early train made this morning visit much easier.",
          status: "published",
          is_anonymous: false,
          created_at: "2026-09-02T10:00:00.000Z",
        },
      ],
      now: new Date("2026-09-12T00:00:00.000Z"),
    }));
  });
});
