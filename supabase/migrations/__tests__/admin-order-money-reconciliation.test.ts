import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261114070939_admin_order_money_reconciliation.sql'), 'utf8');

describe('admin order money reconciliation migration', () => {
  it('backfills canonical recommendation order links and preserves existing statuses', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS order_id UUID/i);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'pending'/i);
    expect(migration).toMatch(/conversion\.first_sale_order_id/i);
    expect(migration).not.toMatch(/UPDATE public\.recommendation_commissions[\s\S]*SET status/i);
  });

  it('limits the complete filtered report RPC to service role and returns bounded rows', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_admin_order_money_reconciliation/i);
    expect(migration).toMatch(/SECURITY INVOKER[\s\S]*SET search_path = ''/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_admin_order_money_reconciliation[\s\S]*FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_admin_order_money_reconciliation[\s\S]*TO service_role/i);
    expect(migration).toMatch(/SUM\(settlement\.gross_sen\)/i);
    expect(migration).toMatch(/GROUP BY settlement\.order_id/i);
    expect(migration).toMatch(/LIMIT p_page_size/i);
    expect(migration).toMatch(/ORDER BY report\.paid_at DESC NULLS LAST, report\.order_id ASC/i);
  });
});
