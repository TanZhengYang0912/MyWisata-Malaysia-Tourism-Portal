#!/usr/bin/env node
/**
 * Restore the customer/vendor inbox demo rows after a catalogue reset.
 *
 * Run explicitly with:
 *   CHAT_DEMO_SEED=1 node scripts/restore-chat-demo.mjs
 *
 * The script discovers current active outlets, so it does not depend on the
 * old catalogue UUIDs used by scripts/seed-chat-demo.sql.
 */

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
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
      }
    }
    break;
  }
}

loadEnv();

if (process.env.CHAT_DEMO_SEED !== '1') {
  console.error("Refusing to seed chat demo data without CHAT_DEMO_SEED=1.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_CUSTOMERS = [
  ["customer1@demo.local", "Customer Alice"],
  ["customer2@demo.local", "Customer Bob"],
  ["customer3@demo.local", "Customer Carol"],
  ["customer4@demo.local", "Customer Dave"],
];

function stableUuid(value) {
  const hex = crypto.createHash("md5").update(`mywisata-chat-demo:${value}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

async function upsert(table, rows, options = {}) {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).upsert(rows, options);
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function chatThreadsSupportVendorId() {
  const { error } = await supabase.from("chat_threads").select("vendor_id").limit(1);
  if (!error) return true;
  if (/vendor_id.*schema cache|column .*vendor_id.*does not exist/i.test(error.message)) return false;
  throw error;
}

async function main() {
  const { data: users, error: userError } = await supabase
    .from("users")
    .select("id,email,full_name")
    .in("email", DEMO_CUSTOMERS.map(([email]) => email));
  if (userError) throw userError;

  const usersByEmail = new Map((users ?? []).map((user) => [user.email, user]));
  const missingUsers = DEMO_CUSTOMERS.filter(([email]) => !usersByEmail.has(email)).map(([email]) => email);
  if (missingUsers.length > 0) {
    throw new Error(`Missing seeded customer accounts: ${missingUsers.join(", ")}`);
  }

  const { data: outlets, error: outletError } = await supabase
    .from("outlets")
    .select("id,name,city,state,vendor_id")
    .eq("status", "active")
    .order("name")
    .limit(DEMO_CUSTOMERS.length);
  if (outletError) throw outletError;
  if (!outlets || outlets.length < DEMO_CUSTOMERS.length) {
    throw new Error(`Need ${DEMO_CUSTOMERS.length} active outlets to restore the chat demo, found ${outlets?.length ?? 0}.`);
  }

  const vendorIds = [...new Set(outlets.map((outlet) => outlet.vendor_id))];
  const { data: vendors, error: vendorError } = await supabase
    .from("vendors")
    .select("id,owner_id")
    .in("id", vendorIds);
  if (vendorError) throw vendorError;
  const ownersByVendor = new Map((vendors ?? []).map((vendor) => [vendor.id, vendor.owner_id]));
  if (outlets.some((outlet) => !ownersByVendor.has(outlet.vendor_id))) {
    throw new Error("An active outlet is missing its vendor owner; refusing to create an incomplete chat thread.");
  }
  const supportsVendorId = await chatThreadsSupportVendorId();

  const now = Date.now();
  const summary = [];
  for (const [index, [email, label]] of DEMO_CUSTOMERS.entries()) {
    const customer = usersByEmail.get(email);
    const outlet = outlets[index];
    const vendorOwnerId = ownersByVendor.get(outlet.vendor_id);
    const threadKey = `${customer.id}:${outlet.id}`;
    const createdAt = new Date(now - (index + 2) * 86400000).toISOString();
    const firstReplyAt = new Date(now - (index + 2) * 86400000 + 5 * 60000).toISOString();
    const threadId = stableUuid(`thread:${threadKey}`);

    const { data: existingThread, error: existingThreadError } = await supabase
      .from("chat_threads")
      .select("id")
      .eq("customer_id", customer.id)
      .eq("outlet_id", outlet.id)
      .maybeSingle();
    if (existingThreadError) throw existingThreadError;

    const actualThreadId = existingThread?.id ?? threadId;
    if (!existingThread) {
      const threadPayload = {
        id: threadId,
        customer_id: customer.id,
        outlet_id: outlet.id,
        status: "open",
        created_at: createdAt,
        last_message_at: firstReplyAt,
        ...(supportsVendorId ? { vendor_id: outlet.vendor_id } : {}),
      };
      const { error: insertError } = await supabase.from("chat_threads").insert(threadPayload);
      if (insertError) throw insertError;
    }

    await upsert("chat_messages", [
      {
        id: stableUuid(`message:${threadKey}:customer`),
        thread_id: actualThreadId,
        sender_id: customer.id,
        body: `Hi, could you share more details about your Malaysia experience at ${outlet.city}?`,
        created_at: createdAt,
      },
      {
        id: stableUuid(`message:${threadKey}:vendor`),
        thread_id: actualThreadId,
        sender_id: vendorOwnerId,
        body: "Thanks for reaching out — our local team will be happy to help with your trip.",
        created_at: firstReplyAt,
      },
    ], { onConflict: "id", ignoreDuplicates: true });

    const { error: updateError } = await supabase
      .from("chat_threads")
      .update({ last_message_at: firstReplyAt })
      .eq("id", actualThreadId);
    if (updateError) throw updateError;

    summary.push({ customer: label, outlet: outlet.name, threadId: actualThreadId });
  }

  console.log(JSON.stringify({ restored: summary.length, supportsVendorId, threads: summary }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
