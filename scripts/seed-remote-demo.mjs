#!/usr/bin/env node
/**
 * Idempotent remote Supabase demo seed for the Malaysia Tourism vendor portal.
 *
 * This deliberately does not use the local Supabase CLI or a local database.
 * Run with: REMOTE_DEMO_SEED=1 npm run seed:remote-demo
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  for (const filename of ['.env.local', '.env']) {
    const filepath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(filepath)) continue;
    for (const line of fs.readFileSync(filepath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
      }
    }
    break;
  }
}

loadEnv();

if (process.env.REMOTE_DEMO_SEED !== '1') {
  console.error('Refusing to seed a remote database without REMOTE_DEMO_SEED=1.');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_USERS = [
  ['aaaaaaaa-0000-0000-0000-000000000001', 'admin@demo.local', 'Super Admin'],
  ['aaaaaaaa-0000-0000-0000-000000000002', 'approver@demo.local', 'Wallet Approver'],
  ['aaaaaaaa-0000-0000-0000-000000000003', 'vendor.owner@demo.local', 'Vendor Owner Ali'],
  ['aaaaaaaa-0000-0000-0000-000000000004', 'outlet.manager@demo.local', 'Outlet Manager Mei'],
  ['aaaaaaaa-0000-0000-0000-000000000005', 'customer1@demo.local', 'Customer Alice'],
  ['aaaaaaaa-0000-0000-0000-000000000006', 'customer2@demo.local', 'Customer Bob'],
  ['aaaaaaaa-0000-0000-0000-000000000007', 'customer3@demo.local', 'Customer Carol'],
  ['aaaaaaaa-0000-0000-0000-000000000008', 'customer4@demo.local', 'Customer Dave'],
];

const CUSTOMER_IDS = DEMO_USERS.slice(4).map(([id]) => id);
const OWNER_ID = DEMO_USERS[2][0];
const VENDOR_ID = 'bbbbbbbb-0000-0000-0000-000000000001';

const CATEGORIES = [
  ['11111111-0000-0000-0000-000000000001', 'Food & Dining', 'food', 'utensils'],
  ['11111111-0000-0000-0000-000000000002', 'Nature & Hiking', 'nature', 'tree-pine'],
  ['11111111-0000-0000-0000-000000000003', 'Cultural & Heritage', 'cultural', 'landmark'],
  ['11111111-0000-0000-0000-000000000004', 'Adventure Sports', 'adventure', 'mountain'],
  ['11111111-0000-0000-0000-000000000005', 'Wellness & Spa', 'wellness', 'heart'],
  ['11111111-0000-0000-0000-000000000006', 'Shopping', 'shopping', 'shopping-bag'],
  ['11111111-0000-0000-0000-000000000007', 'Family Friendly', 'family', 'baby'],
  ['11111111-0000-0000-0000-000000000008', 'Accommodation', 'accommodation', 'hotel'],
];

const OUTLETS = [
  ['rasa-bukit-bintang', 'Rasa Malaysia — Bukit Bintang', 'Kuala Lumpur', 'Kuala Lumpur', 3.1466, 101.7118],
  ['rasa-klcc', 'Rasa Malaysia — KLCC', 'Kuala Lumpur', 'Kuala Lumpur', 3.1578, 101.7123],
  ['rasa-georgetown', 'Rasa Malaysia — Georgetown', 'George Town', 'Penang', 5.4141, 100.3288],
  ['rasa-batu-ferringhi', 'Rasa Malaysia — Batu Ferringhi', 'Batu Ferringhi', 'Penang', 5.4675, 100.2461],
  ['rasa-jonker-walk', 'Rasa Malaysia — Jonker Walk', 'Melaka', 'Melaka', 2.1950, 102.2490],
  ['rasa-kota-kinabalu', 'Rasa Malaysia — Gaya Street', 'Kota Kinabalu', 'Sabah', 5.9804, 116.0735],
  ['rasa-kuching-waterfront', 'Rasa Malaysia — Kuching Waterfront', 'Kuching', 'Sarawak', 1.5574, 110.3440],
  ['rasa-ipoh-old-town', 'Rasa Malaysia — Ipoh Old Town', 'Ipoh', 'Perak', 4.5975, 101.0901],
  ['rasa-langkawi', 'Rasa Malaysia — Kuah', 'Kuah', 'Kedah', 6.3265, 99.8432],
  ['rasa-johor-bahru', 'Rasa Malaysia — City Square', 'Johor Bahru', 'Johor', 1.4927, 103.7414],
  ['rasa-kota-bharu', 'Rasa Malaysia — Siti Khadijah', 'Kota Bharu', 'Kelantan', 6.1254, 102.2381],
  ['rasa-kuala-terengganu', 'Rasa Malaysia — Pasar Payang', 'Kuala Terengganu', 'Terengganu', 5.3302, 103.1408],
  ['rasa-seremban', 'Rasa Malaysia — Seremban Gateway', 'Seremban', 'Negeri Sembilan', 2.7258, 101.9424],
];

const PHOTO_URLS = [
  'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=82',
  'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=82',
  'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=900&q=82',
  'https://images.unsplash.com/photo-1533777857889-4be7c70b33f7?auto=format&fit=crop&w=900&q=82',
  'https://images.unsplash.com/photo-1527004013197-933c4bb611b3?auto=format&fit=crop&w=900&q=82',
  'https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?auto=format&fit=crop&w=900&q=82',
  'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=900&q=82',
  'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=900&q=82',
];

const PRODUCT_SEEDS = [
  ['Nasi Lemak Pandan', 'food', 18, false, 0],
  ['Penang Assam Laksa', 'food', 15, false, 0],
  ['Chicken Rice Ball Set', 'food', 16, false, 0],
  ['Nyonya Kuih Tasting Box', 'food', 22, false, 0],
  ['Cendol Gula Melaka', 'food', 9, false, 0],
  ['Heritage Street Food Trail', 'activity', 68, true, 2],
  ['George Town Story Walk', 'experience', 55, true, 2],
  ['Mangrove Kayak Discovery', 'activity', 95, true, 3],
  ['Sunrise Island Hopping', 'activity', 140, true, 3],
  ['Rainforest Canopy Trek', 'experience', 120, true, 1],
  ['Batik Workshop & Tea', 'experience', 78, true, 2],
  ['Traditional Massage Escape', 'experience', 110, true, 4],
  ['Family Cultural Quest', 'activity', 48, true, 6],
  ['Local Artisan Gift Set', 'product', 45, false, 5],
  ['Malaysia Postcard Collection', 'product', 18, false, 5],
  ['Sunset Waterfront Picnic', 'experience', 85, true, 6],
];

function stableUuid(value) {
  const hex = crypto.createHash('md5').update(`malaysia-tourism-demo:${value}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function chunk(values, size = 200) {
  const output = [];
  for (let i = 0; i < values.length; i += size) output.push(values.slice(i, i + size));
  return output;
}

async function upsert(table, rows, onConflict = 'id') {
  for (const batch of chunk(rows)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function ensureAuthUsers() {
  for (const [id, email, fullName] of DEMO_USERS) {
    const { error } = await supabase.auth.admin.createUser({
      id,
      email,
      password: 'demo123456',
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error && !/already|duplicate|exists/i.test(error.message)) {
      throw new Error(`auth user ${email}: ${error.message}`);
    }
  }
  await upsert('users', DEMO_USERS.map(([id, email, fullName], index) => ({
    id,
    email,
    full_name: fullName,
    kyc_status: index < 4 ? 'approved' : index === 4 ? 'approved' : 'unverified',
    email_verified_at: new Date().toISOString(),
    profile_completed_at: index < 6 ? new Date().toISOString() : null,
  })));
}

async function ensureVendor() {
  const { data: existing, error: findError } = await supabase
    .from('vendors').select('id').eq('slug', 'rasa-malaysia').maybeSingle();
  if (findError) throw findError;
  const id = existing?.id || VENDOR_ID;
  await upsert('vendors', [{
    id,
    owner_id: OWNER_ID,
    name: 'Rasa Malaysia Kitchen',
    slug: 'rasa-malaysia',
    description: 'A Malaysia-wide collection of local flavours, heritage trails and small-group experiences.',
    business_type: 'food_and_tourism',
    status: 'approved',
    logo_url: PHOTO_URLS[0],
    cover_url: PHOTO_URLS[4],
    approved_by: DEMO_USERS[0][0],
    approved_at: new Date().toISOString(),
  }]);
  return id;
}

async function seedRoles(vendorId, outletIds) {
  // Ensure default roles exist first
  const defaultRoles = [
    { name: 'super_admin', description: 'Full platform administrative control' },
    { name: 'approver', description: 'Financial auditor responsible for dual-approving withdrawals' },
    { name: 'vendor_owner', description: 'Owner of a vendor company with full catalogue management' },
    { name: 'outlet_manager', description: 'Manager restricted to orders/bookings of a single outlet' },
    { name: 'customer', description: 'Traveller browsing and purchasing experiences' }
  ];
  const { error: roleInsertErr } = await supabase.from('roles').upsert(defaultRoles, { onConflict: 'name' });
  if (roleInsertErr) throw new Error(`Failed to ensure default roles: ${roleInsertErr.message}`);

  const { data: roles, error } = await supabase.from('roles').select('id,name').in('name', ['vendor_owner', 'outlet_manager']);
  if (error) throw error;
  const roleByName = Object.fromEntries((roles || []).map((role) => [role.name, role.id]));
  const assignments = [
    { user_id: OWNER_ID, role_id: roleByName.vendor_owner, vendor_id: vendorId, outlet_id: null },
    ...outletIds.map((outletId) => ({ user_id: DEMO_USERS[3][0], role_id: roleByName.outlet_manager, vendor_id: null, outlet_id: outletId })),
  ];
  for (const assignment of assignments) {
    const { data: found } = await supabase.from('user_roles').select('id').match(assignment).maybeSingle();
    if (!found) {
      const { error: insertError } = await supabase.from('user_roles').insert(assignment);
      if (insertError && !/duplicate|already exists/i.test(insertError.message)) throw insertError;
    }
  }
}

async function main() {
  console.log(`Seeding remote Supabase project ${url.replace(/https?:\/\//, '').split('.')[0]}…`);
  await ensureAuthUsers();
  // Sync categories: fetch what's already in the DB (schema seed may have inserted
  // them with different UUIDs). Remap CATEGORIES[i][0] to the actual DB IDs so that
  // product category_id references remain valid.
  const { data: existingCats, error: catFetchErr } = await supabase.from('categories').select('id,name');
  if (catFetchErr) throw new Error(`categories fetch: ${catFetchErr.message}`);
  const catNameToDbId = Object.fromEntries((existingCats || []).map((c) => [c.name, c.id]));
  // Insert only categories that are genuinely missing from the DB
  const missingCats = CATEGORIES.filter(([, name]) => !catNameToDbId[name]);
  if (missingCats.length > 0) {
    await upsert('categories', missingCats.map(([id, name, slug, icon], index) => ({ id, name, slug, icon, sort_order: index + 1, is_active: true })));
    missingCats.forEach(([id, name]) => { catNameToDbId[name] = id; });
  }
  // Remap in-place so CATEGORIES[n][0] always returns the real DB UUID
  CATEGORIES.forEach((cat) => { cat[0] = catNameToDbId[cat[1]] || cat[0]; });

  const vendorId = await ensureVendor();

  const existingOutlets = await supabase.from('outlets').select('id,slug').eq('vendor_id', vendorId);
  if (existingOutlets.error) throw existingOutlets.error;
  const outletBySlug = Object.fromEntries((existingOutlets.data || []).map((outlet) => [outlet.slug, outlet.id]));
  const outletRows = OUTLETS.map(([slug, name, city, state, lat, lng]) => ({
    id: outletBySlug[slug] || stableUuid(`outlet:${slug}`),
    vendor_id: vendorId,
    name,
    slug,
    address: `${name.replace('Rasa Malaysia — ', '')}, Malaysia`,
    city,
    state,
    country: 'Malaysia',
    lat,
    lng,
    phone: '+60 3-5555 0188',
    email: `hello+${slug}@rasamalaysia.demo`,
    operating_hours: { mon: { open: '09:00', close: '22:00' }, tue: { open: '09:00', close: '22:00' }, wed: { open: '09:00', close: '22:00' }, thu: { open: '09:00', close: '22:00' }, fri: { open: '09:00', close: '23:00' }, sat: { open: '09:00', close: '23:00' }, sun: { open: '09:00', close: '22:00' } },
    status: 'active',
  }));
  await upsert('outlets', outletRows);
  const outletIds = outletRows.map((outlet) => outlet.id);
  await seedRoles(vendorId, outletIds);

  await upsert('outlet_pages', outletRows.map((outlet, index) => ({
    id: stableUuid(`outlet-page:${outlet.id}`),
    outlet_id: outlet.id,
    hero_url: PHOTO_URLS[index % PHOTO_URLS.length],
    brand_colour: ['#0f766e', '#0e7490', '#b45309', '#be123c'][index % 4],
    seo_title: `${outlet.name} | Rasa Malaysia Kitchen`,
    seo_description: 'Discover Malaysian flavours and experiences with Rasa Malaysia Kitchen.',
  })), 'outlet_id');

  const productRows = [];
  for (let i = 0; i < 100; i += 1) {
    const seed = PRODUCT_SEEDS[i % PRODUCT_SEEDS.length];
    const outlet = outletRows[i % outletRows.length];
    const [baseName, productType, basePrice, requiresBooking, categoryIndex] = seed;
    const suffix = Math.floor(i / PRODUCT_SEEDS.length) + 1;
    productRows.push({
      id: stableUuid(`product:${i}`),
      vendor_id: vendorId,
      outlet_id: outlet.id,
      category_id: CATEGORIES[categoryIndex][0],
      name: suffix === 1 ? baseName : `${baseName} · ${outlet.city}`,
      slug: `demo-${String(i + 1).padStart(3, '0')}-${baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(0, 95),
      description: `A Malaysia tourism favourite at ${outlet.city}, prepared for visitors and local explorers.`,
      product_type: productType,
      requires_booking: requiresBooking,
      base_price: basePrice + ((i % 5) * 2),
      cover_url: PHOTO_URLS[i % PHOTO_URLS.length],
      tags: ['malaysia', outlet.state.toLowerCase().replaceAll(' ', '-'), productType],
      status: 'active',
    });
  }
  await upsert('products', productRows);

  const variantRows = productRows.flatMap((product, index) => [
    { id: stableUuid(`variant:${index}:standard`), product_id: product.id, name: 'Standard', sku: `DEMO-${String(index + 1).padStart(4, '0')}-STD`, price_offset: 0, is_default: true, is_active: true, sort_order: 0 },
    ...(product.requires_booking ? [{ id: stableUuid(`variant:${index}:child`), product_id: product.id, name: 'Child', sku: `DEMO-${String(index + 1).padStart(4, '0')}-CHD`, price_offset: -15, is_default: false, is_active: true, sort_order: 1 }] : []),
  ]);
  await upsert('product_variants', variantRows);
  await upsert('inventory', variantRows.filter((variant) => variant.name === 'Standard' && !productRows.find((p) => p.id === variant.product_id)?.requires_booking).map((variant, index) => ({
    id: stableUuid(`inventory:${variant.id}`), variant_id: variant.id, quantity: 180 + ((index * 37) % 420), reserved: 0,
  })), 'variant_id');

  const bookingProducts = productRows.filter((product) => product.requires_booking);
  const slotRows = [];
  for (let i = 0; i < 220; i += 1) {
    const product = bookingProducts[i % bookingProducts.length];
    const starts = new Date(Date.now() + ((i % 75) - 10) * 86400000 + (9 + (i % 6)) * 3600000);
    const capacity = 8 + (i % 3) * 4;
    const booked = i % 9 === 0 ? capacity : i % (capacity - 1);
    slotRows.push({
      id: stableUuid(`slot:${i}`), product_id: product.id, outlet_id: product.outlet_id,
      starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 2 * 3600000).toISOString(),
      capacity, booked, status: booked >= capacity ? 'full' : starts < new Date() ? 'expired' : 'available',
    });
  }
  await upsert('booking_slots', slotRows);

  const voucherRows = Array.from({ length: 100 }, (_, i) => ({
    id: stableUuid(`voucher:${i}`), vendor_id: vendorId, outlet_id: i % 4 === 0 ? null : outletRows[i % outletRows.length].id,
    code: `MYDEMO${String(i + 1).padStart(3, '0')}`, name: i % 2 ? 'Explorer RM10 Off' : 'Malaysia Welcome 15%',
    voucher_type: i % 2 ? 'fixed' : 'percent', discount_value: i % 2 ? 10 : 15,
    min_spend: i % 2 ? 50 : 30, max_uses: 100 + (i % 5) * 50, uses_count: Math.min(100 + (i % 5) * 50, i * 3),
    valid_from: new Date(Date.now() - 30 * 86400000).toISOString(), valid_until: new Date(Date.now() + (14 + (i % 90)) * 86400000).toISOString(), is_active: i % 17 !== 0,
  }));
  await upsert('vouchers', voucherRows);

  const random = seededRandom(20260711);
  const orders = [];
  const items = [];
  const bookings = [];
  const bookingCountBySlot = new Map(slotRows.map((slot) => [slot.id, slot.booked]));
  const reviewCandidates = [];
  for (let orderIndex = 0; orderIndex < 3000; orderIndex += 1) {
    const orderId = stableUuid(`order:${orderIndex}`);
    const ageDays = Math.floor(random() * 365);
    const createdAt = new Date(Date.now() - ageDays * 86400000 - Math.floor(random() * 86400000));
    const statusRoll = random();
    const status = statusRoll < 0.70 ? 'completed' : statusRoll < 0.90 ? 'paid' : statusRoll < 0.95 ? 'pending_payment' : statusRoll < 0.98 ? 'cancelled' : 'refunded';
    const itemCount = random() < 0.52 ? 2 : 1;
    let subtotal = 0;
    for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
      const product = productRows[(orderIndex * 7 + itemIndex * 13) % productRows.length];
      const variant = variantRows.find((candidate) => candidate.product_id === product.id && candidate.is_default);
      const slot = product.requires_booking ? slotRows.find((candidate) => candidate.product_id === product.id && new Date(candidate.starts_at) > createdAt) : null;
      const quantity = 1 + (orderIndex + itemIndex) % 3;
      const unitPrice = Number(product.base_price) + Number(variant?.price_offset || 0);
      const lineTotal = Number((unitPrice * quantity).toFixed(2));
      subtotal += lineTotal;
      const itemId = stableUuid(`order-item:${orderIndex}:${itemIndex}`);
      const fulfilStatus = ['cancelled', 'refunded'].includes(status) ? 'cancelled' : status === 'completed' ? 'fulfilled' : status === 'paid' ? (orderIndex % 3 === 0 ? 'ready' : 'pending') : 'pending';
      items.push({
        id: itemId, order_id: orderId, vendor_id: vendorId, outlet_id: product.outlet_id, product_id: product.id, variant_id: variant?.id || null, slot_id: slot?.id || null,
        product_name: product.name, variant_name: variant?.name || null, slot_starts_at: slot?.starts_at || null, unit_price: unitPrice, quantity, line_total: lineTotal,
        fulfil_status: fulfilStatus, fulfilled_at: fulfilStatus === 'fulfilled' ? new Date(createdAt.getTime() + 86400000).toISOString() : null, created_at: createdAt.toISOString(),
      });
      if (slot && ['paid', 'completed'].includes(status)) {
        bookings.push({ id: stableUuid(`booking:${itemId}`), order_item_id: itemId, slot_id: slot.id, customer_id: CUSTOMER_IDS[orderIndex % CUSTOMER_IDS.length], status: status === 'completed' ? (orderIndex % 5 === 0 ? 'checked_in' : 'confirmed') : 'confirmed', demo_qr_code: `DEMO-QR-${itemId.slice(0, 12)}`, check_in_at: status === 'completed' && orderIndex % 5 === 0 ? new Date(createdAt.getTime() + 86400000).toISOString() : null });
        bookingCountBySlot.set(slot.id, (bookingCountBySlot.get(slot.id) || 0) + quantity);
      }
      if (status === 'completed') reviewCandidates.push({ itemId, product, customerId: CUSTOMER_IDS[orderIndex % CUSTOMER_IDS.length], createdAt });
    }
    const discount = orderIndex % 5 === 0 ? Number((subtotal * 0.1).toFixed(2)) : 0;
    const total = Number((subtotal - discount).toFixed(2));
    orders.push({ id: orderId, user_id: CUSTOMER_IDS[orderIndex % CUSTOMER_IDS.length], status, subtotal, discount_amount: discount, total_amount: total, currency: 'MYR', payment_method: 'mock_card', voucher_code: orderIndex % 5 === 0 ? voucherRows[orderIndex % voucherRows.length].code : null, paid_at: ['paid', 'completed'].includes(status) ? new Date(createdAt.getTime() + 3600000).toISOString() : null, completed_at: status === 'completed' ? new Date(createdAt.getTime() + 86400000).toISOString() : null, cancelled_at: ['cancelled', 'refunded'].includes(status) ? new Date(createdAt.getTime() + 3600000).toISOString() : null, created_at: createdAt.toISOString(), updated_at: createdAt.toISOString() });
  }
  await upsert('orders', orders);
  await upsert('order_items', items);
  await upsert('bookings', bookings);
  await upsert('booking_slots', slotRows.map((slot) => ({ ...slot, booked: bookingCountBySlot.get(slot.id) || slot.booked, status: (bookingCountBySlot.get(slot.id) || slot.booked) >= slot.capacity ? 'full' : slot.status })));

  const reviews = reviewCandidates.slice(0, 2000).map((candidate, index) => ({
    id: stableUuid(`review:${candidate.itemId}`), user_id: candidate.customerId, order_item_id: candidate.itemId, vendor_id: vendorId,
    outlet_id: candidate.product.outlet_id, product_id: candidate.product.id, rating: 4 + (index % 2), title: index % 3 ? 'A lovely Malaysian experience' : 'Worth the visit',
    body: `Enjoyed ${candidate.product.name.toLowerCase()} and the warm local hospitality.`, is_visible: true, created_at: new Date(candidate.createdAt.getTime() + 3 * 86400000).toISOString(),
  }));
  await upsert('reviews', reviews, 'order_item_id');
  await upsert('media_assets', productRows.map((product, index) => ({ id: stableUuid(`media:${product.id}`), vendor_id: vendorId, outlet_id: product.outlet_id, product_id: product.id, url: product.cover_url, alt_text: `${product.name} in Malaysia`, media_type: 'image', sort_order: index % 4 })));

  const chatThreads = Array.from({ length: 24 }, (_, index) => {
    const customerId = CUSTOMER_IDS[index % CUSTOMER_IDS.length];
    const outletId = outletIds[index % outletIds.length];
    const createdAt = new Date(Date.now() - (index + 1) * 2 * 86400000);
    return { id: stableUuid(`chat-thread:${index}`), customer_id: customerId, outlet_id: outletId, status: index % 11 === 0 ? 'closed' : 'open', last_message_at: new Date(createdAt.getTime() + 3600000).toISOString(), created_at: createdAt.toISOString() };
  });
  await upsert('chat_threads', chatThreads);
  await upsert('chat_messages', chatThreads.flatMap((thread, index) => [
    { id: stableUuid(`chat-message:${index}:customer`), thread_id: thread.id, sender_id: thread.customer_id, body: `Hi, could you share more details about your Malaysia experience at ${outletRows[index % outletRows.length].city}?`, created_at: thread.created_at },
    { id: stableUuid(`chat-message:${index}:vendor`), thread_id: thread.id, sender_id: OWNER_ID, body: 'Thanks for reaching out — our local team will be happy to help with your trip.', created_at: thread.last_message_at },
  ]));

  console.log(JSON.stringify({ vendorId, outlets: outletRows.length, products: productRows.length, vouchers: voucherRows.length, orders: orders.length, orderItems: items.length, bookings: bookings.length, reviews: reviews.length, chatThreads: chatThreads.length }, null, 2));
  console.log('Remote demo seed completed. Demo password for seeded auth users: demo123456');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
