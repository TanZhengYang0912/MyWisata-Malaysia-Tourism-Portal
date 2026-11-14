import { describe, expect, it, vi } from 'vitest';
import { submitCampaignRegistration } from '../campaign-registrations';

const input = {
  stallNumber: '',
  stallDescription: 'Kuih and tea from Cameron Highlands.',
  stallPosterUrl: 'https://storage.example/poster.png',
  products: [],
} as never;

function dbFailingWith(error: { message: string; code?: string }) {
  return { rpc: vi.fn().mockResolvedValue({ data: null, error }) } as never;
}

describe('submitCampaignRegistration duplicate protection', () => {
  it('reports the RPC duplicate check as already registered', async () => {
    await expect(submitCampaignRegistration(dbFailingWith({ message: 'already_registered' }), 'loc-1', 'vendor-1', input))
      .resolves.toEqual({ ok: false, code: 'already_registered' });
  });

  it('reports a concurrent submit that hit the location/vendor unique constraint as already registered, not a server error', async () => {
    const error = { code: '23505', message: 'duplicate key value violates unique constraint "promotion_campaign_vendors_location_vendor_unique"' };
    await expect(submitCampaignRegistration(dbFailingWith(error), 'loc-1', 'vendor-1', input))
      .resolves.toEqual({ ok: false, code: 'already_registered' });
  });
});
