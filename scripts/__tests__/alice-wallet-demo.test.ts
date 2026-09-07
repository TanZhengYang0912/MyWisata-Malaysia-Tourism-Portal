import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  ADJUSTMENT_CREDIT_NOTE,
  ADJUSTMENT_DEBIT_NOTE,
  WITHDRAWAL_AMOUNT_SEN,
  createDemoKycHashes,
  planAliceWalletActions,
} from "../lib/alice-wallet-demo.mjs";

describe("Alice Wallet demo action planner", () => {
  it("uses the configured keyed HMAC for both demo KYC fingerprints", () => {
    const secret = "test-only-hmac-key";
    const expected = (value: string) => createHmac("sha256", secret).update(value).digest("hex");

    expect(createDemoKycHashes(secret)).toEqual({
      identity: expected("VENDOR-CUSTOMER-DEMO:ALICE:KYC"),
      document: expected("VENDOR-CUSTOMER-DEMO:ALICE:DOCUMENT"),
    });
    expect(() => createDemoKycHashes("")).toThrow("KYC_IC_HMAC_KEY must be configured");
  });

  it("funds the exact withdrawal shortfall while guaranteeing visible adjustments", () => {
    expect(planAliceWalletActions({
      earningsSen: 708,
      creditTransaction: null,
      debitTransaction: null,
      withdrawal: null,
      unrelatedActiveWithdrawal: null,
    })).toEqual({
      complete: false,
      creditAmountSen: 4292,
      submitWithdrawal: true,
      rejectWithdrawal: false,
      debitAmountSen: 0,
    });
    expect(WITHDRAWAL_AMOUNT_SEN).toBe(5000);
    expect(ADJUSTMENT_CREDIT_NOTE).not.toBe(ADJUSTMENT_DEBIT_NOTE);
  });

  it("rejects the governed pending withdrawal before compensating the funding", () => {
    expect(planAliceWalletActions({
      earningsSen: 0,
      creditTransaction: { amount_sen: 4292 },
      debitTransaction: null,
      withdrawal: { id: "withdrawal-1", status: "pending" },
      unrelatedActiveWithdrawal: null,
    })).toEqual({
      complete: false,
      creditAmountSen: 0,
      submitWithdrawal: false,
      rejectWithdrawal: true,
      debitAmountSen: 0,
    });
  });

  it("applies the exact compensating debit after rejection and then becomes complete", () => {
    expect(planAliceWalletActions({
      earningsSen: 5000,
      creditTransaction: { amount_sen: 4292 },
      debitTransaction: null,
      withdrawal: { id: "withdrawal-1", status: "rejected" },
      unrelatedActiveWithdrawal: null,
    })).toEqual({
      complete: false,
      creditAmountSen: 0,
      submitWithdrawal: false,
      rejectWithdrawal: false,
      debitAmountSen: 4292,
    });

    expect(planAliceWalletActions({
      earningsSen: 708,
      creditTransaction: { amount_sen: 4292 },
      debitTransaction: { amount_sen: 4292 },
      withdrawal: { id: "withdrawal-1", status: "rejected" },
      unrelatedActiveWithdrawal: null,
    })).toEqual({
      complete: true,
      creditAmountSen: 0,
      submitWithdrawal: false,
      rejectWithdrawal: false,
      debitAmountSen: 0,
    });
  });

  it("refuses contradictory or unrelated money state", () => {
    const base = {
      earningsSen: 708,
      creditTransaction: null,
      debitTransaction: null,
      withdrawal: null,
      unrelatedActiveWithdrawal: null,
    };

    expect(() => planAliceWalletActions({
      ...base,
      debitTransaction: { amount_sen: 850 },
    })).toThrow("alice_wallet_demo_debit_without_credit");
    expect(() => planAliceWalletActions({
      ...base,
      creditTransaction: { amount_sen: 850 },
      debitTransaction: { amount_sen: 900 },
      withdrawal: { id: "withdrawal-1", status: "rejected" },
    })).toThrow("alice_wallet_demo_adjustment_mismatch");
    expect(() => planAliceWalletActions({
      ...base,
      unrelatedActiveWithdrawal: { id: "other-withdrawal", status: "pending" },
    })).toThrow("alice_wallet_demo_unrelated_active_withdrawal");
  });
});
