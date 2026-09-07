import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const ALICE_ID = "aaaaaaaa-0000-0000-0000-000000000005";
export const ADMIN_ID = "aaaaaaaa-0000-0000-0000-000000000001";
export const ALICE_EMAIL = "customer1@demo.local";
export const ADMIN_EMAIL = "admin@demo.local";
export const DEMO_PASSWORD = "demo123456";
export const WITHDRAWAL_AMOUNT_SEN = 5000;
export const ADJUSTMENT_CREDIT_NOTE = "Demo withdrawal funding credit [vendor-customer-demo:alice:withdrawal]";
export const ADJUSTMENT_DEBIT_NOTE = "Demo withdrawal funding reversal [vendor-customer-demo:alice:withdrawal]";
export const WITHDRAWAL_REJECTION_NOTE = "Demo withdrawal returned after payout detail review";

const ACTIVE_WITHDRAWAL_STATUSES = new Set([
  "pending",
  "pending_second_approval",
  "approved",
  "processing",
  "hold",
  "overdue",
]);
export const DEMO_DESTINATION_REFERENCE = "vendor-customer-demo-alice-tng-v1";
const DEMO_DOCUMENT_TOKEN = "11111111-1111-4111-8111-111111111111";
const DEMO_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

export function createDemoKycHashes(secret) {
  if (!secret) throw new Error("KYC_IC_HMAC_KEY must be configured");
  const digest = (value) => crypto.createHmac("sha256", secret).update(value).digest("hex");
  return {
    identity: digest("VENDOR-CUSTOMER-DEMO:ALICE:KYC"),
    document: digest("VENDOR-CUSTOMER-DEMO:ALICE:DOCUMENT"),
  };
}

export function planAliceWalletActions({
  earningsSen,
  creditTransaction,
  debitTransaction,
  withdrawal,
  unrelatedActiveWithdrawal,
}) {
  if (unrelatedActiveWithdrawal && ACTIVE_WITHDRAWAL_STATUSES.has(unrelatedActiveWithdrawal.status)) {
    throw new Error("alice_wallet_demo_unrelated_active_withdrawal");
  }
  if (debitTransaction && !creditTransaction) {
    throw new Error("alice_wallet_demo_debit_without_credit");
  }
  if (creditTransaction && debitTransaction && creditTransaction.amount_sen !== debitTransaction.amount_sen) {
    throw new Error("alice_wallet_demo_adjustment_mismatch");
  }
  if (withdrawal && !["pending", "rejected"].includes(withdrawal.status)) {
    throw new Error(`alice_wallet_demo_withdrawal_state:${withdrawal.status}`);
  }
  if (debitTransaction && withdrawal?.status !== "rejected") {
    throw new Error("alice_wallet_demo_debit_before_withdrawal_return");
  }

  if (creditTransaction && debitTransaction && withdrawal?.status === "rejected") {
    return {
      complete: true,
      creditAmountSen: 0,
      submitWithdrawal: false,
      rejectWithdrawal: false,
      debitAmountSen: 0,
    };
  }

  const creditAmountSen = creditTransaction
    ? 0
    : Math.max(850, WITHDRAWAL_AMOUNT_SEN - earningsSen);
  const submitWithdrawal = !withdrawal;
  const rejectWithdrawal = withdrawal?.status === "pending";
  const debitAmountSen = withdrawal?.status === "rejected" && creditTransaction && !debitTransaction
    ? creditTransaction.amount_sen
    : 0;

  return {
    complete: false,
    creditAmountSen,
    submitWithdrawal,
    rejectWithdrawal,
    debitAmountSen,
  };
}

function required(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function signIn(url, anonKey, email, expectedUserId) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const data = required(
    await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD }),
    `Demo sign-in failed for ${email}`,
  );
  if (data.user?.id !== expectedUserId) throw new Error(`Unexpected demo account for ${email}`);
  return client;
}

async function uploadPrivateFixture(client, path) {
  const result = await client.storage.from("kyc-documents").upload(path, DEMO_PNG, {
    contentType: "image/png",
    upsert: false,
  });
  if (result.error && !result.error.message.toLowerCase().includes("already exists")) {
    throw new Error(`Demo KYC fixture upload failed: ${result.error.message}`);
  }
}

async function ensureAliceKyc(service, aliceClient, adminClient, kycHmacKey) {
  const hashes = createDemoKycHashes(kycHmacKey);
  const user = required(
    await service.from("users").select("id,kyc_status").eq("id", ALICE_ID).single(),
    "Alice KYC lookup failed",
  );
  const submissions = required(
    await service.from("kyc_submissions")
      .select("id,status,ic_hash,ic_hash_version")
      .eq("user_id", ALICE_ID)
      .order("created_at", { ascending: false })
      .limit(20),
    "Alice KYC submission lookup failed",
  );
  const ocrResults = submissions.length === 0
    ? []
    : required(
        await service.from("kyc_ocr_results")
          .select("submission_id,status,document_number_hmac,provider_model")
          .in("submission_id", submissions.map((submission) => submission.id)),
        "Alice KYC OCR lookup failed",
      );
  const hasValidOcr = (submissionId) => ocrResults.some((ocr) =>
    ocr.submission_id === submissionId &&
    ocr.status === "matched" &&
    ocr.document_number_hmac === hashes.document &&
    ocr.provider_model === "deterministic-demo-fixture",
  );
  const matchingSubmission = submissions.find((candidate) =>
    candidate.ic_hash_version === "hmac_sha256_v1" && candidate.ic_hash === hashes.identity,
  ) ?? null;
  if (
    matchingSubmission?.status === "approved" &&
    user.kyc_status === "approved" &&
    hasValidOcr(matchingSubmission.id)
  ) return "existing";

  const activeSubmission = submissions.find((candidate) => ["draft", "pending"].includes(candidate.status)) ?? null;
  if (activeSubmission && activeSubmission.id !== matchingSubmission?.id) {
    throw new Error("alice_wallet_demo_incompatible_active_kyc");
  }

  let submission = matchingSubmission && ["draft", "pending"].includes(matchingSubmission.status)
    ? matchingSubmission
    : null;
  if (!submission) {
    const submissionId = required(await service.rpc("begin_kyc_submission", {
      p_user_id: ALICE_ID,
      p_ic_hash: hashes.identity,
      p_ic_hash_version: "hmac_sha256_v1",
      p_doc_type: "national_id",
      p_ocr_consent: true,
    }), "Alice KYC creation failed");
    submission = { id: submissionId, status: "draft" };
  }

  if (submission.status === "draft") {
    const prefix = `${ALICE_ID}/${submission.id}/${DEMO_DOCUMENT_TOKEN}`;
    const frontPath = `${prefix}/front.png`;
    const backPath = `${prefix}/back.png`;
    await uploadPrivateFixture(service, frontPath);
    await uploadPrivateFixture(service, backPath);
  }
  required(await service.rpc("record_kyc_ocr_result", {
    p_submission_id: submission.id,
    p_status: "matched",
    p_holder_name: "Customer Alice (Demo)",
    p_document_number_hmac: hashes.document,
    p_document_number_last4: "D005",
    p_expiry_date: "2035-12-31",
    p_confidence: 0.999,
    p_mismatch_fields: [],
    p_provider_model: "deterministic-demo-fixture",
  }), "Alice demo OCR recording failed");
  if (submission.status === "draft") {
    const prefix = `${ALICE_ID}/${submission.id}/${DEMO_DOCUMENT_TOKEN}`;
    const frontPath = `${prefix}/front.png`;
    const backPath = `${prefix}/back.png`;
    required(await aliceClient.rpc("finalize_kyc_submission", {
      p_submission_id: submission.id,
      p_front_path: frontPath,
      p_back_path: backPath,
    }), "Alice KYC finalization failed");
  }

  required(await adminClient.rpc("admin_review_kyc", {
    p_submission_id: submission.id,
    p_user_id: ALICE_ID,
    p_action: "approve",
    p_reason_code: null,
    p_reason_detail: null,
  }), "Alice KYC approval failed");
  return "approved";
}

async function readWalletState(service, destinationId) {
  const [walletResult, transactionResult, withdrawalResult] = await Promise.all([
    service.from("wallets").select("id,earnings_sen").eq("user_id", ALICE_ID).single(),
    service.from("wallet_transactions")
      .select("id,amount_sen,note")
      .eq("user_id", ALICE_ID)
      .in("note", [ADJUSTMENT_CREDIT_NOTE, ADJUSTMENT_DEBIT_NOTE]),
    service.from("withdrawal_requests")
      .select("id,status,destination_id")
      .eq("user_id", ALICE_ID)
      .order("created_at", { ascending: false }),
  ]);
  const wallet = required(walletResult, "Alice Wallet lookup failed");
  const transactions = required(transactionResult, "Alice adjustment lookup failed");
  const withdrawals = required(withdrawalResult, "Alice withdrawal lookup failed");
  const credits = transactions.filter((row) => row.note === ADJUSTMENT_CREDIT_NOTE);
  const debits = transactions.filter((row) => row.note === ADJUSTMENT_DEBIT_NOTE);
  if (credits.length > 1 || debits.length > 1) throw new Error("alice_wallet_demo_duplicate_adjustment_marker");
  const scenarioWithdrawals = withdrawals.filter((row) => row.destination_id === destinationId);
  if (scenarioWithdrawals.length > 1) throw new Error("alice_wallet_demo_duplicate_withdrawal");
  const unrelatedActiveWithdrawal = withdrawals.find(
    (row) => row.destination_id !== destinationId && ACTIVE_WITHDRAWAL_STATUSES.has(row.status),
  ) ?? null;
  return {
    wallet,
    creditTransaction: credits[0] ?? null,
    debitTransaction: debits[0] ?? null,
    withdrawal: scenarioWithdrawals[0] ?? null,
    unrelatedActiveWithdrawal,
  };
}

export async function seedAliceWalletDemo({ service, url, anonKey, kycHmacKey }) {
  const [aliceClient, adminClient] = await Promise.all([
    signIn(url, anonKey, ALICE_EMAIL, ALICE_ID),
    signIn(url, anonKey, ADMIN_EMAIL, ADMIN_ID),
  ]);
  const kyc = await ensureAliceKyc(service, aliceClient, adminClient, kycHmacKey);
  const destination = required(await service.rpc("save_verified_payout_destination", {
    p_user_id: ALICE_ID,
    p_dest_type: "ewallet",
    p_provider: "tng_direct_credit",
    p_provider_reference: DEMO_DESTINATION_REFERENCE,
    p_label: "Demo TNG eWallet",
    p_masked_ref: "**** 1234",
    p_is_default: true,
  }), "Alice demo payout destination failed");
  const destinationId = destination.id;

  let state = await readWalletState(service, destinationId);
  let actions = planAliceWalletActions({
    earningsSen: Number(state.wallet.earnings_sen),
    creditTransaction: state.creditTransaction,
    debitTransaction: state.debitTransaction,
    withdrawal: state.withdrawal,
    unrelatedActiveWithdrawal: state.unrelatedActiveWithdrawal,
  });
  if (actions.creditAmountSen > 0) {
    required(await adminClient.rpc("apply_wallet_adjustment", {
      p_user_id: ALICE_ID,
      p_bucket: "earnings",
      p_direction: "credit",
      p_amount_sen: actions.creditAmountSen,
      p_reason: ADJUSTMENT_CREDIT_NOTE,
    }), "Alice funding adjustment failed");
  }

  state = await readWalletState(service, destinationId);
  actions = planAliceWalletActions({
    earningsSen: Number(state.wallet.earnings_sen),
    creditTransaction: state.creditTransaction,
    debitTransaction: state.debitTransaction,
    withdrawal: state.withdrawal,
    unrelatedActiveWithdrawal: state.unrelatedActiveWithdrawal,
  });
  if (actions.submitWithdrawal) {
    if (Number(state.wallet.earnings_sen) < WITHDRAWAL_AMOUNT_SEN) {
      throw new Error("alice_wallet_demo_funding_no_longer_available");
    }
    required(await aliceClient.rpc("submit_wallet_withdrawal", {
      p_amount_sen: WITHDRAWAL_AMOUNT_SEN,
      p_destination_id: destinationId,
    }), "Alice withdrawal submission failed");
  }

  state = await readWalletState(service, destinationId);
  actions = planAliceWalletActions({
    earningsSen: Number(state.wallet.earnings_sen),
    creditTransaction: state.creditTransaction,
    debitTransaction: state.debitTransaction,
    withdrawal: state.withdrawal,
    unrelatedActiveWithdrawal: state.unrelatedActiveWithdrawal,
  });
  if (actions.rejectWithdrawal) {
    required(await adminClient.rpc("reject_wallet_withdrawal", {
      p_id: state.withdrawal.id,
      p_reason: WITHDRAWAL_REJECTION_NOTE,
      p_ip: null,
      p_reason_category: "customer_request",
    }), "Alice withdrawal rejection failed");
  }

  state = await readWalletState(service, destinationId);
  actions = planAliceWalletActions({
    earningsSen: Number(state.wallet.earnings_sen),
    creditTransaction: state.creditTransaction,
    debitTransaction: state.debitTransaction,
    withdrawal: state.withdrawal,
    unrelatedActiveWithdrawal: state.unrelatedActiveWithdrawal,
  });
  if (actions.debitAmountSen > 0) {
    required(await adminClient.rpc("apply_wallet_adjustment", {
      p_user_id: ALICE_ID,
      p_bucket: "earnings",
      p_direction: "debit",
      p_amount_sen: actions.debitAmountSen,
      p_reason: ADJUSTMENT_DEBIT_NOTE,
    }), "Alice compensating adjustment failed");
  }

  state = await readWalletState(service, destinationId);
  actions = planAliceWalletActions({
    earningsSen: Number(state.wallet.earnings_sen),
    creditTransaction: state.creditTransaction,
    debitTransaction: state.debitTransaction,
    withdrawal: state.withdrawal,
    unrelatedActiveWithdrawal: state.unrelatedActiveWithdrawal,
  });
  if (!actions.complete) throw new Error("alice_wallet_demo_incomplete");
  return {
    kyc,
    withdrawalStatus: state.withdrawal.status,
    adjustmentAmountSen: state.creditTransaction.amount_sen,
  };
}
