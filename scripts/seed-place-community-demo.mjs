#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { buildPlaceCommunityDemoPlan } from "./lib/place-community-demo.mjs";

const CUSTOMER_IDS = [5, 6, 7, 8].map(
  (number) => `aaaaaaaa-0000-0000-0000-${String(number).padStart(12, "0")}`,
);

function loadEnv() {
  for (const filename of [".env.local", ".env"]) {
    const filepath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(filepath)) continue;
    for (const line of fs.readFileSync(filepath, "utf8").split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    break;
  }
}

loadEnv();

if (process.env.PLACE_COMMUNITY_DEMO_SEED !== "1") {
  console.error("Refusing remote writes without PLACE_COMMUNITY_DEMO_SEED=1.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY.");
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

async function upsertRows(rows) {
  for (let start = 0; start < rows.length; start += 200) {
    const { error } = await supabase
      .from("place_comments")
      .upsert(rows.slice(start, start + 200), { onConflict: "id" });
    if (error) throw new Error(`place_comments upsert failed: ${error.message}`);
  }
}

async function main() {
  const [places, users, existingComments] = await Promise.all([
    readAll("places", "id,level,name,state,district,status"),
    readAll("users", "id,email"),
    readAll("place_comments", "id,place_id,user_id,body,status,is_anonymous,created_at"),
  ]);
  const customers = CUSTOMER_IDS.map((id) => users.find((user) => user.id === id)).filter(Boolean);
  if (customers.length !== CUSTOMER_IDS.length) {
    const found = new Set(customers.map((customer) => customer.id));
    throw new Error(`Missing established demo customers: ${CUSTOMER_IDS.filter((id) => !found.has(id)).join(", ")}`);
  }

  const activePlaces = places.filter((place) => place.status === "active");
  const plan = buildPlaceCommunityDemoPlan({
    places: activePlaces,
    customers,
    existingComments,
    now: new Date(),
  });
  await upsertRows([...plan.updates, ...plan.inserts]);

  console.log(JSON.stringify({
    message: "Place community demo seed completed",
    coverage: {
      states: new Set(activePlaces.map((place) => place.state)).size,
      districts: new Set(activePlaces.map((place) => `${place.state}:${place.district ?? place.state}`)).size,
      places: activePlaces.length,
    },
    ...plan.stats,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  console.error("The seed uses stable IDs and only rewrites legacy Sample local tip rows.");
  process.exit(1);
});
