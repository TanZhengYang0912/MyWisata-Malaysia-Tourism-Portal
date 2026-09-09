import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260909082900_sponsored_position_governance.sql",
);

function migrationSql() {
  expect(existsSync(migrationPath), "sponsored position governance migration must exist").toBe(true);
  return existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
}

describe("sponsored position governance migration", () => {
  it("normalizes campaigns into four one-based positions and archives old pauses", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/priority BETWEEN 1 AND 4/i);
    expect(sql).toMatch(/'archived'/i);
    expect(sql).toMatch(/ROW_NUMBER\(\) OVER[\s\S]+PARTITION BY[\s\S]+state[\s\S]+category_slug/i);
    expect(sql).toMatch(/ROW_NUMBER\(\) OVER[\s\S]+PARTITION BY status[\s\S]+updated_at DESC/i);
    const legacyNormalization = sql.match(/WITH ranked_approved AS \([\s\S]+?FROM ranked_approved AS ranked[\s\S]+?;/i)?.[0] ?? "";
    expect(legacyNormalization).not.toMatch(/status\s*=\s*CASE[\s\S]+THEN 'paused'/i);
  });

  it("calculates impact and a server-owned preview version", () => {
    const sql = migrationSql();
    const preview = sql.match(
      /CREATE OR REPLACE FUNCTION public\.preview_sponsored_discovery_placement\([\s\S]+?\n\$\$;/i,
    )?.[0] ?? "";

    expect(preview).toContain("p_priority INTEGER");
    expect(preview).toContain("previewVersion");
    expect(preview).toContain("requestedPosition");
    expect(preview).toContain("shifts");
    expect(preview).toContain("paused");
    expect(preview).toContain("archived");
    expect(preview).toMatch(/has_staff_permission\s*\([\s\S]+admin\.map_campaign\.manage/i);
    expect(preview).toMatch(/md5\s*\(/i);
    expect(preview).not.toMatch(/p_(affected|shift|paused|archived)_ids/i);
  });

  it("requires the preview token for draft creation and approval", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/create_sponsored_discovery_placement\([\s\S]+p_preview_version TEXT/i);
    expect(sql).toMatch(/transition_sponsored_discovery_placement\([\s\S]+p_preview_version TEXT/i);
    expect(sql).not.toMatch(/p_preview_version TEXT DEFAULT NULL/i);
    expect(sql).toMatch(/DROP FUNCTION public\.transition_sponsored_discovery_placement\(UUID, TEXT, TEXT\)/i);
    expect(sql.match(/sponsored_preview_stale/gi)?.length).toBeGreaterThanOrEqual(2);
  });

  it("locks and atomically shifts overlapping campaigns on approval", () => {
    const sql = migrationSql();
    const transition = sql.match(
      /CREATE OR REPLACE FUNCTION public\.transition_sponsored_discovery_placement\([\s\S]+?\n\$\$;/i,
    )?.[0] ?? "";

    expect(transition).toMatch(/FOR UPDATE/i);
    expect(transition).toMatch(/starts_at < v_placement\.ends_at[\s\S]+ends_at > v_placement\.starts_at/i);
    expect(transition).toMatch(/ROW_NUMBER\(\) OVER[\s\S]+AS target_position/i);
    expect(transition).toMatch(/priority = LEAST\(affected\.target_position, 4\)/i);
    expect(transition).toMatch(/target_position > 4 THEN 'paused'/i);
    expect(transition).toMatch(/review_note\s*=\s*CASE[\s\S]+Automatically paused: displaced by approval/i);
    expect(transition).toMatch(/Automatically archived: paused retention limit/i);
    expect(transition).toContain("sponsored_creator_self_approval_denied");
  });

  it("keeps the customer projection privacy-minimal and orders positions ascending", () => {
    const sql = migrationSql();
    const publicProjection = sql.match(
      /CREATE OR REPLACE FUNCTION public\.list_active_sponsored_discovery_placements\(\)[\s\S]+?\n\$\$;/i,
    )?.[0] ?? "";

    expect(publicProjection).toMatch(/RETURNS TABLE\s*\(\s*id UUID,\s*product_id UUID,\s*state TEXT,\s*category_slug TEXT,\s*starts_at TIMESTAMPTZ,\s*ends_at TIMESTAMPTZ,\s*priority INTEGER,\s*status TEXT\s*\)/i);
    expect(publicProjection).toMatch(/placement\.status = 'approved'/i);
    expect(publicProjection).toMatch(/product\.status = 'active'[\s\S]+product\.review_status = 'approved'/i);
    expect(publicProjection).toMatch(/ORDER BY placement\.priority ASC/i);
    expect(publicProjection).not.toMatch(/created_by|approved_by|approved_at|review_note|actor_id|before_data|after_data/i);
  });
});
