import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261030120000_vendor_invite_profile_email_lookup.sql'), 'utf8');

describe('vendor invite profile email lookup migration', () => {
  it('matches historical email casing and whitespace while returning only existence', () => {
    expect(sql).toContain('RETURNS boolean');
    expect(sql).toContain('lower(btrim(user_profile.email)) = lower(btrim(p_email))');
    expect(sql).toContain('SELECT EXISTS');
    expect(sql).not.toMatch(/RETURNS TABLE|RETURNS SETOF|SELECT\s+user_profile\./i);
  });

  it('limits execution to the service role', () => {
    expect(sql).toContain('SECURITY INVOKER');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.profile_email_exists(text) FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.profile_email_exists(text) TO service_role');
  });
});
