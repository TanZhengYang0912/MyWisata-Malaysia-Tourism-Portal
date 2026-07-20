import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/080_vendor_notifications.sql', 'utf8');

describe('vendor notification migration', () => {
  it('adds scoped columns, constraints, and query indexes', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS vendor_id UUID');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS outlet_id UUID');
    expect(sql).toContain('audience_role');
    expect(sql).toContain('notifications_vendor_scope_idx');
    expect(sql).toContain('notifications_outlet_scope_idx');
  });
});
