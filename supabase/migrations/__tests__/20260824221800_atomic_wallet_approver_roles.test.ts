import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260824221800_atomic_wallet_approver_roles.sql',
);

function migrationSource() {
  expect(existsSync(migrationPath), 'atomic wallet approver migration must exist').toBe(true);
  return readFileSync(migrationPath, 'utf8');
}

describe('atomic wallet approver role migration', () => {
  it('serializes every role change before checking the active approver count', () => {
    const sql = migrationSource();

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.manage_wallet_approver(');
    expect(sql).toContain("pg_advisory_xact_lock(hashtext('wallet_approver_roles'))");
    expect(sql).toMatch(/pg_advisory_xact_lock[\s\S]*COUNT\(DISTINCT ur\.user_id\)/);
    expect(sql).toContain("RAISE EXCEPTION 'last_approver'");
  });

  it('keeps authorization, mutation, audit and notification in one transaction', () => {
    const sql = migrationSource();

    expect(sql).toContain('public.is_super_admin(auth.uid())');
    expect(sql).toContain("RAISE EXCEPTION 'self_role_change'");
    expect(sql).toContain("RAISE EXCEPTION 'privileged_target'");
    expect(sql).toContain('INSERT INTO public.user_roles');
    expect(sql).toContain('DELETE FROM public.user_roles');
    expect(sql).toContain('INSERT INTO public.audit_logs');
    expect(sql).toContain('INSERT INTO public.notifications');
  });

  it('exposes the RPC only to authenticated callers', () => {
    const sql = migrationSource();

    expect(sql).toContain('REVOKE ALL ON FUNCTION public.manage_wallet_approver(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.manage_wallet_approver(UUID, TEXT, TEXT, TEXT) TO authenticated');
  });
});
