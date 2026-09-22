import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationName = readdirSync('supabase/migrations').find((name) => name.endsWith('_vendor_registration_gallery.sql'));
const migration = migrationName ? readFileSync(`supabase/migrations/${migrationName}`, 'utf8') : '';

describe('vendor registration gallery migration', () => {
  it('replaces the 12-argument registration RPC with a defaulted gallery argument', () => {
    expect(migration).toMatch(/DROP FUNCTION IF EXISTS public\.register_vendor_with_outlet\([\s\S]*?TEXT,\s*TEXT\s*\);/i);
    expect(migration).toMatch(/p_gallery\s+JSONB\s+DEFAULT\s+'\[\]'::jsonb/i);
    expect(migration).toMatch(/p_gallery[\s\S]*?jsonb_array_length\(p_gallery\)\s+NOT IN\s*\(0,\s*3\)/i);
    expect(migration).toMatch(/INSERT INTO public\.media_assets[\s\S]*?v_vendor_id[\s\S]*?p_gallery/i);
    expect(migration).toContain("/registrations/[0-9a-f-]+-gallery-[0-2][.](jpg|png|webp)$");
    expect(migration).toContain("/gallery/[0-9a-f-]+-gallery-[0-2][.](jpg|png|webp)$");
  });

  it('preserves authentication and advisory locking and restricts RPC execution', () => {
    expect(migration).toContain('auth.uid()');
    expect(migration).toContain("pg_advisory_xact_lock(hashtext('register_vendor'), hashtext(v_user::TEXT))");
    expect(migration).toMatch(/SECURITY DEFINER[\s\S]*?SET search_path = public, pg_temp/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.register_vendor_with_outlet[\s\S]*?FROM PUBLIC, anon/i);
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.register_vendor_with_outlet');
  });

  it('adds an owner-checked transactional gallery replacement RPC', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.set_vendor_gallery\([\s\S]*?p_vendor_id UUID[\s\S]*?p_gallery JSONB/i);
    expect(migration).toMatch(/set_vendor_gallery[\s\S]*?auth\.uid\(\)[\s\S]*?owner_id[\s\S]*?DELETE FROM public\.media_assets[\s\S]*?INSERT INTO public\.media_assets/i);
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.set_vendor_gallery(UUID, JSONB) TO authenticated');
  });

  it('reloads the PostgREST schema cache after replacing the exposed RPCs', () => {
    const refresh = migration.lastIndexOf("NOTIFY pgrst, 'reload schema';");
    const galleryGrant = migration.indexOf('GRANT EXECUTE ON FUNCTION public.set_vendor_gallery(UUID, JSONB) TO authenticated');
    expect(refresh).toBeGreaterThan(galleryGrant);
  });

  it('can safely replay the registration RPC definition after an out-of-band deployment', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.register_vendor_with_outlet\(/i);
  });
});
