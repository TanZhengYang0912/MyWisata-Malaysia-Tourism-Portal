export function isRealStripeAccountId(value: string | null): value is string {
  return Boolean(value && /^acct_[A-Za-z0-9]+$/.test(value) && !value.startsWith('acct_demo_'));
}
