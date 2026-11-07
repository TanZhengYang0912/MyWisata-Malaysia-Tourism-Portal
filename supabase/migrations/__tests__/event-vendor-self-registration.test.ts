import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationName = readdirSync('supabase/migrations').find((name) => name.endsWith('_event_vendor_self_registration.sql'));
const migration = migrationName ? readFileSync(`supabase/migrations/${migrationName}`, 'utf8') : '';

describe('event vendor self-registration migration', () => {
  it('creates an authenticated invoker wrapper around a private transaction function', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION app_private\.register_event_vendor_application\([\s\S]*?RETURNS jsonb[\s\S]*?LANGUAGE plpgsql[\s\S]*?SECURITY DEFINER/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.register_event_vendor_application\([\s\S]*?RETURNS jsonb[\s\S]*?LANGUAGE sql[\s\S]*?SECURITY INVOKER/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.register_event_vendor_application[\s\S]*?FROM PUBLIC, anon, service_role/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.register_event_vendor_application[\s\S]*?TO authenticated, service_role/i);
  });

  it('requires an authenticated user with a verified phone and creates a pending event vendor without shop resources', () => {
    expect(migration).toContain('auth.uid()');
    expect(migration).toContain('phone_verification_required');
    expect(migration).toMatch(/INSERT INTO public\.vendors[\s\S]*?'event'[\s\S]*?'pending'/i);
    expect(migration).toContain("'submitted'");
    expect(migration).not.toMatch(/INSERT INTO public\.outlets/i);
    expect(migration).not.toMatch(/INSERT INTO public\.user_roles/i);
    expect(migration).toContain('register_event_vendor_application');
  });

  it('keeps gallery writes scoped to the authenticated user and refreshes the PostgREST schema', () => {
    expect(migration).toContain("jsonb_array_length(p_gallery) NOT IN (0, 3)");
    expect(migration).toMatch(/v_user::TEXT\s*\|\|\s*'\/registrations\/\[0-9a-f-/);
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
