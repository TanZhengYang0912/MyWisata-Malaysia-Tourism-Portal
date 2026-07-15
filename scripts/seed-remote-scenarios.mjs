#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  for (const filename of [".env.local", ".env"]) {
    const filepath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(filepath)) continue;
    for (const line of fs.readFileSync(filepath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    break;
  }
}

loadEnv();

if (process.env.REMOTE_SCENARIO_SEED !== "1") {
  console.error("Refusing to seed remote scenarios without REMOTE_SCENARIO_SEED=1.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const PREFIX = "remote-demo-scenario";
const ADMIN_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const CUSTOMER_IDS = [
  "aaaaaaaa-0000-0000-0000-000000000005",
  "aaaaaaaa-0000-0000-0000-000000000006",
  "aaaaaaaa-0000-0000-0000-000000000007",
  "aaaaaaaa-0000-0000-0000-000000000008",
];
const TARGET_TABLES = [
  "user_preferences", "user_interactions", "recommendation_snapshots", "geocode_cache",
  "chat_report_bans", "vendor_recommendations", "recommendation_conversions",
  "recommendation_commissions", "affiliate_attributions", "refunds", "payout_destinations",
  "payout_transactions",
];
const CORE_TABLES = ["users", "products", "orders", "order_items", "payments", "reviews", "bookings"];

function stableUuid(value) {
  const hex = crypto.createHash("md5").update(`${PREFIX}:${value}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function chunk(values, size = 200) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

async function upsert(table, rows, onConflict = "id") {
  for (const batch of chunk(rows)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(`${table} (onConflict=${onConflict}): ${error.message}`);
  }
}

async function countRows(table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table} count: ${error.message}`);
  return count ?? 0;
}

async function requireRows(label, query, minimum = 1) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  if (!data || data.length < minimum) throw new Error(`${label}: expected at least ${minimum} row(s), found ${data?.length ?? 0}`);
  return data;
}

function isoDaysFromNow(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

async function main() {
  const before = Object.fromEntries(await Promise.all(TARGET_TABLES.map(async (table) => [table, await countRows(table)])));
  const coreBefore = Object.fromEntries(await Promise.all(CORE_TABLES.map(async (table) => [table, await countRows(table)])));

  const [users, categories, vendors, products, outlets, completedOrders, payments, orderItems, withdrawals, affiliateClicks] = await Promise.all([
    requireRows("demo users", supabase.from("users").select("id,email,full_name").in("id", [ADMIN_ID, ...CUSTOMER_IDS]), 5),
    requireRows("categories", supabase.from("categories").select("id,slug,name").order("sort_order"), 3),
    requireRows("approved vendors", supabase.from("vendors").select("id,name,slug,status").eq("status", "approved").order("slug"), 3),
    requireRows("active products", supabase.from("products").select("id,name,vendor_id,outlet_id,base_price"), 6),
    requireRows("outlets", supabase.from("outlets").select("id,name,address,city,state,lat,lng,vendor_id"), 3),
    requireRows("completed orders", supabase.from("orders").select("id,user_id,total_amount,created_at").eq("status", "completed").order("created_at", { ascending: false }), 3),
    requireRows("successful payments", supabase.from("payments").select("id,order_id,amount,status,created_at").in("status", ["succeeded", "paid"]).order("created_at", { ascending: false }), 2),
    requireRows("order items", supabase.from("order_items").select("id,order_id,vendor_id,product_id"), 3),
    requireRows("approved or pending withdrawals", supabase.from("withdrawal_requests").select("id,user_id,status,amount,wallet_id").in("status", ["approved", "pending"]).order("created_at", { ascending: false }), 2),
    requireRows("affiliate clicks", supabase.from("affiliate_clicks").select("id,link_id,clicker_id,target_id,created_at").order("created_at"), 2),
  ]);

  const userIds = new Set(users.map((user) => user.id));
  if (!CUSTOMER_IDS.every((id) => userIds.has(id)) || !userIds.has(ADMIN_ID)) throw new Error("Required demo users are missing");
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
  const productsByVendor = new Map();
  for (const product of products) {
    const rows = productsByVendor.get(product.vendor_id) ?? [];
    rows.push(product);
    productsByVendor.set(product.vendor_id, rows);
  }
  const completedOrderIds = new Set(completedOrders.map((order) => order.id));
  const completedOrderByVendor = new Map();
  for (const item of orderItems) {
    if (!completedOrderIds.has(item.order_id) || completedOrderByVendor.has(item.vendor_id)) continue;
    const order = completedOrders.find((candidate) => candidate.id === item.order_id);
    if (order) completedOrderByVendor.set(item.vendor_id, order);
  }
  const scenarioVendors = vendors.filter((vendor) => productsByVendor.has(vendor.id) && completedOrderByVendor.has(vendor.id)).slice(0, 3);
  if (scenarioVendors.length < 3) throw new Error("Need three approved vendors with completed orders for recommendation scenarios");

  const now = new Date();
  const preferences = [
    { user_id: CUSTOMER_IDS[0], interest_tags: ["food", "cultural", "nature"], travel_style: "couple", budget_range: "mid_range", group_composition: ["couple"], wheelchair_accessible: false, pet_friendly: false, preferred_radius_km: 25 },
    { user_id: CUSTOMER_IDS[1], interest_tags: ["adventure", "wellness"], travel_style: "solo", budget_range: "budget", group_composition: ["solo"], wheelchair_accessible: false, pet_friendly: false, preferred_radius_km: 15 },
    { user_id: CUSTOMER_IDS[2], interest_tags: ["family", "nature", "heritage"], travel_style: "family", budget_range: "mid_range", group_composition: ["adult", "child"], wheelchair_accessible: true, pet_friendly: false, preferred_radius_km: 40 },
    { user_id: CUSTOMER_IDS[3], interest_tags: ["shopping", "food", "cultural"], travel_style: "group", budget_range: "luxury", group_composition: ["adult"], wheelchair_accessible: false, pet_friendly: true, preferred_radius_km: 60 },
  ].map((row) => ({ ...row, id: stableUuid(`preference:${row.user_id}`), updated_at: now.toISOString() }));
  await upsert("user_preferences", preferences, "user_id");

  const interactionTargets = [
    ...products.slice(0, 12).map((product) => ({ type: "product", id: product.id })),
    ...outlets.slice(0, 6).map((outlet) => ({ type: "outlet", id: outlet.id })),
    ...scenarioVendors.map((vendor) => ({ type: "vendor", id: vendor.id })),
  ];
  const eventTypes = ["view", "save", "share", "book", "rate"];
  const interactions = Array.from({ length: 30 }, (_, index) => {
    const target = interactionTargets[index % interactionTargets.length];
    return {
      id: stableUuid(`interaction:${index}`), user_id: CUSTOMER_IDS[index % CUSTOMER_IDS.length], event_type: eventTypes[index % eventTypes.length],
      entity_type: target.type, entity_id: target.id, dwell_ms: target.type === "product" ? 12000 + (index % 5) * 3500 : null,
      created_at: new Date(Date.now() - (index + 1) * 3600000).toISOString(),
    };
  });
  await upsert("user_interactions", interactions);

  const snapshots = CUSTOMER_IDS.map((userId, index) => {
    const recommendations = products.slice(index, index + 5).map((product, rank) => ({ entity_id: product.id, score: Number((0.96 - rank * 0.08).toFixed(2)), reason_tags: [rank === 0 ? "top_match" : "interest_match", product.outlet_id ? "nearby" : "popular"] }));
    return { id: stableUuid(`snapshot:${userId}`), user_id: userId, model_version: "rule-v1-demo", results: recommendations, generated_at: new Date(Date.now() - index * 86400000).toISOString() };
  });
  await upsert("recommendation_snapshots", snapshots);

  const geocodeRows = outlets.filter((outlet) => outlet.address && outlet.lat !== null && outlet.lng !== null).map((outlet) => ({
    address: outlet.address, lat: outlet.lat, lng: outlet.lng, provider: "demo-manual",
  }));
  await upsert("geocode_cache", geocodeRows, "address");

  await upsert("chat_report_bans", [{
    id: stableUuid("chat-ban:customer4"), user_id: CUSTOMER_IDS[3], banned_until: isoDaysFromNow(7), reason: "Repeated promotional spam in a demo chat thread", banned_by: ADMIN_ID,
  }]);

  const recommendationRows = scenarioVendors.map((vendor, index) => {
    const product = productsByVendor.get(vendor.id)?.[0];
    const converted = index < 3;
    return {
      id: stableUuid(`recommendation:${vendor.id}`), recommender_id: CUSTOMER_IDS[index], vendor_name: vendor.name, vendor_address: `${product?.outlet_id ? outlets.find((outlet) => outlet.id === product.outlet_id)?.city ?? "Malaysia" : "Malaysia"}, Malaysia`,
      description: `A demo recommendation for ${vendor.name} based on a completed traveller journey.`, category_id: categoryBySlug.get(index === 0 ? "food" : index === 1 ? "cultural" : "nature")?.id ?? categories[0].id,
      status: converted ? "converted" : "approved", reviewer_id: ADMIN_ID, reviewed_at: now.toISOString(), converted_vendor_id: converted ? vendor.id : null,
      state: product?.outlet_id ? outlets.find((outlet) => outlet.id === product.outlet_id)?.state ?? null : null, created_at: new Date(Date.now() - (index + 4) * 86400000).toISOString(),
    };
  });
  recommendationRows.push({
    id: stableUuid("recommendation:pending"), recommender_id: CUSTOMER_IDS[3], vendor_name: "Langkawi Sunset Bites", vendor_address: "Kuah, Kedah, Malaysia", description: "A pending demo recommendation awaiting admin review.", category_id: categoryBySlug.get("food")?.id ?? categories[0].id,
    status: "pending", reviewer_id: null, reviewed_at: null, converted_vendor_id: null, state: "Kedah", created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  });
  await upsert("vendor_recommendations", recommendationRows);

  const convertedRecommendations = recommendationRows.filter((row) => row.status === "converted");
  const conversions = convertedRecommendations.map((recommendation, index) => {
    const order = completedOrderByVendor.get(recommendation.converted_vendor_id);
    const convertedAt = new Date(Date.now() - (index + 2) * 86400000);
    return {
      id: stableUuid(`conversion:${recommendation.converted_vendor_id}`), recommendation_id: recommendation.id, converted_vendor_id: recommendation.converted_vendor_id,
      first_sale_order_id: order.id, converted_at: convertedAt.toISOString(), attribution_ends_at: new Date(convertedAt.getTime() + 90 * 86400000).toISOString(), first_sale_awarded_at: index === 1 ? new Date(convertedAt.getTime() + 86400000).toISOString() : null,
    };
  });
  await upsert("recommendation_conversions", conversions);

  const commissions = conversions.map((conversion, index) => ({
    id: stableUuid(`commission:${conversion.id}`), recommender_id: CUSTOMER_IDS[index], conversion_id: conversion.id, commission_type: index === 0 ? "bonus" : "ongoing",
    amount: [12.5, 18, 9.75][index], order_id: index === 0 ? null : conversion.first_sale_order_id, created_at: new Date(Date.now() - (index + 1) * 86400000).toISOString(),
    status: ["pending", "confirmed", "reversed"][index], hold_until: index === 0 ? isoDaysFromNow(5) : null, wallet_txn_id: null, ledger_entry_id: null,
    commission_rate: index === 0 ? 0.05 : 0.03, confirmed_at: index === 1 ? isoDaysFromNow(-2) : null, reversed_at: index === 2 ? isoDaysFromNow(-1) : null,
  }));
  await upsert("recommendation_commissions", commissions);

  const existingAttributions = await requireRows("affiliate attributions query", supabase.from("affiliate_attributions").select("click_id,order_id,status"), 0);
  const usedClickIds = new Set(existingAttributions.map((row) => row.click_id));
  const usedOrderIds = new Set(existingAttributions.map((row) => row.order_id));
  const affiliateScenarioStatuses = new Set(existingAttributions.map((row) => row.status));
  const attributionRows = ["pending", "confirmed"].filter((status) => !affiliateScenarioStatuses.has(status)).map((status, index) => {
    const click = affiliateClicks.find((candidate) => !usedClickIds.has(candidate.id));
    const order = completedOrders.find((candidate) => !usedOrderIds.has(candidate.id));
    if (!click || !order) return null;
    usedClickIds.add(click.id); usedOrderIds.add(order.id);
    const commissionAmount = Number((Number(order.total_amount) * 0.03).toFixed(2));
    return {
      id: stableUuid(`affiliate-attribution:${status}`), click_id: click.id, order_id: order.id, commission_rate: 0.03, commission_amount: commissionAmount, status,
      created_at: new Date(Date.now() - (index + 1) * 86400000).toISOString(), cleared_at: status === "confirmed" ? isoDaysFromNow(-1) : null, reversed_at: null,
      hold_until: status === "pending" ? isoDaysFromNow(6) : null, confirmed_at: status === "confirmed" ? isoDaysFromNow(-1) : null,
    };
  }).filter(Boolean);
  await upsert("affiliate_attributions", attributionRows);

  const optional = process.env.SKIP_OPTIONAL_SCENARIOS !== "1";
  if (optional) {
    const completedOrderSet = new Set(completedOrders.map((order) => order.id));
    const refundPayments = payments.filter((payment) => completedOrderSet.has(payment.order_id)).slice(0, 2);
    if (refundPayments.length < 2) throw new Error("Need two successful payments for optional refund scenarios");
    await upsert("refunds", [
      { id: stableUuid("refund:pending"), payment_id: refundPayments[0].id, order_id: refundPayments[0].order_id, amount: Number(refundPayments[0].amount), reason: "Customer requested a demo itinerary change", status: "pending", processed_by: null, processed_at: null },
      { id: stableUuid("refund:processed"), payment_id: refundPayments[1].id, order_id: refundPayments[1].order_id, amount: Number((Number(refundPayments[1].amount) / 2).toFixed(2)), reason: "Partial service disruption in demo scenario", status: "processed", processed_by: ADMIN_ID, processed_at: isoDaysFromNow(-3) },
    ]);

    const destinations = [
      { id: stableUuid("payout-destination:alice-bank"), user_id: CUSTOMER_IDS[0], dest_type: "bank", label: "Maybank ****1234", masked_ref: "****1234", is_default: true },
      { id: stableUuid("payout-destination:bob-ewallet"), user_id: CUSTOMER_IDS[1], dest_type: "ewallet", label: "Touch 'n Go ****7788", masked_ref: "****7788", is_default: true },
      { id: stableUuid("payout-destination:carol-bank"), user_id: CUSTOMER_IDS[2], dest_type: "bank", label: "CIMB ****9012", masked_ref: "****9012", is_default: true },
    ];
    await upsert("payout_destinations", destinations);
    const payoutRequests = withdrawals.slice(0, 2);
    await upsert("payout_transactions", payoutRequests.map((request, index) => ({
      id: stableUuid(`payout-transaction:${request.id}`), request_id: request.id, gateway: "demo_gateway", gateway_ref: `DEMO-PAYOUT-${index + 1}`,
      status: "pending", created_at: new Date(Date.now() - (index + 1) * 86400000).toISOString(),
    })));
  }

  const after = Object.fromEntries(await Promise.all(TARGET_TABLES.map(async (table) => [table, await countRows(table)])));
  const coreAfter = Object.fromEntries(await Promise.all(CORE_TABLES.map(async (table) => [table, await countRows(table)])));
  for (const table of CORE_TABLES) {
    if (coreBefore[table] !== coreAfter[table]) throw new Error(`Core table changed unexpectedly: ${table} ${coreBefore[table]} -> ${coreAfter[table]}`);
  }
  console.log(JSON.stringify({ before, after, coreBefore, coreAfter, optional, scenarioVendors: scenarioVendors.map((vendor) => vendor.slug), rowsUpserted: { preferences: preferences.length, interactions: interactions.length, snapshots: snapshots.length, geocode: geocodeRows.length, recommendations: recommendationRows.length, conversions: conversions.length, commissions: commissions.length, affiliateAttributions: attributionRows.length }, }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
