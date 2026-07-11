#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

for (const filename of ['.env.local', '.env']) {
  const filepath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filepath)) continue;
  for (const line of fs.readFileSync(filepath, 'utf8').split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  break;
}

const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const tables = ['vendors', 'outlets', 'products', 'vouchers', 'orders', 'order_items', 'bookings', 'reviews', 'chat_threads'];
const result = {};
for (const table of tables) {
  const { count, error } = await client.from(table).select('id', { count: 'exact', head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  result[table] = count;
}
const { data: vendor, error: vendorError } = await client.from('vendors').select('id,name,status').eq('slug', 'rasa-malaysia').single();
if (vendorError) throw vendorError;
const { data: sample, error: sampleError } = await client.from('orders').select('id,status,total_amount').eq('status', 'completed').order('created_at', { ascending: false }).limit(3);
if (sampleError) throw sampleError;
console.log(JSON.stringify({ vendor, counts: result, completedOrderSamples: sample }, null, 2));
