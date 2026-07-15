#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const filename of [".env.local", ".env"]) {
  const filepath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filepath)) continue;
  for (const line of fs.readFileSync(filepath, "utf8").split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  break;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !serviceKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY.");

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const PREFIX = "remote-demo-scenario";
const CUSTOMER_IDS = [
  "aaaaaaaa-0000-0000-0000-000000000005",
  "aaaaaaaa-0000-0000-0000-000000000006",
  "aaaaaaaa-0000-0000-0000-000000000007",
  "aaaaaaaa-0000-0000-0000-000000000008",
];

function stableUuid(value) {
  const hex = crypto.createHash("md5").update(`${PREFIX}:${value}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

async function countRows(table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function getRows(table, columns = "*") {
  const { data, error } = await supabase.from(table).select(columns);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

function assert(condition, message) {
  if (!condition) throw new Error(`Verification failed: ${message}`);
}

async function main() {
  const counts = {};
  for (const table of ["user_preferences", "user_interactions", "recommendation_snapshots", "geocode_cache", "chat_report_bans", "vendor_recommendations", "recommendation_conversions", "recommendation_commissions", "affiliate_attributions", "refunds", "payout_destinations", "payout_transactions"]) counts[table] = await countRows(table);

  const preferences = await getRows("user_preferences", "id,user_id");
  assert(CUSTOMER_IDS.every((id) => preferences.some((row) => row.user_id === id)), "all demo customers have preferences");
  const interactionIds = new Set(Array.from({ length: 30 }, (_, index) => stableUuid(`interaction:${index}`)));
  const interactions = await getRows("user_interactions", "id");
  assert(interactions.filter((row) => interactionIds.has(row.id)).length === 30, "all deterministic interaction rows exist");

  const snapshots = await getRows("recommendation_snapshots", "id,user_id,results");
  for (const userId of CUSTOMER_IDS) {
    const snapshot = snapshots.find((row) => row.id === stableUuid(`snapshot:${userId}`));
    assert(snapshot && Array.isArray(snapshot.results) && snapshot.results.length >= 3, `snapshot exists for ${userId}`);
  }

  const geocodeRows = await getRows("geocode_cache", "address,lat,lng,provider");
  assert(geocodeRows.filter((row) => row.provider === "demo-manual").length >= 3, "demo geocode rows exist");
  const banRows = await getRows("chat_report_bans", "id,user_id,banned_until,banned_by");
  assert(banRows.some((row) => row.id === stableUuid("chat-ban:customer4") && row.banned_by), "moderation ban exists");

  const recommendations = await getRows("vendor_recommendations", "id,status,converted_vendor_id,description");
  const scenarioRecommendations = recommendations.filter((row) => row.description?.startsWith("A demo recommendation for "));
  assert(scenarioRecommendations.length >= 3 && recommendations.some((row) => row.id === stableUuid("recommendation:pending") && row.status === "pending"), "scenario recommendation rows exist");
  assert(scenarioRecommendations.filter((row) => row.status === "converted").length >= 3, "converted recommendation rows exist");

  const conversions = await getRows("recommendation_conversions", "id,recommendation_id,converted_vendor_id,first_sale_order_id");
  const commissions = await getRows("recommendation_commissions", "id,conversion_id,commission_type,amount,status,order_id");
  const scenarioRecommendationIds = new Set(scenarioRecommendations.filter((row) => row.status === "converted").map((row) => row.id));
  const scenarioConversions = conversions.filter((row) => scenarioRecommendationIds.has(row.recommendation_id));
  assert(scenarioConversions.length >= 3, "three recommendation conversions exist");
  assert(scenarioConversions.every((row) => row.first_sale_order_id && row.converted_vendor_id), "conversion foreign keys are populated");
  const scenarioCommissionIds = new Set(scenarioConversions.map((row) => stableUuid(`commission:${row.id}`)));
  const scenarioCommissions = commissions.filter((row) => scenarioCommissionIds.has(row.id));
  assert(scenarioCommissions.length >= 3, "three recommendation commissions exist");
  assert(scenarioCommissions.every((row) => Number(row.amount) > 0), "commission amounts are positive");
  assert(new Set(scenarioCommissions.map((row) => row.status)).size >= 3, "commission lifecycle statuses exist");

  const attributions = await getRows("affiliate_attributions", "id,status,click_id,order_id");
  assert(attributions.some((row) => row.status === "pending") && attributions.some((row) => row.status === "confirmed"), "active affiliate pending and confirmed scenarios exist");

  if (process.env.SKIP_OPTIONAL_SCENARIOS !== "1") {
    const refunds = await getRows("refunds", "id,status,payment_id,order_id");
    assert(refunds.some((row) => row.id === stableUuid("refund:pending") && row.status === "pending"), "pending refund exists");
    assert(refunds.some((row) => row.id === stableUuid("refund:processed") && row.status === "processed"), "processed refund exists");
    assert((await getRows("payout_destinations", "id,user_id,dest_type,masked_ref")).filter((row) => row.masked_ref?.startsWith("****")).length >= 3, "masked payout destinations exist");
    assert((await getRows("payout_transactions", "id,request_id,gateway,status")).filter((row) => row.gateway === "demo_gateway").length >= 2, "demo payout transactions exist");
  }

  const technicalCounts = {
    email_verifications: await countRows("email_verifications"),
    phone_verifications: await countRows("phone_verifications"),
    idempotency_keys: await countRows("idempotency_keys"),
  };
  assert(technicalCounts.email_verifications === 0, "email verification table remains flow-generated");
  assert(technicalCounts.phone_verifications === 0, "phone verification table remains flow-generated");
  assert(technicalCounts.idempotency_keys === 0, "idempotency table remains flow-generated");

  const coreCounts = {};
  for (const table of ["users", "products", "orders", "order_items", "payments", "reviews", "bookings"]) coreCounts[table] = await countRows(table);
  console.log(JSON.stringify({ counts, technicalCounts, coreCounts, verified: true }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
