import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260905074000_sponsored_discovery_placements.sql",
);

function migrationSql() {
  expect(existsSync(migrationPath), "sponsored discovery migration must exist").toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("sponsored discovery placement migration", () => {
  it("persists product-scoped placements with bounded schedule, priority, status, and optional scope", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/CREATE TABLE(?: IF NOT EXISTS)? public\.sponsored_discovery_placements/i);
    expect(sql).toMatch(/product_id UUID NOT NULL REFERENCES public\.products\(id\) ON DELETE RESTRICT/i);
    expect(sql).toMatch(/state TEXT/i);
    expect(sql).toMatch(/category_slug TEXT/i);
    expect(sql).toMatch(/CHECK \(ends_at > starts_at\)/i);
    expect(sql).toMatch(/CHECK \(priority BETWEEN 0 AND 1000\)/i);
    expect(sql).toMatch(/CHECK \(status IN \('draft', 'pending_approval', 'approved', 'rejected', 'paused'\)\)/i);
  });

  it("adds an active discovery lookup index", () => {
    const sql = migrationSql();

    expect(sql).toMatch(
      /CREATE INDEX(?: IF NOT EXISTS)? sponsored_discovery_placements_active_lookup_idx[\s\S]+ON public\.sponsored_discovery_placements[\s\S]+WHERE status = 'approved'/i,
    );
  });

  it("records placement mutations in an append-only event table", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/CREATE TABLE(?: IF NOT EXISTS)? public\.sponsored_discovery_placement_events/i);
    expect(sql).toMatch(/CREATE TRIGGER sponsored_discovery_placements_audit[\s\S]+AFTER INSERT OR UPDATE OR DELETE ON public\.sponsored_discovery_placements/i);
    expect(sql).toContain("sponsored_discovery_placement_events_append_only");
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.sponsored_discovery_placement_events/i);
  });

  it("enables RLS and enforces map campaign permission at the database mutation boundary", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/ALTER TABLE public\.sponsored_discovery_placements ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/ALTER TABLE public\.sponsored_discovery_placement_events ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/CREATE TRIGGER sponsored_discovery_placements_authorize_mutation[\s\S]+BEFORE INSERT OR UPDATE OR DELETE ON public\.sponsored_discovery_placements/i);
    expect(sql).toMatch(/COALESCE\(auth\.role\(\), ''\) = 'service_role'/i);
    expect(sql).toMatch(/has_staff_permission\s*\(\s*auth\.uid\(\),\s*'admin\.map_campaign\.manage'\s*\)/i);
    expect(sql).toContain("map_campaign_permission_required");
    expect(sql).toMatch(/CREATE POLICY sponsored_discovery_placements_staff_mutation[\s\S]+FOR ALL[\s\S]+has_staff_permission\s*\(\s*auth\.uid\(\),\s*'admin\.map_campaign\.manage'\s*\)/i);
    expect(sql).toMatch(/GRANT (?:SELECT, )?INSERT, UPDATE, DELETE ON TABLE public\.sponsored_discovery_placements TO authenticated/i);
    expect(sql).toMatch(/GRANT (?:SELECT, INSERT, UPDATE, DELETE|ALL) ON TABLE public\.sponsored_discovery_placements TO service_role/i);
  });
});
