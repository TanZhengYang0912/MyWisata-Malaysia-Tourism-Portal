import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261114072603_event_promotion_checkout_supersession.sql'),
  'utf8',
);
const confirmBody = sql.slice(
  sql.indexOf('CREATE FUNCTION public.confirm_vendor_event_promotion_stripe_payment'),
  sql.indexOf('CREATE OR REPLACE FUNCTION public.record_vendor_event_promotion_stripe_refund'),
);

describe('event promotion checkout supersession migration', () => {
  it('adds nullable pending-session columns without rewriting existing rows', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS pending_checkout_session_id TEXT');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS pending_checkout_amount_sen BIGINT');
    expect(sql.replace(/--.*$/gm, '')).not.toMatch(/UPDATE public\.vendor_event_promotions\s+SET[^;]*WHERE(?![^;]*id = p_promotion_id)/);
  });

  it('reports every non-postable outcome instead of raising, so the webhook can refund', () => {
    for (const outcome of ['not_found', 'already_confirmed', 'already_paid', 'not_payable', 'superseded', 'amount_mismatch', 'confirmed']) {
      expect(confirmBody).toContain(`RETURN '${outcome}'`);
    }
    expect(confirmBody).not.toContain('RAISE EXCEPTION');
    expect(confirmBody).toContain('FOR UPDATE');
    expect(confirmBody).toContain('RETURNS TEXT');
  });

  it('keeps both payment functions service-role only', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.confirm_vendor_event_promotion_stripe_payment(UUID, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.confirm_vendor_event_promotion_stripe_payment(UUID, TEXT, BIGINT) TO service_role;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.record_vendor_event_promotion_stripe_refund(UUID, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.record_vendor_event_promotion_stripe_refund(UUID, TEXT, TEXT, BIGINT, TEXT) TO service_role;');
  });

  it('documents rollout order and rollback', () => {
    expect(sql).toContain('Apply only after');
    expect(sql).toContain('Rollback:');
  });

  it('records refund outcomes once and alerts Super Admins only when a refund fails', () => {
    const body = sql.slice(sql.indexOf('FUNCTION public.record_vendor_event_promotion_refund_outcome'));
    expect(body).toContain("after_data->>'status' = p_status");
    expect(body).toContain("IF p_status IN ('failed', 'canceled') THEN");
    expect(body).toContain('public.is_super_admin(users.id)');
    expect(body).toContain('ON CONFLICT (event_key) DO NOTHING');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.record_vendor_event_promotion_refund_outcome(UUID, TEXT, TEXT, TEXT, TEXT, BIGINT) TO service_role;');
  });
});
