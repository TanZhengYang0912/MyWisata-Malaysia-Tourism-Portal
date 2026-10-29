import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { localEnv } from './helpers/demo';
import { portalArtifacts } from './helpers/portal-fixture';

test.use({ trace: 'off', video: 'off', launchOptions: { channel: 'chrome' } });
test('observe the real challenge without solving it or signing in', async ({ page }) => {
  test.skip(localEnv('PORTAL_E2E_DIAGNOSE_TURNSTILE') !== '1', 'Explicit provider diagnostics only; no challenge is solved automatically.');
  test.setTimeout(75_000);
  const responses: Record<string, number> = {};
  const failures: string[] = [];
  page.on('response', response => { if (new URL(response.url()).hostname === 'challenges.cloudflare.com') responses[String(response.status())] = (responses[String(response.status())] ?? 0) + 1; });
  page.on('requestfailed', request => { if (new URL(request.url()).hostname === 'challenges.cloudflare.com') failures.push(request.failure()?.errorText ?? 'request_failed'); });
  await page.goto('/login');
  await page.locator('[data-human-verification-error]').waitFor({ state: 'attached', timeout: 45_000 }).catch(() => undefined);
  const code = await page.locator('[data-human-verification]').first().getAttribute('data-human-verification-error');
  writeFileSync(join(portalArtifacts(), 'turnstile-diagnostics.json'), JSON.stringify({ hostname: new URL(page.url()).hostname, providerErrorCode: code, responses, failures, outcome: code ? 'provider-error' : 'awaiting-human-or-no-error' }, null, 2));
  await page.screenshot({ path: join(portalArtifacts(), 'turnstile-diagnostics.png'), fullPage: true });
});
