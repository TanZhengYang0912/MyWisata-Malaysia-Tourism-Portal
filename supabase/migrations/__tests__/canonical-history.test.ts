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
  "20260906030400_fix_anonymous_vendor_reads.sql",
  "20260906040000_staff_invitations.sql",
  "20260908162000_sponsored_public_projection.sql",
  "20260908165700_demo_vendor_order_earnings.sql",
  "20260908180000_harden_demo_vendor_order_earnings.sql",
  "20260909054100_restore_demo_customer_roles.sql",
  "20260909082900_sponsored_position_governance.sql",
  "20260909182946_add_bookings_updated_at.sql",
  "20260910005600_sponsored_placement_staff_role_template.sql",
  "20260911000000_vendor_order_settlement.sql",
  "20260911100000_chat_message_context.sql",
  "20260912140000_voucher_owner_approval.sql",
  "20260912180000_voucher_store_redemption.sql",
  "20260912190000_vendor_featured_products.sql",
  "20260912210000_place_community_mock_data_v2.sql",
  "20260912233000_activity_media_consistency.sql",
  "20260913003000_vendor_outlet_media.sql",
  "20260913005000_place_accesses.sql",
  "20260913013000_place_informational_activities.sql",
  "20260913090000_product_ticket_admission_policy.sql",
  "20260913103000_place_activity_media_paths.sql",
  "20260913120000_repair_demo_vendor_order_earnings.sql",
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
