import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { localEnv, totpCode } from './helpers/demo';
import { installPortalFixtureCleanup, PortalFixture } from './helpers/portal-fixture';

test.use({ trace: 'off', video: 'off' });
test.setTimeout(120_000);
installPortalFixtureCleanup();

test('TOTP does not relabel a magic-link staff session as Password and Passkey', async () => {
  test.skip(!localEnv('PORTAL_E2E_TEST_DB_CONFIRM'), 'Requires the explicitly authorized Supabase testing project.');
  const fixture = new PortalFixture();
  const client = createClient(fixture.target.url, fixture.target.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const account = await fixture.createAccount('super_admin');
    const link = await fixture.service.auth.admin.generateLink({ type: 'magiclink', email: account.email });
    expect(link.error?.code).toBeUndefined();
    const session = await client.auth.verifyOtp({ token_hash: link.data.properties!.hashed_token, type: 'magiclink' });
    expect(session.error?.code).toBeUndefined();
    const factor = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Temporary QA negative case', issuer: 'MYLawatan' });
    expect(factor.error?.code).toBeUndefined();
    if (!factor.data || factor.data.type !== 'totp') throw new Error('Expected a temporary TOTP factor.');
    const verified = await client.auth.mfa.challengeAndVerify({ factorId: factor.data.id, code: totpCode(factor.data.totp.secret) });
    expect(verified.error?.code).toBeUndefined();
    const claims = await client.auth.getClaims();
    expect(claims.error?.code).toBeUndefined();
    expect(claims.data?.claims.aal).toBe('aal2');
    const status = await client.rpc('staff_passkey_status');
    expect(status.error?.code).toBeUndefined();
    expect(status.data).toMatchObject({ required: true, passwordAuthenticated: false, verified: false });
    expect((await client.rpc('is_super_admin', { uid: account.id })).data).toBe(false);
    expect((await client.rpc('has_staff_permission', { p_user_id: account.id, p_permission_key: 'admin.event_promotion.review' })).data).toBe(false);
    expect((await client.rpc('has_staff_permission', { p_user_id: account.id, p_permission_key: 'admin.recommendation.review' })).data).toBe(false);
  } finally {
    const signedOut = await client.auth.signOut({ scope: 'global' });
    try { expect(signedOut.error?.code).toBeUndefined(); } finally { await fixture.cleanup(); }
  }
});
