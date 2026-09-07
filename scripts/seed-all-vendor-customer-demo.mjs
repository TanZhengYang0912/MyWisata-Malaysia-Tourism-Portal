#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { buildVendorCustomerDemoPlan } from "./lib/vendor-customer-demo.mjs";
import { seedAliceWalletDemo } from "./lib/alice-wallet-demo.mjs";

const CUSTOMER_IDS = [5, 6, 7, 8].map(
  (number) => `aaaaaaaa-0000-0000-0000-${String(number).padStart(12, "0")}`,
);

function loadEnv() {
  for (const filename of [".env.local", ".env"]) {
    const filepath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(filepath)) continue;
    for (const line of fs.readFileSync(filepath, "utf8").split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
      }
    }
    break;
  }
}

loadEnv();

if (process.env.VENDOR_CUSTOMER_DEMO_SEED !== "1") {
  console.error("Refusing remote writes without VENDOR_CUSTOMER_DEMO_SEED=1.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const kycHmacKey = process.env.KYC_IC_HMAC_KEY;
if (!url || !anonKey || !serviceKey || !kycHmacKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY, or KYC_IC_HMAC_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function readAll(table, select) {
  const rows = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from(table).select(select).range(start, start + 999);
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}

async function upsertRows(table, rows, onConflict = "id") {
  for (let start = 0; start < rows.length; start += 200) {
    const batch = rows.slice(start, start + 200);
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

async function main() {
  const [vendors, outlets, products, outletOffers, users, existingChatThreads, existingWishlists] = await Promise.all([
    readAll("vendors", "id,owner_id,name,slug,status"),
    readAll("outlets", "id,vendor_id,name,slug,status,review_status"),
    readAll("products", "id,vendor_id,outlet_id,name,requires_booking,base_price,status,review_status"),
    readAll("outlet_offers", "id,product_id,outlet_id,price,status"),
    readAll("users", "id,email,full_name,email_verified_at,phone_verified_at,status"),
    readAll("chat_threads", "id,customer_id,outlet_id,vendor_id"),
    readAll("customer_wishlists", "id,user_id,product_id"),
  ]);

  const customers = CUSTOMER_IDS.map((id) => users.find((user) => user.id === id)).filter(Boolean);
  if (customers.length !== CUSTOMER_IDS.length) {
    const foundIds = new Set(customers.map((customer) => customer.id));
    const missing = CUSTOMER_IDS.filter((id) => !foundIds.has(id));
    throw new Error(`Missing established demo customers: ${missing.join(", ")}`);
  }
  const commerceCustomers = customers.filter(
    (customer) =>
      customer.email_verified_at &&
      customer.phone_verified_at &&
      customer.status === "active",
  );
  if (commerceCustomers.length === 0) {
    throw new Error("None of the established demo customers is independently phone verified for commerce.");
  }

  const userIds = new Set(users.map((user) => user.id));
  const missingOwnerUsers = vendors
    .filter((vendor) => vendor.status === "approved" && (!vendor.owner_id || !userIds.has(vendor.owner_id)))
    .map((vendor) => ({ id: vendor.id, name: vendor.name, ownerId: vendor.owner_id }));
  if (missingOwnerUsers.length > 0) {
    throw new Error(`Approved vendors without a valid public owner: ${JSON.stringify(missingOwnerUsers)}`);
  }

  const plan = buildVendorCustomerDemoPlan({
    vendors,
    outlets,
    products,
    outletOffers,
    customers,
    commerceCustomers,
    existingChatThreads,
    now: new Date(),
  });

  if (plan.issues.length > 0) {
    console.error(JSON.stringify({ message: "Demo seed preflight failed", issues: plan.issues }, null, 2));
    process.exitCode = 1;
    return;
  }

  const { rows } = plan;
  const existingWishlistIds = new Set(existingWishlists.map((wishlist) => wishlist.id));
  const existingWishlistKeys = new Set(
    existingWishlists.map((wishlist) => `${wishlist.user_id}:${wishlist.product_id}`),
  );
  rows.wishlists = rows.wishlists.filter(
    (wishlist) =>
      !existingWishlistIds.has(wishlist.id) &&
      !existingWishlistKeys.has(`${wishlist.user_id}:${wishlist.product_id}`),
  );
  await upsertRows("vouchers", rows.vouchers);
  await upsertRows("orders", rows.orders);
  await upsertRows("booking_slots", rows.bookingSlots);
  await upsertRows("order_items", rows.orderItems);
  await upsertRows("payments", rows.payments);
  await upsertRows("refunds", rows.refunds);
  await upsertRows("bookings", rows.bookings);
  await upsertRows("reviews", rows.reviews, "order_item_id");
  await upsertRows("voucher_redemptions", rows.voucherRedemptions);
  await upsertRows("user_interactions", rows.interactions);
  await upsertRows("customer_wishlists", rows.wishlists, "user_id,product_id");
  await upsertRows("chat_threads", rows.chatThreads);
  await upsertRows("chat_messages", rows.chatMessages);
  const aliceWallet = await seedAliceWalletDemo({ service: supabase, url, anonKey, kycHmacKey });

  console.log(JSON.stringify({
    message: "Vendor/customer demo seed completed",
    catalogue: plan.stats,
    rows: Object.fromEntries(Object.entries(rows).map(([name, values]) => [name, values.length])),
    aliceWallet,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  console.error("The seed uses stable IDs and upserts. Fix the reported table error, then rerun the same command to complete any partial write safely.");
  process.exit(1);
});
