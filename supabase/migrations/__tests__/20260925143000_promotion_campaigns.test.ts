import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260925143000_promotion_campaigns.sql");

function migrationSql() {
  return existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
}

describe("promotion campaign migration", () => {
  it("creates constrained campaign and offer tables with a single linked source", () => {
    const sql = migrationSql();
    expect(existsSync(migrationPath)).toBe(true);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.promotion_campaigns[\s\S]*starts_at TIMESTAMPTZ[\s\S]*ends_at TIMESTAMPTZ[\s\S]*ends_at > starts_at/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.promotion_campaign_offers[\s\S]*voucher_id UUID[\s\S]*product_id UUID[\s\S]*num_nonnulls\(voucher_id, product_id\) = 1/);
    expect(sql).toMatch(/FOREIGN KEY\s*\(product_id, outlet_id\)\s*REFERENCES public\.outlet_offers\s*\(product_id, outlet_id\)/i);
  });

  it("keeps source tables private and restricts direct writes to campaign data", () => {
    const sql = migrationSql();
    expect(sql).toMatch(/ALTER TABLE public\.promotion_campaigns ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/ALTER TABLE public\.promotion_campaign_offers ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/has_staff_permission\(auth\.uid\(\), 'admin\.promotion_campaign\.manage'\)/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.promotion_campaigns FROM PUBLIC, anon, authenticated, service_role/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.promotion_campaign_offers FROM PUBLIC, anon, authenticated, service_role/i);
    expect(sql).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[\s\S]{0,100}promotion_campaigns[\s\S]{0,100}TO\s+(?:anon|authenticated)/i);
  });

  it("seeds a dedicated permission, dynamic module, and unassigned least-privilege role template", () => {
    const sql = migrationSql();
    expect(sql).toContain("'admin.promotion_campaign.manage'");
    expect(sql).toContain("'promotion_campaigns'");
    expect(sql).toContain("'/admin/promotion-campaigns'");
    expect(sql).toContain("'Promotion Campaign Manager'");
    expect(sql).toMatch(/staff_module_permissions[\s\S]*promotion_campaigns[\s\S]*admin\.promotion_campaign\.manage/);
    expect(sql).toMatch(/staff_role_modules[\s\S]*Promotion Campaign Manager[\s\S]*promotion_campaigns/);
    expect(sql).toMatch(/staff_role_permissions[\s\S]*Promotion Campaign Manager[\s\S]*admin\.promotion_campaign\.manage/);
    expect(sql).not.toContain("Legacy Admin");
    expect(sql).not.toMatch(/INSERT INTO public\.staff_role_assignments/i);
  });

  it("guards atomic workflow transitions against stale writes and self-approval", () => {
    const sql = migrationSql();
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.transition_promotion_campaign[\s\S]*SECURITY DEFINER[\s\S]*SET search_path = public, pg_temp/i);
    expect(sql).toMatch(/p_expected_updated_at/);
    expect(sql).toMatch(/created_by\s+IS NOT DISTINCT FROM\s+v_actor/i);
    expect(sql).toMatch(/admin\.promotion_campaign\.manage/);
    expect(sql).toMatch(/promotion_campaign_creator_cannot_approve/);
    expect(sql).toMatch(/public\.audit_logs/);
  });

  it("lets staff revise a rejected draft before submitting it again", () => {
    const sql = migrationSql();
    expect(sql).toMatch(/status NOT IN \('draft', 'rejected'\)/);
    expect(sql).toMatch(/status = CASE WHEN status = 'rejected' THEN 'draft' ELSE status END/);
    expect(sql).toMatch(/rejection_note = CASE WHEN status = 'rejected' THEN NULL ELSE rejection_note END/);
    expect(sql).toMatch(/v_campaign\.updated_at IS DISTINCT FROM p_expected_updated_at/);
  });

  it("revalidates voucher/product/outlet eligibility in guarded writes and the public projection", () => {
    const sql = migrationSql();
    expect(sql).toMatch(/public\.vouchers[\s\S]*vendor_review_status = 'approved'[\s\S]*is_claimable[\s\S]*reserved_uses/);
    expect(sql).toMatch(/public\.products[\s\S]*review_status = 'approved'[\s\S]*public\.outlet_offers[\s\S]*public\.outlets/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_public_promotion_campaigns[\s\S]*SECURITY DEFINER[\s\S]*status = 'approved'[\s\S]*ends_at > now\(\)/i);
    expect(sql).toMatch(/starts_at <= now\(\)/i);
    expect(sql).toMatch(/campaign_offer_source_not_eligible/);
    expect(sql).toMatch(/'eligibleProducts', COALESCE/);
    expect(sql).toMatch(/'eligibleOutlets', COALESCE/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_admin_promotion_campaign_sources[\s\S]*promotion_campaign_permission_required/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_admin_promotion_campaign_sources\(\) FROM PUBLIC, anon, authenticated, service_role/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_admin_promotion_campaign_sources\(\) TO authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_public_promotion_campaigns\(TEXT\) TO anon, authenticated/i);
  });

  it("adds an image lookup index for the campaign product-media projection", () => {
    const migrations = readdirSync(resolve(process.cwd(), "supabase/migrations"))
      .filter((filename) => filename.endsWith("_campaign_product_media_lookup_index.sql"));

    expect(migrations).toHaveLength(1);
    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", migrations[0] ?? ""), "utf8");
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS [\w]+\s+ON public\.media_assets\s*\(product_id,\s*sort_order NULLS LAST,\s*created_at\)\s+WHERE media_type\s*=\s*'image'/i);
  });

  it("connects future direct-outlet product writes without rewriting existing cross-vendor data", () => {
    const sql = migrationSql();
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.sync_product_outlet_offer\(\)[\s\S]*INSERT INTO public\.outlet_offers[\s\S]*NEW\.id[\s\S]*NEW\.outlet_id[\s\S]*NEW\.base_price[\s\S]*ON CONFLICT \(product_id, outlet_id\) DO UPDATE[\s\S]*SET price = EXCLUDED\.price/i);
    expect(sql).toMatch(/CREATE TRIGGER trg_sync_product_outlet_offer[\s\S]*AFTER INSERT OR UPDATE OF outlet_id, base_price ON public\.products[\s\S]*EXECUTE FUNCTION public\.sync_product_outlet_offer\(\)/i);
    expect(sql).not.toMatch(/INSERT INTO public\.outlet_offers\s*\(product_id, outlet_id, price, status\)[\s\S]*SELECT product\.id, product\.outlet_id, product\.base_price[\s\S]*FROM public\.products AS product/i);
  });
});
