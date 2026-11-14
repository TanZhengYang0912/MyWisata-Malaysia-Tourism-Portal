import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261114072657_vendor_media_cleanup_sweep.sql'), 'utf8');
const reference = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION app_private.vendor_media_object_is_referenced'), sql.indexOf('CREATE OR REPLACE FUNCTION app_private.claim_vendor_media_cleanup'));
const claim = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION app_private.claim_vendor_media_cleanup'), sql.indexOf('CREATE OR REPLACE FUNCTION app_private.finish_vendor_media_cleanup'));

describe('vendor media cleanup sweep migration (Phase 2)', () => {
  it('checks every place a vendor image URL is saved', () => {
    for (const column of ['v.logo_url', 'v.cover_url', 'p.cover_url', 'm.url', 'op.hero_url', 'op.draft_document', 'op.published_document', 'h.payload', 'e.poster_url', 'r.stall_poster_url', 'rp.image_url']) {
      expect(reference, column).toContain(column);
    }
    expect(reference).toContain("h.status = 'pending_review'");
  });

  it('defaults to a dry run that writes nothing', () => {
    expect(claim).toContain('p_dry_run boolean DEFAULT true');
    const updates = claim.match(/UPDATE app_private\.vendor_media_objects/g) ?? [];
    const guardedUpdates = claim.match(/IF NOT p_dry_run THEN\s+(?:v_token := gen_random_uuid\(\);\s+)?UPDATE app_private\.vendor_media_objects/g) ?? [];
    expect(updates.length).toBe(3);
    expect(guardedUpdates.length).toBe(updates.length);
  });

  it('uses the approved retention windows and safe concurrency', () => {
    expect(claim).toContain("interval '24 hours'");
    expect(claim).toContain("interval '7 days'");
    expect(claim).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('cleanup_claim_token = p_claim_token');
  });

  it('keeps every function service-role only', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.claim_vendor_media_cleanup(integer, boolean) TO service_role;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.claim_vendor_media_cleanup(integer, boolean) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION app_private.vendor_media_object_is_referenced(text, text, uuid) FROM PUBLIC, anon, authenticated;');
  });
});
