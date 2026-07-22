import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../085_withdrawal_approver_notifications.sql', import.meta.url), 'utf8');

describe('withdrawal approver notification migration contract', () => {
  it('fans out to active approver roles and uses cycle-scoped idempotency keys', () => {
    expect(sql).toContain("r.name IN ('approver', 'super_admin')");
    expect(sql).toContain("u.status = 'active'");
    expect(sql).toContain("ur.user_id <> NEW.user_id");
    expect(sql).toContain("COALESCE(NEW.approval_cycle, 1)");
    expect(sql).toContain('ON CONFLICT (event_key) DO NOTHING');
    expect(sql).toContain('AFTER INSERT ON public.withdrawal_requests');
  });
});
