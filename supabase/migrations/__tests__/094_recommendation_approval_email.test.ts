import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/094_recommendation_approval_email.sql';

describe('recommendation approval email migration', () => {
  it('allows the approval event without dropping existing email events', () => {
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain("'recommendation_approved'");
    expect(sql).toContain("'recommendation_reward_pending'");
    expect(sql).toContain("'account_suspended'");
    expect(sql).toContain("'vendor_order_update'");
  });
});
