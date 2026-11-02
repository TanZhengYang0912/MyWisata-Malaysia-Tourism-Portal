import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261029045138_affiliate_refund_resolution_code.sql',
  'utf8',
);
const eventTest = readFileSync('supabase/tests/event_settlement_pickup_resolution.sql', 'utf8');
const runner = readFileSync('scripts/test-event-management-db.mjs', 'utf8');

describe('processed event refund resolution classification', () => {
  it('marks newly processed refunds as refunded in the trigger', () => {
    expect(migration).toContain("resolution_code='refunded'");
    expect(migration).toContain("NEW.status='processed'");
    expect(migration).toContain("TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status");
  });

  it('backfills only resolved exceptions linked to processed refunds', () => {
    expect(migration).toMatch(/UPDATE public\.event_order_exceptions[\s\S]*?SET resolution_code\s*=\s*'refunded'[\s\S]*?FROM public\.refunds[\s\S]*?r\.status\s*=\s*'processed'[\s\S]*?e\.state\s*=\s*'resolved'[\s\S]*?e\.resolution_code IS NULL/i);
  });

  it('runs both historical backfill and new-trigger cases in the disposable SQL suite', () => {
    expect(runner).toContain('event_refund_resolution_backfill_fixture.sql');
    expect(runner).toContain('20261029045138_affiliate_refund_resolution_code.sql');
    expect(eventTest).toContain("resolution_code='refunded'");
    expect(eventTest).toContain('legacy-processed-refund-resolution-test');
  });
});
