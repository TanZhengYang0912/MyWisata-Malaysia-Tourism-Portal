import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/081_vendor_email_event_types.sql';

describe('vendor email event type migration contract', () => {
  it('recreates the outbox check with exactly the supported vendor events', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('DROP CONSTRAINT IF EXISTS email_outbox_event_type_check');
    expect(sql).toContain('ADD CONSTRAINT email_outbox_event_type_check CHECK');
    for (const eventType of [
      'vendor_order_update',
      'vendor_booking_update',
      'vendor_listing_review',
      'vendor_wallet_update',
      'vendor_account_update',
      'vendor_permission_update',
    ]) {
      expect(sql).toContain(`'${eventType}'`);
    }
  });

  it('notifies PostgREST to refresh the schema cache', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
