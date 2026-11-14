import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261114072629_vendor_media_objects.sql'), 'utf8');
const executable = sql.replace(/--.*$/gm, '');

describe('vendor media object registry migration (cleanup Phase 1)', () => {
  it('only records uploads; it deletes nothing and never touches Storage objects', () => {
    expect(executable).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executable).not.toMatch(/storage\.objects/i);
    expect(executable).toContain('CREATE TABLE IF NOT EXISTS app_private.vendor_media_objects');
  });

  it('keeps the registry private to the service role', () => {
    expect(executable).toContain('ALTER TABLE app_private.vendor_media_objects ENABLE ROW LEVEL SECURITY;');
    expect(executable).toContain('REVOKE ALL ON app_private.vendor_media_objects FROM PUBLIC, anon, authenticated;');
    for (const fn of ['reserve_vendor_media_object(text, text, uuid, uuid, text)', 'mark_vendor_media_object_stored(uuid)']) {
      expect(executable).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon, authenticated;`);
      expect(executable).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role;`);
    }
  });

  it('only accepts paths inside the owning vendor folder of the two public buckets', () => {
    expect(executable).toContain("CHECK (bucket IN ('vendor-products', 'event-posters'))");
    expect(executable).toContain("CHECK (left(storage_path, 37) = vendor_id::text || '/')");
    expect(executable).toContain('UNIQUE (bucket, storage_path)');
  });

  it('documents rollout order and rollback', () => {
    expect(sql).toContain('Apply only after');
    expect(sql).toContain('Rollback:');
  });
});
