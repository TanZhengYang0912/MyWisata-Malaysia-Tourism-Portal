#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const SCOPE_PATH = path.resolve(ROOT, "scripts/data/enabled-commerce-outlet-scope.json");

function loadEnv() {
  for (const filename of [".env.local", ".env"]) {
    const filepath = path.resolve(ROOT, filename);
    if (!fs.existsSync(filepath)) continue;
    for (const line of fs.readFileSync(filepath, "utf8").split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    break;
  }
}

async function readAll(supabase, table, select) {
  const rows = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from(table).select(select).range(start, start + 999);
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}

loadEnv();
if (process.env.VERIFIED_VENDOR_EARNING_REPAIR !== "1") {
  console.error("Refusing remote earning repairs without VERIFIED_VENDOR_EARNING_REPAIR=1.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !serviceKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or service role key.");

const scope = JSON.parse(fs.readFileSync(SCOPE_PATH, "utf8"));
const enabledOutletIds = new Set(scope.outlets.map((outlet) => outlet.id));
const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const [vendors, outlets, products, offers, orders, orderItems, wallets, transactions] = await Promise.all([
  readAll(supabase, "vendors", "id,owner_id,status"),
  readAll(supabase, "outlets", "id,vendor_id,status,review_status"),
  readAll(supabase, "products", "id,vendor_id,outlet_id,status,review_status"),
  readAll(supabase, "outlet_offers", "product_id,outlet_id,status"),
  readAll(supabase, "orders", "id,status"),
  readAll(supabase, "order_items", "id,order_id,vendor_id,outlet_id,product_id,line_total"),
  readAll(supabase, "wallets", "id,user_id,earnings_sen"),
  readAll(supabase, "wallet_transactions", "id,user_id,wallet_id,order_id,idempotency_key,type,bucket,direction,amount_sen"),
]);

const enabledOutlets = outlets.filter((outlet) => enabledOutletIds.has(outlet.id) && outlet.status === "active" && outlet.review_status === "approved");
const enabledVendorIds = new Set(enabledOutlets.map((outlet) => outlet.vendor_id));
const ownersByVendor = new Map(vendors.filter((vendor) => enabledVendorIds.has(vendor.id) && vendor.status === "approved").map((vendor) => [vendor.id, vendor.owner_id]));
const activeOutletIds = new Set(enabledOutlets.map((outlet) => outlet.id));
const activeProducts = new Map(products.filter((product) => product.status === "active" && product.review_status === "approved").map((product) => [product.id, product]));
const activeOfferKeys = new Set(offers.filter((offer) => offer.status === "active" && activeOutletIds.has(offer.outlet_id)).map((offer) => `${offer.product_id}:${offer.outlet_id}`));
const orderById = new Map(orders.map((order) => [order.id, order]));
const itemsByOrder = new Map();
for (const item of orderItems) {
  const list = itemsByOrder.get(item.order_id) ?? [];
  list.push(item);
  itemsByOrder.set(item.order_id, list);
}
const walletByUser = new Map(wallets.map((wallet) => [wallet.user_id, wallet]));
const ownerById = new Map([...ownersByVendor.entries()].map(([vendorId, ownerId]) => [ownerId, vendorId]));
const repairs = [];

for (const transaction of transactions) {
  const match = /^vendor-account-demo:earning:([0-9a-f-]{36}):([0-9a-f-]{36})$/i.exec(transaction.idempotency_key ?? "");
  if (!match || !ownerById.has(transaction.user_id) || match[1] !== ownerById.get(transaction.user_id)) continue;
  if (transaction.type !== "earnings" || transaction.bucket !== "earnings" || transaction.direction !== "credit") {
    throw new Error(`Refusing to repair non-earning transaction ${transaction.id}.`);
  }
  const vendorId = match[1];
  const qualifyingItems = (itemsByOrder.get(transaction.order_id) ?? []).filter((item) => {
    const product = activeProducts.get(item.product_id);
    return orderById.get(item.order_id)?.status && ["paid", "completed"].includes(orderById.get(item.order_id).status)
      && item.vendor_id === vendorId
      && activeOutletIds.has(item.outlet_id)
      && product?.vendor_id === vendorId
      && (product.outlet_id === item.outlet_id || activeOfferKeys.has(`${item.product_id}:${item.outlet_id}`))
      && Number(item.line_total) > 0;
  });
  const expectedAmountSen = Math.round(qualifyingItems.reduce((total, item) => total + Number(item.line_total), 0) * 100);
  if (expectedAmountSen <= 0) throw new Error(`Refusing to repair ${transaction.id}: no qualifying order items.`);
  if (Number(transaction.amount_sen) === expectedAmountSen) continue;

  const wallet = walletByUser.get(transaction.user_id);
  if (!wallet || wallet.id !== transaction.wallet_id) throw new Error(`Refusing to repair ${transaction.id}: owner wallet mismatch.`);
  const { data: repaired, error: repairError } = await supabase.rpc("repair_demo_vendor_order_earning", { p_transaction_id: transaction.id });
  if (repairError) {
    if (repairError.message.includes("Could not find the function public.repair_demo_vendor_order_earning")) {
      throw new Error(
        "Remote repair RPC is not installed. Apply supabase/migrations/20260913120000_repair_demo_vendor_order_earnings.sql in Supabase SQL Editor, then rerun npm run repair:enabled-vendor-earnings.",
      );
    }
    throw new Error(`wallet transaction repair RPC failed: ${repairError.message}`);
  }
  repairs.push(repaired ?? { transactionId: transaction.id, vendorId, orderId: transaction.order_id, previousAmountSen: Number(transaction.amount_sen), amountSen: expectedAmountSen });
}

console.log(JSON.stringify({ message: "Enabled vendor demo earnings reconciled", repairs, repaired: repairs.length }, null, 2));
