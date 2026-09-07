export interface WalletMarkerTransaction {
  amount_sen: number;
}

export interface DemoWithdrawalState {
  id: string;
  status: string;
}

export interface AliceWalletActionInput {
  earningsSen: number;
  creditTransaction: WalletMarkerTransaction | null;
  debitTransaction: WalletMarkerTransaction | null;
  withdrawal: DemoWithdrawalState | null;
  unrelatedActiveWithdrawal: DemoWithdrawalState | null;
}

export interface AliceWalletActions {
  complete: boolean;
  creditAmountSen: number;
  submitWithdrawal: boolean;
  rejectWithdrawal: boolean;
  debitAmountSen: number;
}

export const ALICE_ID: string;
export const ADMIN_ID: string;
export const ALICE_EMAIL: string;
export const ADMIN_EMAIL: string;
export const DEMO_PASSWORD: string;
export const WITHDRAWAL_AMOUNT_SEN: number;
export const ADJUSTMENT_CREDIT_NOTE: string;
export const ADJUSTMENT_DEBIT_NOTE: string;
export const WITHDRAWAL_REJECTION_NOTE: string;
export const DEMO_DESTINATION_REFERENCE: string;

export function createDemoKycHashes(secret: string): {
  identity: string;
  document: string;
};

export function planAliceWalletActions(input: AliceWalletActionInput): AliceWalletActions;

export function seedAliceWalletDemo(input: {
  service: unknown;
  url: string;
  anonKey: string;
  kycHmacKey: string;
}): Promise<{
  kyc: string;
  withdrawalStatus: string;
  adjustmentAmountSen: number;
}>;
