import { expect, test } from '@playwright/test';
import { localEnv } from './helpers/demo';

test.use({ trace: 'off' });
import { ACCOUNTS, signIn } from './helpers/demo';

test('local admin session fixture signs in a seeded customer without opening password login', async ({ page }) => {
  test.skip(localEnv('E2E_AUTH_MODE') !== 'admin-session', 'This legacy customer smoke requires its explicitly selected local fixture mode.');
  expect(localEnv('E2E_AUTH_MODE'), 'run this acceptance check only with the local admin-session fixture enabled').toBe('admin-session');
  await signIn(page, ACCOUNTS.customer);
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  await expect(page).not.toHaveURL(/\/admin\/security/);
});

// Staff acceptance lives in admin-auth-acceptance.spec.ts. This magic-link
// fixture cannot prove Password + Passkey authentication, even after TOTP.
