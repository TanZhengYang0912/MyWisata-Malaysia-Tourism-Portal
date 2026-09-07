import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const seedSource = readFileSync(resolve(root, "scripts/seed-all-vendor-customer-demo.mjs"), "utf8");
const verifySource = readFileSync(resolve(root, "scripts/verify-all-vendor-customer-demo.mjs"), "utf8");
const aliceWalletSource = readFileSync(resolve(root, "scripts/lib/alice-wallet-demo.mjs"), "utf8");

describe("vendor customer demo scripts", () => {
  it("guards remote writes and loads the live catalogue before planning rows", () => {
    expect(packageJson.scripts["seed:vendor-customer-demo"]).toBe(
      "VENDOR_CUSTOMER_DEMO_SEED=1 node scripts/seed-all-vendor-customer-demo.mjs",
    );
    expect(seedSource).toContain("process.env.VENDOR_CUSTOMER_DEMO_SEED !== \"1\"");
    expect(seedSource).toContain("buildVendorCustomerDemoPlan");
    expect(seedSource).toContain("phone_verified_at");
    expect(seedSource).toContain("commerceCustomers");
    expect(seedSource).toContain("seedAliceWalletDemo");
    expect(seedSource).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(seedSource).toContain("KYC_IC_HMAC_KEY");
    expect(seedSource).not.toMatch(/from\(["']wallet_transactions["']\)\.(insert|upsert|update|delete)/);
    for (const table of ["vendors", "outlets", "products", "outlet_offers", "users", "chat_threads", "customer_wishlists"]) {
      expect(seedSource).toContain(`readAll("${table}"`);
    }
    expect(seedSource).toContain("existingWishlistIds");
    expect(seedSource).toContain("existingWishlistKeys");
  });

  it("upserts generated relationships in foreign-key order", () => {
    const orderedTables = [
      "vouchers",
      "orders",
      "booking_slots",
      "order_items",
      "payments",
      "refunds",
      "bookings",
      "reviews",
      "voucher_redemptions",
      "user_interactions",
      "customer_wishlists",
      "chat_threads",
      "chat_messages",
    ];
    let previous = -1;
    for (const table of orderedTables) {
      const position = seedSource.indexOf(`upsertRows("${table}"`);
      expect(position, `${table} upsert is missing`).toBeGreaterThan(previous);
      previous = position;
    }
  });

  it("uses the service client for private KYC evidence and Alice only to finalize", () => {
    expect(aliceWalletSource).toContain("uploadPrivateFixture(service, frontPath)");
    expect(aliceWalletSource).toContain("uploadPrivateFixture(service, backPath)");
    expect(aliceWalletSource).not.toContain("uploadPrivateFixture(aliceClient");
    expect(aliceWalletSource).toContain('aliceClient.rpc("finalize_kyc_submission"');
    expect(aliceWalletSource).toContain('service.from("kyc_ocr_results")');
    expect(aliceWalletSource).toContain('ocr.status === "matched"');
  });

  it("provides a read-only coverage and ownership verifier", () => {
    expect(packageJson.scripts["verify:vendor-customer-demo"]).toBe(
      "node scripts/verify-all-vendor-customer-demo.mjs",
    );
    expect(verifySource).toContain("uncoveredVendors");
    expect(verifySource).toContain("uncoveredOutlets");
    expect(verifySource).toContain("orderItemOwnershipMismatches");
    expect(verifySource).toContain("reviewOwnershipMismatches");
    expect(verifySource).toContain("chatThreadMismatches");
    expect(verifySource).toContain('readAll("users"');
    expect(verifySource).toContain('readAll("chat_messages"');
    expect(verifySource).toContain("CUSTOMER_IDS");
    expect(verifySource).toContain("aliceWalletHistory");
    expect(verifySource).toContain("walletReconciliationMismatches");
    expect(verifySource).toContain("DEMO_DESTINATION_REFERENCE");
    expect(verifySource).toContain("WITHDRAWAL_AMOUNT_SEN");
    expect(verifySource).toContain("wallet_transaction_id");
    expect(verifySource).toContain("actor_id");
    expect(verifySource).toContain('ocr.status === "matched"');
    for (const table of ["wallets", "wallet_transactions", "withdrawal_requests", "wallet_adjustments", "refunds", "payments", "payout_destinations"]) {
      expect(verifySource).toContain(`readAll("${table}"`);
    }
    expect(verifySource).toContain('user.status === "active"');
    expect(verifySource).not.toContain(".insert(");
    expect(verifySource).not.toContain(".upsert(");
    expect(verifySource).not.toContain(".update(");
    expect(verifySource).not.toContain(".delete(");
  });
});
