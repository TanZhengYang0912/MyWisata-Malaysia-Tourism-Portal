import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { restoreCaptcha } from '../run-access-control-e2e.mjs';

test('CAPTCHA restoration patches only its original switch and verifies retained provider configuration', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'captcha-restore-test-'));
  const originalFetch = globalThis.fetch;
  const originalConfirm = process.env.PORTAL_E2E_TEST_DB_CONFIRM;
  const originalToken = process.env.SUPABASE_ACCESS_TOKEN;
  const config = { security_captcha_enabled: false, security_captcha_provider: 'turnstile', security_captcha_secret: 'synthetic-test-secret' };
  const patchBodies = [];
  const fingerprint = createHash('sha256').update(JSON.stringify([config.security_captcha_provider, config.security_captcha_secret])).digest('hex');
  process.env.PORTAL_E2E_TEST_DB_CONFIRM = 'ncdlaehknicabzjqskvk';
  process.env.SUPABASE_ACCESS_TOKEN = 'synthetic-management-token';
  globalThis.fetch = async (_url, options) => {
    if (options.method === 'PATCH') { const patch = JSON.parse(options.body); patchBodies.push(patch); Object.assign(config, patch); }
    return new Response(JSON.stringify(config));
  };
  try {
    const journal = join(directory, 'captcha-restore.json');
    writeFileSync(journal, JSON.stringify({ projectRef: 'ncdlaehknicabzjqskvk', enabled: true, fingerprint }));
    await restoreCaptcha(directory, 0);
    assert.deepEqual(patchBodies, [{ security_captcha_enabled: true }]);
    assert.equal(config.security_captcha_enabled, true);
    assert.equal(existsSync(journal), false);
    const receipt = JSON.parse(readFileSync(join(directory, 'captcha-restored.json'), 'utf8'));
    assert.equal(receipt.restored, true);
    assert.equal(receipt.providerAndSecretUnchanged, true);
    assert.equal(JSON.stringify(receipt).includes('synthetic-test-secret'), false);
    rmSync(join(directory, 'captcha-restored.json'));
    writeFileSync(journal, JSON.stringify({ projectRef: 'ncdlaehknicabzjqskvk', enabled: true, fingerprint }));
    globalThis.fetch = async () => new Response('', { status: 503 });
    await assert.rejects(restoreCaptcha(directory, 0), /management request failed/);
    assert.equal(existsSync(journal), true, 'Failed restore must keep its recovery journal');
    assert.equal(existsSync(join(directory, 'captcha-restored.json')), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalConfirm === undefined) delete process.env.PORTAL_E2E_TEST_DB_CONFIRM; else process.env.PORTAL_E2E_TEST_DB_CONFIRM = originalConfirm;
    if (originalToken === undefined) delete process.env.SUPABASE_ACCESS_TOKEN; else process.env.SUPABASE_ACCESS_TOKEN = originalToken;
    rmSync(directory, { recursive: true, force: true });
  }
});
