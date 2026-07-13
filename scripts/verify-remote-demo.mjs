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
const tables = ['users', 'vendors', 'outlets', 'outlet_pages', 'products', 'product_variants', 'inventory', 'price_rules', 'vouchers', 'voucher_redemptions', 'orders', 'order_items', 'bookings', 'payments', 'reviews', 'chat_threads'];
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
const additionalVendors = [];
for (const slug of ['batik-nusantara', 'borneo-wild']) {
  const { data: extraVendor, error: extraVendorError } = await client.from('vendors').select('id,name,status').eq('slug', slug).single();
  if (extraVendorError) throw extraVendorError;
  const { data: extraOutlets, error: extraOutletError } = await client.from('outlets').select('id').eq('vendor_id', extraVendor.id);
  if (extraOutletError) throw extraOutletError;
  const outletIds = (extraOutlets || []).map((outlet) => outlet.id);
  const { data: extraProducts, error: extraProductError } = await client.from('products').select('id').eq('vendor_id', extraVendor.id);
  if (extraProductError) throw extraProductError;
  const productIds = (extraProducts || []).map((product) => product.id);
  const { data: extraItems, error: extraItemError } = await client.from('order_items').select('id,order_id').in('outlet_id', outletIds);
  if (extraItemError) throw extraItemError;
  const orderIds = [...new Set((extraItems || []).map((item) => item.order_id))];
  const [{ count: orderCount }, { count: bookingCount }, { count: voucherCount }, { count: redemptionCount }, { count: priceRuleCount }] = await Promise.all([
    client.from('orders').select('id', { count: 'exact', head: true }).in('id', orderIds.length ? orderIds : ['none']),
    client.from('bookings').select('id', { count: 'exact', head: true }).in('order_item_id', (extraItems || []).map((item) => item.id)),
    client.from('vouchers').select('id', { count: 'exact', head: true }).eq('vendor_id', extraVendor.id),
    client.from('voucher_redemptions').select('id', { count: 'exact', head: true }).in('order_id', orderIds.length ? orderIds : ['none']),
    client.from('price_rules').select('id', { count: 'exact', head: true }).in('product_id', productIds.length ? productIds : ['none']),
  ]);
  additionalVendors.push({ vendor: extraVendor, outlets: outletIds.length, products: productIds.length, orders: orderCount || 0, bookings: bookingCount || 0, vouchers: voucherCount || 0, redemptions: redemptionCount || 0, priceRules: priceRuleCount || 0 });
}
const checks = {};
for (const [label, query] of [
  ['productTypes', client.from('products').select('product_type').in('product_type', ['product', 'digital', 'activity', 'experience', 'food']).limit(1000)],
  ['priceRuleTypes', client.from('price_rules').select('rule_type').limit(1000)],
  ['voucherTypes', client.from('vouchers').select('voucher_type').limit(1000)],
  ['paymentMethods', client.from('orders').select('payment_method').limit(1000)],
  ['shopPages', client.from('outlet_pages').select('outlet_id,blocks,gallery,featured_ids').limit(1000)],
  ['stockAlerts', client.from('inventory').select('variant_id,quantity,reserved,low_stock_threshold').limit(1000)],
]) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  checks[label] = [...new Set((data || []).map((row) => row.product_type || row.rule_type || row.voucher_type || row.payment_method || (row.blocks?.length ? 'blocks' : row.gallery?.length ? 'gallery' : row.featured_ids?.length ? 'featured' : row.quantity - row.reserved <= (row.low_stock_threshold ?? 5) ? 'alert' : 'normal')))].filter(Boolean);
}
console.log(JSON.stringify({ vendor, additionalVendors, counts: result, checks, completedOrderSamples: sample }, null, 2));
