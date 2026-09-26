import { describe, expect, it } from 'vitest';
import { remoteDemoSeedBlockReason } from './demo-seed-guard.mjs';

describe('remote demo seed environment guard', () => {
  it('requires both explicit seed opt-in and an explicit staging environment', () => {
    expect(remoteDemoSeedBlockReason({})).toContain('REMOTE_DEMO_SEED=1');
    expect(remoteDemoSeedBlockReason({ REMOTE_DEMO_SEED: '1' })).toContain('MYWISATA_ENV=staging');
    expect(remoteDemoSeedBlockReason({ REMOTE_DEMO_SEED: '1', MYWISATA_ENV: 'staging', NODE_ENV: 'test' })).toBeNull();
  });

  it('never permits remote demo seeding in production', () => {
    expect(remoteDemoSeedBlockReason({ REMOTE_DEMO_SEED: '1', MYWISATA_ENV: 'staging', VERCEL_ENV: 'production' })).toContain('production');
    expect(remoteDemoSeedBlockReason({ REMOTE_DEMO_SEED: '1', MYWISATA_ENV: 'staging', NODE_ENV: 'production' })).toContain('production');
  });
});
