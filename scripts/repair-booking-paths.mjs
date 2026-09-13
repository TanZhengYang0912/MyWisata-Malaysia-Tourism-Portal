#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();

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

function stableUuid(value) {
  const hex = crypto.createHash("md5").update(`mywisata:booking-path-repair:${value}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
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

async function updateRows(supabase, table, rows) {
  for (let start = 0; start < rows.length; start += 20) {
    await Promise.all(rows.slice(start, start + 20).map(async (row) => {
      const { id, ...changes } = row;
      const { error } = await supabase.from(table).update(changes).eq("id", id);
      if (error) throw new Error(`${table} ${id} update failed: ${error.message}`);
    }));
  }
}

loadEnv();
if (process.env.BOOKING_PATH_REPAIR !== "1") {
  console.error("Refusing booking path repairs without BOOKING_PATH_REPAIR=1.");
  process.exit(1);
}
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !serviceKey) throw new Error("Missing Supabase environment.");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const [bookings, orderItems, slots, products, outlets] = await Promise.all([
  readAll(supabase, "bookings", "id,order_item_id,slot_id"),
  readAll(supabase, "order_items", "id,product_id,outlet_id,slot_id,slot_starts_at"),
  readAll(supabase, "booking_slots", "id,product_id,outlet_id,starts_at,ends_at,capacity,booked,status,created_at"),
  readAll(supabase, "products", "id,name"),
  readAll(supabase, "outlets", "id,name"),
]);
const itemById = new Map(orderItems.map((row) => [row.id, row]));
const slotByPair = new Map(slots.map((row) => [`${row.product_id}:${row.outlet_id}`, row]));
const productById = new Map(products.map((row) => [row.id, row]));
const outletById = new Map(outlets.map((row) => [row.id, row]));
const slotRows = [];
const itemUpdates = [];
const bookingUpdates = [];
for (const booking of bookings) {
  const item = itemById.get(booking.order_item_id);
  if (!item || item.slot_id) continue;
  const pair = `${item.product_id}:${item.outlet_id}`;
  let slot = slotByPair.get(pair);
  if (!slot) {
    const startsAt = new Date("2026-09-20T09:00:00+08:00");
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    slot = {
      id: stableUuid(pair),
      product_id: item.product_id,
      outlet_id: item.outlet_id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      capacity: 1000,
      booked: 0,
      status: "available",
      created_at: new Date("2025-09-13T00:00:00+08:00").toISOString(),
    };
    slotByPair.set(pair, slot);
    slotRows.push(slot);
  }
  itemUpdates.push({ id: item.id, slot_id: slot.id, slot_starts_at: slot.starts_at });
  bookingUpdates.push({ id: booking.id, slot_id: slot.id });
}
if (slotRows.length) {
  const { error } = await supabase.from("booking_slots").upsert(slotRows, { onConflict: "id" });
  if (error) throw new Error(`booking_slots upsert failed: ${error.message}`);
}
await updateRows(supabase, "order_items", itemUpdates);
await updateRows(supabase, "bookings", bookingUpdates);
console.log(JSON.stringify({
  message: "Booking paths repaired",
  repairedBookings: bookingUpdates.length,
  createdSlots: slotRows.length,
  productsResolved: new Set(slotRows.map((row) => row.product_id)).size,
  outletsResolved: new Set(slotRows.map((row) => row.outlet_id)).size,
  productNames: [...new Set(slotRows.map((row) => productById.get(row.product_id)?.name).filter(Boolean))].slice(0, 10),
  outletNames: [...new Set(slotRows.map((row) => outletById.get(row.outlet_id)?.name).filter(Boolean))].slice(0, 10),
}, null, 2));
