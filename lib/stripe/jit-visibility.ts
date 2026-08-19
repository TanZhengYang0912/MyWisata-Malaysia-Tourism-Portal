export const CUSTOMER_WITHDRAWAL_MINIMUM_RM = 50;

export function shouldExposeStripePayoutSetup(input: {
  availableEarningsRm: number;
  withdrawRequested: boolean;
  returningFromOnboarding: boolean;
}): boolean {
  if (input.returningFromOnboarding) return true;
  if (input.availableEarningsRm >= CUSTOMER_WITHDRAWAL_MINIMUM_RM) return true;
  return input.withdrawRequested && input.availableEarningsRm > 0;
}
