import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260821150000_recommendation_geography_localization.sql'),
  'utf8',
);

describe('recommendation geography and localization migration', () => {
  it('keeps the external Google place identifier separate from internal Place references', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS suggested_place_id UUID REFERENCES public.places(id) ON DELETE SET NULL');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS resolved_place_id UUID REFERENCES public.places(id) ON DELETE SET NULL');
    expect(migration).not.toMatch(/google_place_id[^;]*REFERENCES public\.places/i);
  });

  it('stores source-hash-bound translation drafts behind RLS', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.content_translations');
    expect(migration).toContain('UNIQUE (entity_type, entity_id, field, locale, source_hash)');
    expect(migration).toContain('ALTER TABLE public.content_translations ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain("status IN ('draft', 'approved', 'rejected', 'stale')");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.content_translation_generation_locks');
    expect(migration).toContain('expires_at TIMESTAMPTZ');
    expect(migration).toContain('owner_token UUID NOT NULL');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.admin_review_recommendation_translation');
  });
});
