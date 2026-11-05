import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PORTAL_E2E_BASE_URL;
if (baseURL !== 'http://localhost:3001') throw new Error('Run this suite through scripts/run-access-control-e2e.mjs');

export default defineConfig({
  testDir: './tests/e2e', testMatch: process.env.PORTAL_E2E_RECOVERY_ACCEPTANCE === '1' ? 'owned-flow-admin-recovery.spec.ts' : 'access-control-acceptance.spec.ts',
  fullyParallel: false, workers: 1, retries: 0, reporter: 'list', timeout: 600_000,
  expect: { timeout: 20_000 },
  use: { ...devices['Desktop Chrome'], baseURL, trace: 'off', video: 'off', screenshot: 'off' },
  projects: [{ name: 'chromium' }],
});
