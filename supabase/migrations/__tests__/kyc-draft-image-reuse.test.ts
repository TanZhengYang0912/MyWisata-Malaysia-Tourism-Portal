import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261104161846_kyc_draft_image_reuse.sql', 'utf8');

describe('KYC draft evidence reuse migration', () => {
  it('stores server-verified per-side fingerprints and returns without changing unchanged drafts', () => {
    expect(migration).toContain('front_input_sha256 text');
    expect(migration).toContain('back_input_sha256 text');
    expect(migration).toContain('front_evidence_sha256 text');
    expect(migration).toContain('back_evidence_sha256 text');
    expect(migration).toContain('RETURN QUERY SELECT v_draft.id,v_draft.version,v_draft.expires_at,false;');
  });

  it('keeps save RPC service-only and rechecks the active owner', () => {
    expect(migration).toContain("auth.role()<>'service_role'");
    expect(migration).toContain("u.status='active'");
    expect(migration).toContain('FROM PUBLIC,anon,authenticated');
  });
});
