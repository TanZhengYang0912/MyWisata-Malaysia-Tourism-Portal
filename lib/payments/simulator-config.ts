type SimulatorEnvironment = {
  NODE_ENV?: string;
  PAYMENT_SIMULATOR_MODE?: string;
  PAYMENT_SIMULATOR_WEBHOOK_SECRET?: string;
};

export function isPaymentSimulatorEnabled(
  environment: SimulatorEnvironment = process.env,
): boolean {
  return environment.NODE_ENV !== 'production'
    && environment.PAYMENT_SIMULATOR_MODE === 'enabled'
    && Boolean(environment.PAYMENT_SIMULATOR_WEBHOOK_SECRET?.trim());
}
