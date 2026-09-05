import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(process.cwd(), "supabase/migrations");
const baselinePath = resolve(process.cwd(), "supabase/canonical-migration-baseline.json");
const approvedForwardMigrations = [
  "20260830133000_disable_production_demo_purchase.sql",
  "20260830134000_chat_auto_archive.sql",
  "20260904210000_place_comments.sql",
  "20260904220000_place_comment_mock_data.sql",
  "20260904222000_place_comments_rich_identity.sql",
  "20260904230000_external_booking_sync.sql",
  "20260904233000_ticket_passes_and_audit.sql",
  "20260904240000_free_activity_reservations.sql",
  "20260905062500_cart_last_added_order.sql",
  "20260905070000_fix_free_reservation_checkout.sql",
  "20260905071000_harden_free_reservation_checkout.sql",
  "20260905072000_align_free_reservation_price_rules.sql",
  "20260905073000_staff_role_permissions.sql",
  "20260905073500_staff_permission_enforcement.sql",
  "20260905074000_sponsored_discovery_placements.sql",
  "20260905074500_sponsored_campaign_workflow.sql",
  "20260905075000_toyyibpay_checkout.sql",
  "20260906011500_staff_role_assignment_ux.sql",
];

function migrationFiles() {
  return readdirSync(migrationsDirectory).filter((filename) => filename.endsWith(".sql")).sort();
}

describe("canonical production migration history", () => {
  it("contains one SQL file per migration version", () => {
    const versions = migrationFiles().map((filename) => filename.split("_", 1)[0]);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("records the exact linked-production baseline", () => {
    expect(existsSync(baselinePath)).toBe(true);
    if (!existsSync(baselinePath)) return;

    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as { migrations: string[] };
    expect(baseline.migrations).toHaveLength(138);
    expect(migrationFiles()).toEqual([...baseline.migrations, ...approvedForwardMigrations].sort());
  });

  it("never deploys the Demo Purchase RPC through production migrations", () => {
    const productionSql = migrationFiles()
      .map((filename) => readFileSync(resolve(migrationsDirectory, filename), "utf8"))
      .join("\n");

    expect(productionSql).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.create_demo_purchase/i);
  });
});
