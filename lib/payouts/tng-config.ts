export type TngPayoutEnvironment = {
  NODE_ENV?: string;
  TNG_PAYOUT_MODE?: string;
  TNG_MOCK_WEBHOOK_SECRET?: string;
};

export function isTngMockPayoutEnabled(environment: TngPayoutEnvironment = process.env): boolean {
  return environment.NODE_ENV !== 'production'
    && environment.TNG_PAYOUT_MODE === 'mock'
    && Boolean(environment.TNG_MOCK_WEBHOOK_SECRET?.trim());
}
