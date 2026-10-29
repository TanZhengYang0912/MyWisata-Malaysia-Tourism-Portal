import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const directory = resolve(process.cwd(), 'supabase/migrations');
const migration = () => {
  const file = readdirSync(directory).find((name) => name.endsWith('_notify_super_admin_on_withdrawal_escalation.sql'));
  expect(file, 'forward migration should wire overdue escalation into the existing durable job').toBeTruthy();
  return readFileSync(resolve(directory, file!), 'utf8');
};

describe('withdrawal escalation notification delivery', () => {
  it('uses the existing idempotent notification job and limits escalations to Super Admins', () => {
    const sql = migration();
    expect(sql).toMatch(/stage IN \('pending', 'pending_second_approval', 'overdue'\)/);
    expect(sql).toMatch(/NEW\.status IN \('pending', 'pending_second_approval', 'overdue'\)/);
    expect(sql).toContain('public.is_super_admin(users.id)');
    expect(sql).toContain("'withdrawal_overdue:'");
    expect(sql).toContain('ON CONFLICT DO NOTHING');
  });
});
