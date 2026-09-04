import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSuperAdmin } from '../admin-guard';

describe('general administration guard', () => {
  it.each([
    [['approver'], false], [['admin'], false], [['customer'], false], [[], false],
    [['super_admin'], true], [['approver', 'super_admin'], true],
  ] as [string[], boolean][])('roles %j have authority %s', async (roles, allowed) => {
    const db = { from: () => ({ select: () => ({ eq: async () => ({ data: roles.map((name) => ({ roles: { name } })), error: null }) }) }) } as unknown as SupabaseClient;
    expect(await isSuperAdmin(db, 'actor')).toBe(allowed);
  });

  it('fails closed even if a failed role lookup carries partial data', async () => {
    const db = { from: () => ({ select: () => ({ eq: async () => ({ data: [{ roles: { name: 'super_admin' } }], error: { message: 'lookup failed' } }) }) }) } as unknown as SupabaseClient;
    expect(await isSuperAdmin(db, 'actor')).toBe(false);
  });
});
