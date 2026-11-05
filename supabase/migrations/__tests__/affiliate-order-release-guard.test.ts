import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261029060000_affiliate_order_release_guard.sql', 'utf8');
const previewSql = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.get_affiliate_order_release_preview'));

describe('Affiliate order release guard migration', () => {
  it('uses the order-first transaction lock before checking unresolved pickup obligations', () => {
    expect(sql).toMatch(/FROM public\.orders WHERE id = v_order_id FOR UPDATE/i);
    expect(sql).toMatch(/app_private\.affiliate_order_release_blocker\(v_order_id\)/i);
    expect(sql).toContain("'order_review_required'");
    expect(sql).toContain("'customer_no_show'");
  });

  it('exposes only a bounded service-role read-only preview', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_affiliate_order_release_preview\(p_attribution_ids uuid\[\]\)/i);
    expect(sql).toMatch(/cardinality\(p_attribution_ids\) > 50/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_affiliate_order_release_preview\(uuid\[\]\) FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_affiliate_order_release_preview\(uuid\[\]\) TO service_role/i);
    expect(previewSql).not.toMatch(/INSERT INTO public\.(wallets|wallet_transactions)|UPDATE public\.affiliate_attributions/i);
  });

  it('keeps pending Guest commission reviews blocked in the legacy clearer', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION app_private.confirm_pending_earnings()');
    const end = sql.indexOf('CREATE OR REPLACE FUNCTION public.confirm_pending_earnings()', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(sql.slice(start, end)).toMatch(/affiliate_guest_commission_reviews[\s\S]*status\s*=\s*'pending'/i);
  });
});
