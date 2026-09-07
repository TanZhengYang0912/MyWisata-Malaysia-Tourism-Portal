import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260905074500_sponsored_campaign_workflow.sql");

function migration() {
  expect(existsSync(migrationPath), "sponsored campaign workflow migration must exist").toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("sponsored campaign workflow migration", () => {
  it("records creator and independent approval evidence", () => {
    const sql = migration();
    expect(sql).toMatch(/ADD COLUMN(?: IF NOT EXISTS)? created_by UUID/i);
    expect(sql).toMatch(/ADD COLUMN(?: IF NOT EXISTS)? approved_by UUID/i);
    expect(sql).toMatch(/ADD COLUMN(?: IF NOT EXISTS)? approved_at TIMESTAMPTZ/i);
    expect(sql).toContain("sponsored_creator_self_approval_denied");
    expect(sql).toMatch(/v_placement\.created_by\s*=\s*v_actor/i);
  });

  it("enforces the dedicated permission and active approved product eligibility inside RPCs", () => {
    const sql = migration();
    expect(sql).toContain("create_sponsored_discovery_placement");
    expect(sql).toContain("transition_sponsored_discovery_placement");
    expect(sql.match(/has_staff_permission\s*\(\s*v_actor\s*,\s*'admin\.map_campaign\.manage'\s*\)/gi)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toMatch(/FROM public\.products[\s\S]+status\s*=\s*'active'[\s\S]+review_status\s*=\s*'approved'/i);
    expect(sql).toContain("sponsored_product_not_eligible");
  });

  it("permits only the documented draft submit approve reject and pause transitions", () => {
    const sql = migration();
    expect(sql).toContain("sponsored_transition_invalid");
    expect(sql).toMatch(/'draft'[\s\S]+submit[\s\S]+'pending_approval'/i);
    expect(sql).toMatch(/'pending_approval'[\s\S]+approve[\s\S]+'approved'/i);
    expect(sql).toMatch(/'pending_approval'[\s\S]+reject[\s\S]+'rejected'/i);
    expect(sql).toMatch(/'approved'[\s\S]+pause[\s\S]+'paused'/i);
  });

  it("revokes direct authenticated placement DML and preserves append-only audit history", () => {
    const sql = migration();
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON TABLE public\.sponsored_discovery_placements FROM authenticated/i);
    expect(sql).toMatch(/DROP POLICY IF EXISTS sponsored_discovery_placements_staff_mutation/i);
    expect(sql).toMatch(/UPDATE public\.sponsored_discovery_placements[\s\S]+SET status = v_next_status/i);
    expect(sql).toContain("sponsored_discovery_placement_events_append_only");
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_sponsored_discovery_placement/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.transition_sponsored_discovery_placement/i);
  });

  it("stores a privacy-minimal interaction event without client metadata", () => {
    const sql = migration();
    const table = sql.match(/CREATE TABLE public\.sponsored_discovery_events\s*\(([\s\S]+?)\);/i)?.[1] ?? "";
    expect(table).toContain("placement_id UUID");
    expect(table).toContain("product_id UUID");
    expect(table).toContain("event_type TEXT");
    expect(table).toContain("user_id UUID");
    expect(table).toContain("created_at TIMESTAMPTZ");
    expect(table).not.toMatch(/ip|fingerprint|metadata|user_agent/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.sponsored_discovery_events FROM PUBLIC, anon, authenticated/i);
  });

  it("re-resolves the active approved effective placement-product association before inserting events", () => {
    const sql = migration();
    expect(sql).toContain("record_sponsored_discovery_event");
    expect(sql).toMatch(/placement\.id = p_placement_id[\s\S]+placement\.status = 'approved'[\s\S]+placement\.starts_at <= now\(\)[\s\S]+now\(\) < placement\.ends_at/i);
    expect(sql).toMatch(/v_placement\.product_id <> p_product_id[\s\S]+sponsored_placement_product_mismatch/i);
    expect(sql).toMatch(/product\.id = p_product_id[\s\S]+product\.status = 'active'[\s\S]+product\.review_status = 'approved'/i);
    expect(sql).toMatch(/INSERT INTO public\.sponsored_discovery_events[\s\S]+auth\.uid\(\)/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_sponsored_discovery_event\(UUID, UUID, TEXT\) TO anon, authenticated/i);
  });
});
