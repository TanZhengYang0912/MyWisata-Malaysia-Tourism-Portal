import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const noopSql = readFileSync(new URL('../20261104162914_profile_noop_writes.sql', import.meta.url), 'utf8');
const avatarSql = readFileSync(new URL('../20261104163453_profile_avatar_assets.sql', import.meta.url), 'utf8');
const avatarRoute = readFileSync(new URL('../../../app/api/profile/avatar/route.ts', import.meta.url), 'utf8');

describe('profile no-op and avatar asset boundaries', () => {
  it('performs owner-scoped database comparisons before writes', () => {
    expect(noopSql).toContain("(SELECT auth.uid())");
    expect(noopSql).toContain("u.status = 'active'");
    expect(noopSql.match(/IS DISTINCT FROM/g)?.length).toBeGreaterThanOrEqual(4);
    expect(noopSql).toContain('FROM PUBLIC, anon');
  });

  it('keeps avatar digests private and deduplicates per owner', () => {
    expect(avatarSql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(avatarSql).toContain('REVOKE ALL ON app_private.profile_avatar_assets FROM PUBLIC, anon, authenticated');
    expect(avatarSql).toContain('ON app_private.profile_avatar_assets(owner_user_id, hash_version, digest)');
    expect(avatarSql).toContain("state IN ('pending', 'active', 'deleting')");
    expect(avatarSql).toContain('owner_user_id uuid NOT NULL,');
    expect(avatarSql).toContain('DELETE FROM app_private.profile_avatar_assets a');
    expect(avatarSql).toContain("a.state = 'deleting' AND a.cleanup_claimed_at < clock_timestamp() - interval '15 minutes'");
    expect(avatarSql).toContain('AND a.state = \'active\' FOR UPDATE');
    expect(avatarSql).toContain('cleanup_claim_token = gen_random_uuid()');
    expect(avatarSql).toContain('a.cleanup_claim_token = p_claim_token');
    expect(avatarSql).toContain('FOR UPDATE SKIP LOCKED');
    expect(avatarSql).toContain('NOT EXISTS (SELECT 1 FROM public.users');
  });

  it('hashes and validates uploaded bytes on the server and never enables overwrite', () => {
    expect(avatarRoute).toContain("createHash('sha256').update(bytes)");
    expect(avatarRoute).toContain("find_profile_avatar_asset");
    expect(avatarRoute).toContain('sameAccountLegacyAvatarPath');
    expect(avatarRoute).toContain('validateAvatarBytes(bytes, file.type)');
    expect(avatarRoute).toContain('upsert: false');
    expect(avatarRoute).not.toContain('createSignedUploadUrl');
  });
});
