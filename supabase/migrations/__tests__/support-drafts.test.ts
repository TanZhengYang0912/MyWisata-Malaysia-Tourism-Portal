import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261111181000_support_drafts.sql', 'utf8');

describe('support draft storage contract', () => {
  it('keeps drafts private to service routes and versions writes', () => {
    expect(migration).toContain('ALTER TABLE public.support_drafts ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL ON TABLE public.support_drafts FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('support_draft_version_conflict');
    expect(migration).toContain('IF v_draft.subject = p_subject AND v_draft.body = p_body');
    expect(migration).toContain('version = version + 1');
  });
});
