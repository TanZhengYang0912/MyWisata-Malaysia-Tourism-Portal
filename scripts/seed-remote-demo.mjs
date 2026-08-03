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
  ['aaaaaaaa-0000-0000-0000-000000000009', 'vendor.owner.siti@demo.local', 'Vendor Owner Siti'],
  ['aaaaaaaa-0000-0000-0000-000000000010', 'vendor.owner.raj@demo.local', 'Vendor Owner Raj'],
  ['aaaaaaaa-0000-0000-0000-000000000011', 'outlet.manager.nadia@demo.local', 'Outlet Manager Nadia'],
  ['aaaaaaaa-0000-0000-0000-000000000012', 'outlet.manager.farid@demo.local', 'Outlet Manager Farid'],
  ['aaaaaaaa-0000-0000-0000-000000000013', 'outlet.manager.lim@demo.local', 'Outlet Manager Lim'],
];

const CUSTOMER_IDS = DEMO_USERS.filter(([, email]) => email.startsWith('customer')).map(([id]) => id);
const OWNER_ID = DEMO_USERS[2][0];
const MANAGER_IDS = [DEMO_USERS[3][0], DEMO_USERS[10][0], DEMO_USERS[11][0], DEMO_USERS[12][0]];
const VENDOR_ID = 'bbbbbbbb-0000-0000-0000-000000000001';

// Phase 1 taxonomy: 4 top-level categories. `type_slugs` (the second level —
// cuisine/activity-kind/star-class/retail-kind) is set per product below, not
// on the category row. See lib/customer/category-details.ts for the full
// per-category type + attribute catalogue.
const CATEGORIES = [
  ['11111111-0000-0000-0000-000000000001', 'Food', 'food', 'utensils'],
  ['22222222-0000-0000-0000-000000000001', 'Activity', 'activity', 'compass'],
  ['11111111-0000-0000-0000-000000000008', 'Accommodation', 'accommodation', 'hotel'],
  ['22222222-0000-0000-0000-000000000002', 'Retail', 'retail', 'shopping-bag'],
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

// [baseName, productType, basePrice, requiresBooking, categoryIndex (into
// CATEGORIES: 0=food 1=activity 2=accommodation 3=retail), description,
// typeSlug (the category's second-level type, see category-details.ts),
// isFamilyFriendly]
const PRODUCT_SEEDS = [
  ['Nasi Lemak Pandan', 'food', 18, false, 0, "Fragrant pandan-infused coconut rice served the traditional way, with sambal, crispy anchovies, roasted peanuts, and a boiled egg. Malaysia's national breakfast, any time of day.", 'malay', false],
  ['Penang Assam Laksa', 'food', 15, false, 0, "Tangy, tamarind-based fish broth over thick rice noodles, topped with torch ginger flower, mint, and prawn paste — Penang's signature sour-and-spicy laksa.", 'malay', false],
  ['Chicken Rice Ball Set', 'food', 16, false, 0, "Hainanese-style chicken rice rolled into individual rice balls, a Malacca-born twist on the classic. Comes with tender poached chicken, house chilli sauce, and a bowl of clear soup on the side.", 'chinese', false],
  ['Nyonya Kuih Tasting Box', 'food', 22, false, 0, "A hand-picked box of Nyonya kuih — layered, steamed, and pan-fried bite-sized sweets rooted in Peranakan tradition. A good way to sample several flavours without committing to one.", 'nyonya', false],
  ['Cendol Gula Melaka', 'food', 9, false, 0, "Shaved ice, coconut milk, and rich gula melaka syrup poured over chewy green rice-flour jelly — Malaysia's favourite way to beat the heat. A short, sweet stop that's more about the experience than the wait.", 'malay', false],
  ['Heritage Street Food Trail', 'activity', 68, true, 1, "An evening food crawl through a handful of local stalls and shophouse eateries, sampling dishes shaped by Malaysia's multi-ethnic food heritage. Tastings included — just bring an appetite.", 'cultural', false],
  ['George Town Story Walk', 'experience', 55, true, 1, "A guided walking tour through heritage streets, clan jetties, and colonial-era shophouses, told through the eyes of a local storyteller. Best enjoyed in comfortable shoes and the cooler late-afternoon light.", 'cultural', false],
  ['Mangrove Kayak Discovery', 'activity', 95, true, 1, "Paddle through quiet mangrove channels with a certified guide, spotting local wildlife along the way. Easy-paced and beginner-friendly — life jackets and all equipment provided.", 'adventure', false],
  ['Sunrise Island Hopping', 'activity', 140, true, 1, "A half-day boat trip hopping between nearby islands for swimming, snorkelling, and beach time, departing early to catch the calmest waters and best light. Licensed operator, life jackets provided, suitable for most fitness levels.", 'adventure', false],
  ['Rainforest Canopy Trek', 'experience', 120, true, 1, "A guided rainforest trek along canopy walkways and forest trails, with a guide who knows the terrain well. Difficulty and distance vary by location — check this listing's details below for the specifics of this trail.", 'nature', false],
  ['Batik Workshop & Tea', 'experience', 78, true, 1, "Learn the wax-resist art of batik from a local artisan, then unwind with a cup of tea while your fabric dries. A hands-on introduction to a craft tradition passed down through Malay households for generations — no experience needed, and you take your finished piece home.", 'cultural', false],
  ['Traditional Massage Escape', 'experience', 110, true, 1, "A traditional Malay massage session in a private treatment room, starting with a welcome foot soak and finished with herbal tea. Unisex, appointment-based, 75 minutes of actual unwinding.", 'wellness', false],
  ['Family Cultural Quest', 'activity', 48, true, 1, "A guided scavenger-hunt-style walk built for families with kids, mixing local history with playful challenges along the way. Stroller-friendly, restrooms close by, and paced for short attention spans.", 'cultural', true],
  ['Local Artisan Gift Set', 'product', 45, false, 3, "A curated set of handicrafts and batik pieces from local artisans, certified by the Malaysia Handicraft Board. A souvenir with a story behind it, not just a stamped magnet.", 'handicrafts', false],
  ['Malaysia Postcard Collection', 'product', 18, false, 3, "A set of locally printed postcards featuring Malaysia's landmarks and landscapes — an easy, pack-light souvenir for sending home or keeping as a memento.", 'souvenirs', false],
  ['Malaysia Travel Audio Guide', 'digital', 24, false, 3, null, 'souvenirs', false],
  ['Sunset Waterfront Picnic', 'experience', 85, true, 1, "A relaxed picnic set up right on the waterfront, timed for sunset. Mats and shaded seating provided — just show up and enjoy the view.", 'nature', true],
];

// A canopy trek exists in exactly one forest. The `PRODUCT_SEEDS[i % length]`
// loop below used to clone each of these templates into six cities at once,
// which is how "Rainforest Canopy Trek" ended up listed in Seremban.
//
// These types are therefore NOT cloned. Only the loop indices named in
// PLACE_BOUND_ACTIVITIES are created, each renamed to the real activity that
// belongs at the outlet index `i % OUTLETS.length` resolves to. Product ids
// stay stableUuid(`product:${i}`), so re-running this against the live database
// updates the same rows migration 20260801010000 kept, rather than duplicating
// them.
const PLACE_BOUND_TYPES = new Set(['nature', 'cultural', 'adventure', 'wellness']);

// loop index → [name, slug, typeSlug, description]
const PLACE_BOUND_ACTIVITIES = {
  // Explore Outdoors Malaysia
  94: ['Penang National Park Monkey Beach Trek', 'penang-national-park-monkey-beach-trek', 'nature', 'Coastal jungle trek inside Penang National Park from Teluk Bahang to Monkey Beach, with a guided stop at the meromictic lake.'],
  8: ['Kilim Geoforest Mangrove Kayak', 'kilim-geoforest-mangrove-kayak', 'adventure', 'Paddle the limestone channels of the Kilim Karst Geoforest Park in Langkawi, past eagle roosts, bat caves and mangrove nurseries.'],
  26: ['Bukit Nanas Forest Reserve Walk', 'bukit-nanas-forest-reserve-walk', 'nature', 'Guided walk through the last patch of primary rainforest inside Kuala Lumpur, ending at the KL Tower canopy deck.'],
  // Warisan Cultural Journeys
  80: ['George Town Story Walk', 'george-town-story-walk-penang', 'cultural', "Shophouse-to-shophouse walk through George Town's UNESCO core, tracing clan jetties, street art and Peranakan trade history."],
  56: ['Jonker Walk Heritage Trail', 'jonker-walk-heritage-trail', 'cultural', 'Evening trail along Jonker Street and the Melaka River, covering Baba-Nyonya townhouses, Cheng Hoon Teng and the night market.'],
  40: ['Merdeka Square Heritage Walk', 'merdeka-square-heritage-walk', 'cultural', 'Colonial-era circuit around Dataran Merdeka, the Sultan Abdul Samad Building, Masjid Jamek and the Klang river confluence.'],
  10: ['Siti Khadijah Market & Wau Craft', 'siti-khadijah-market-wau-craft', 'cultural', "Morning at Kota Bharu's trader-run Siti Khadijah Market followed by a hands-on wau bulan kite-making session."],
  97: ['Sarawak Cultural Village Day', 'sarawak-cultural-village-day', 'cultural', 'Full day at the Sarawak Cultural Village below Mount Santubong — longhouses of seven ethnic groups, craft demos and a dance performance.'],
  // Serenity Wellness Retreats — a spa's product is the treatment, not the
  // building, so these three are also sold at each other's outlets (see the
  // outlet_offers rows further down). That is the one genuine multi-outlet
  // case in the demo catalogue.
  79: ['Traditional Massage Escape', 'traditional-massage-escape', 'wellness', 'A traditional Malay massage session in a private treatment room, starting with a welcome foot soak and finished with herbal tea.'],
  28: ['Aromatherapy Hot Stone Ritual', 'aromatherapy-hot-stone-ritual', 'wellness', 'Ninety minutes of warmed basalt stone work with a locally blended lemongrass and pandan oil, finished with a scalp massage.'],
  96: ['Herbal Steam & Body Scrub', 'herbal-steam-body-scrub', 'wellness', 'Traditional herbal steam followed by a turmeric and rice bran scrub, drawn from Malay postnatal spa practice.'],
};

// The three Serenity treatments above, in the order their per-outlet prices are
// listed: [loop index, [KL, George Town, Kota Kinabalu]].
const WELLNESS_OFFER_PRICES = [
  [79, [118, 112, 108]],
  [28, [145, 138, 132]],
  [96, [98, 92, 88]],
];
// Indices into OUTLETS for the three branches Serenity keeps.
const WELLNESS_OUTLET_INDICES = [1, 2, 5]; // Kuala Lumpur (KLCC), George Town, Kota Kinabalu

// Non-food PRODUCT_SEEDS entries (by typeSlug) get rehomed onto these themed
// vendors instead of Rasa Malaysia Kitchen — mirrors the live
// rehome_mis_vendored_products migration, so "Provided by" stays consistent
// between a fresh reseed and the live DB.
const THEMED_VENDORS = [
  { id: stableUuid('vendor:explore-outdoors'), slug: 'explore-outdoors-malaysia', name: 'Explore Outdoors Malaysia', description: 'Nature and adventure experiences across Malaysia.', businessType: 'tourism_experience', types: ['nature', 'adventure'] },
  { id: stableUuid('vendor:warisan-cultural'), slug: 'warisan-cultural-journeys', name: 'Warisan Cultural Journeys', description: 'Heritage walks and cultural workshops across Malaysia.', businessType: 'tourism_experience', types: ['cultural'] },
  { id: stableUuid('vendor:serenity-wellness'), slug: 'serenity-wellness-retreats', name: 'Serenity Wellness Retreats', description: 'Spa and wellness escapes across Malaysia.', businessType: 'wellness', types: ['wellness'] },
  { id: stableUuid('vendor:kraftangan-artisan'), slug: 'kraftangan-artisan-market', name: 'Kraftangan Artisan Market', description: 'Local handicrafts and souvenirs across Malaysia.', businessType: 'retail', types: ['handicrafts', 'souvenirs'] },
];
const TYPE_TO_THEMED_VENDOR = Object.fromEntries(THEMED_VENDORS.flatMap((v) => v.types.map((t) => [t, v])));

const EXTRA_VENDORS = [
  {
    id: stableUuid('vendor:batik-nusantara'), ownerId: DEMO_USERS[8][0], name: 'Batik Nusantara Studio', slug: 'batik-nusantara', description: 'Hands-on batik workshops and artisan gifts from the east coast.', city: 'Kuantan', state: 'Pahang',
    outlets: [['batik-kuantan', 'Batik Nusantara — Kuantan', 'Kuantan', 'Pahang', 3.8077, 103.3260], ['batik-kuala-terengganu', 'Batik Nusantara — Kuala Terengganu', 'Kuala Terengganu', 'Terengganu', 5.3302, 103.1408]],
  },
  {
    id: stableUuid('vendor:borneo-wild'), ownerId: DEMO_USERS[9][0], name: 'Borneo Wild Trails', slug: 'borneo-wild', description: 'Small-group rainforest, river and wildlife experiences hosted by local guides.', city: 'Kota Kinabalu', state: 'Sabah',
    outlets: [['borneo-kota-kinabalu', 'Borneo Wild — Kota Kinabalu', 'Kota Kinabalu', 'Sabah', 5.9804, 116.0735], ['borneo-sandakan', 'Borneo Wild — Sandakan', 'Sandakan', 'Sabah', 5.8402, 118.1179]],
  },
];

// Place-specific activities that only ever existed in the live database
// (plan finding F3): hand-authored rows that no seed or migration reproduced.
// Listed here with their live ids so a reseed updates those exact rows instead
// of creating parallel copies, and a fresh database gets the same catalogue.
//
// outlet slug → [[product id, name, typeSlug, basePrice, description], …]
const EXTRA_VENDOR_ACTIVITIES = {
  'batik-kuantan': [
    ['b60333b2-299a-4df2-8709-276c970ca4b5', 'Gunung Tapis Waterfall Hike', 'nature', 88, 'River-crossing hike to the hot springs and waterfalls of Gunung Tapis Park, inland from Kuantan.'],
  ],
  'batik-kuala-terengganu': [
    ['ca3a10b2-6c46-4c53-a342-0df6d3d1675f', 'Batik Story Workshop', 'cultural', 96, 'A guided batik-making session with a local artist and a take-home textile.'],
    ['5b9edc5c-0a24-4a68-966c-c52da4a30766', 'Setiu Wetlands Nature Walk', 'nature', 78, 'Boardwalk and boat walk through the Setiu river-mouth wetlands, one of the last brackish lagoon systems on the east coast.'],
  ],
  'borneo-kota-kinabalu': [
    ['0a3b3258-42b6-4ab4-a70d-b88339123e5f', 'River & Rainforest Discovery', 'adventure', 145, 'A small-group nature experience with local guides and conservation stories.'],
    ['843f1aa4-f142-4e4a-984b-cdb4d93dcc5f', 'Mount Kinabalu Foothill Trail', 'nature', 165, 'Day trek across the lower Kinabalu trails and the Poring foothills, without the summit permit.'],
  ],
  'borneo-sandakan': [
    // New: Sandakan had a clone of the Kota Kinabalu product, which put one
    // activity name in two cities. Sepilok actually is in Sandakan.
    [null, 'Sepilok Orangutan Rehabilitation Visit', 'nature', 120, 'Feeding-platform visit at the Sepilok Orangutan Rehabilitation Centre, with the adjoining sun bear conservation centre.'],
  ],
};

// Explore Outdoors activities that live only in the live database, same as
// above. [product id, outlet index into OUTLETS, name, typeSlug, price, description]
const EXPLORE_OUTDOORS_ACTIVITIES = [
  ['c4291ea4-b07b-4106-bba0-ac1505b6c74f', 6, 'Bako National Park Coastal Trail', 'nature', 135, 'Boat-in coastal trail through Bako National Park, past the sea stack at Telok Pandan Kecil and proboscis monkey territory.'],
  ['3c951980-7957-4e12-856b-ce40959e8900', 7, 'Kinta Valley Limestone Hike', 'nature', 98, 'Hike among the limestone karsts and cave temples of the Kinta Valley, with a stop at Gunung Lang.'],
];

// Verified destination coordinates for place-bound products — mirrors
// supabase/migrations/20260803000000_product_place_coordinates.sql exactly,
// so a fresh reseed reproduces the same backfill the live database got.
// Keyed by product id, not name, so a rename never silently drops the pin.
//
// "Batik Story Workshop" is deliberately absent: it's a workshop held inside
// the vendor's own shop, not a destination of its own (plan Δ3). It stays
// without a place coordinate and shows up in the dev map's "missing place"
// warning list instead of guessing.
const PLACE_COORDS = {
  [stableUuid('product:8')]:  { state: 'Kedah', district: 'Langkawi', lat: 6.4167, lng: 99.8556 },       // Kilim Geoforest Mangrove Kayak
  [stableUuid('product:94')]: { state: 'Penang', district: 'Barat Daya', lat: 5.4700, lng: 100.1900 },   // Penang National Park Monkey Beach Trek
  [stableUuid('product:80')]: { state: 'Penang', district: 'Timur Laut', lat: 5.4141, lng: 100.3288 },   // George Town Story Walk
  [stableUuid('product:56')]: { state: 'Melaka', district: 'Melaka Tengah', lat: 2.1953, lng: 102.2470 }, // Jonker Walk Heritage Trail
  [stableUuid('product:40')]: { state: 'Kuala Lumpur', district: null, lat: 3.1478, lng: 101.6935 },     // Merdeka Square Heritage Walk
  [stableUuid('product:10')]: { state: 'Kelantan', district: 'Kota Bharu', lat: 6.1256, lng: 102.2386 }, // Siti Khadijah Market & Wau Craft
  [stableUuid('product:97')]: { state: 'Sarawak', district: 'Kuching', lat: 1.7533, lng: 110.3197 },     // Sarawak Cultural Village Day
  'b60333b2-299a-4df2-8709-276c970ca4b5': { state: 'Pahang', district: 'Kuantan', lat: 3.8500, lng: 103.0500 },     // Gunung Tapis Waterfall Hike
  '5b9edc5c-0a24-4a68-966c-c52da4a30766': { state: 'Terengganu', district: 'Setiu', lat: 5.6667, lng: 102.7167 },   // Setiu Wetlands Nature Walk
  '0a3b3258-42b6-4ab4-a70d-b88339123e5f': { state: 'Sabah', district: 'Kinabatangan', lat: 5.5300, lng: 118.3200 }, // River & Rainforest Discovery
  '843f1aa4-f142-4e4a-984b-cdb4d93dcc5f': { state: 'Sabah', district: 'Ranau', lat: 6.0050, lng: 116.5583 },        // Mount Kinabalu Foothill Trail
  'c4291ea4-b07b-4106-bba0-ac1505b6c74f': { state: 'Sarawak', district: 'Kuching', lat: 1.7167, lng: 110.4667 },    // Bako National Park Coastal Trail
  '3c951980-7957-4e12-856b-ce40959e8900': { state: 'Perak', district: 'Kinta', lat: 4.6300, lng: 101.1400 },        // Kinta Valley Limestone Hike
};

function withPlace(row) {
  const place = PLACE_COORDS[row.id];
  return place
    ? { ...row, place_state: place.state, place_district: place.district ?? null, place_lat: place.lat, place_lng: place.lng }
    : row;
}

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
    if (error) throw new Error(`${table} (onConflict=${onConflict}): ${error.message}`);
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

async function seedRoles(vendorId, outletIds, ownerIds = [OWNER_ID], managerIds = MANAGER_IDS) {
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

  const { data: roles, error } = await supabase.from('roles').select('id,name').in('name', ['super_admin', 'approver', 'vendor_owner', 'outlet_manager']);
  if (error) throw error;
  const roleByName = Object.fromEntries((roles || []).map((role) => [role.name, role.id]));
  const assignments = [
    { user_id: DEMO_USERS[0][0], role_id: roleByName.super_admin, vendor_id: null, outlet_id: null },
    { user_id: DEMO_USERS[1][0], role_id: roleByName.approver, vendor_id: null, outlet_id: null },
    ...ownerIds.map((ownerId) => ({ user_id: ownerId, role_id: roleByName.vendor_owner, vendor_id: vendorId, outlet_id: null })),
    ...outletIds.slice(0, managerIds.length).map((outletId, index) => ({ user_id: managerIds[index], role_id: roleByName.outlet_manager, vendor_id: null, outlet_id: outletId })),
  ];
  for (const assignment of assignments) {
    let roleQuery = supabase.from('user_roles').select('id').eq('user_id', assignment.user_id).eq('role_id', assignment.role_id).limit(1);
    roleQuery = assignment.vendor_id ? roleQuery.eq('vendor_id', assignment.vendor_id) : roleQuery.is('vendor_id', null);
    roleQuery = assignment.outlet_id ? roleQuery.eq('outlet_id', assignment.outlet_id) : roleQuery.is('outlet_id', null);
    const { data: foundRows, error: roleLookupError } = await roleQuery;
    if (roleLookupError) throw new Error(`user_roles lookup: ${roleLookupError.message}`);
    const found = foundRows?.[0];
    if (!found) {
      const { error: insertError } = await supabase.from('user_roles').insert(assignment);
      if (insertError && !/duplicate|already exists/i.test(insertError.message)) throw insertError;
    }
  }
  for (const assignment of assignments.filter((item) => item.outlet_id)) {
    const { data: existingManager, error: managerLookupError } = await supabase.from('outlet_managers').select('id,user_id').eq('outlet_id', assignment.outlet_id).maybeSingle();
    if (managerLookupError) throw new Error(`outlet_managers lookup: ${managerLookupError.message}`);
    if (!existingManager) {
      const { error: managerInsertError } = await supabase.from('outlet_managers').insert({ user_id: assignment.user_id, outlet_id: assignment.outlet_id });
      if (managerInsertError && !/duplicate|already exists/i.test(managerInsertError.message)) throw new Error(`outlet_managers insert: ${managerInsertError.message}`);
    }
  }
}

async function seedAdditionalVendors(categories) {
  const activityCategoryId = categories.find(([, , slug]) => slug === 'activity')[0];
  const vendors = EXTRA_VENDORS.map((vendor) => ({
    id: vendor.id, owner_id: vendor.ownerId, name: vendor.name, slug: vendor.slug, description: vendor.description, business_type: 'tourism_experience', status: 'approved', logo_url: PHOTO_URLS[2], cover_url: PHOTO_URLS[6], approved_by: DEMO_USERS[0][0], approved_at: new Date().toISOString(),
  }));
  await upsert('vendors', vendors);
  const extraProducts = [];
  for (const [vendorIndex, vendor] of EXTRA_VENDORS.entries()) {
    const outletRows = vendor.outlets.map(([slug, name, city, state, lat, lng]) => ({
      id: stableUuid(`outlet:${slug}`), vendor_id: vendor.id, name, slug, address: `${name}, Malaysia`, city, state, country: 'Malaysia', lat, lng, phone: '+60 9-5555 0168', email: `hello+${slug}@demo.local`, operating_hours: { mon: { open: '09:00', close: '18:00' }, tue: { open: '09:00', close: '18:00' }, wed: { open: '09:00', close: '18:00' }, thu: { open: '09:00', close: '18:00' }, fri: { open: '09:00', close: '20:00' }, sat: { open: '09:00', close: '20:00' }, sun: { open: '10:00', close: '18:00' } }, status: 'active', review_status: 'approved',
    }));
    await upsert('outlets', outletRows);
    await seedRoles(vendor.id, outletRows.map((outlet) => outlet.id), [vendor.ownerId], []);
    // One real activity per outlet, from EXTRA_VENDOR_ACTIVITIES. Previously
    // this cloned a single name onto every outlet, which put "River &
    // Rainforest Discovery" in both Kota Kinabalu and Sandakan.
    const products = outletRows.flatMap((outlet, outletIndex) =>
      (EXTRA_VENDOR_ACTIVITIES[outlet.slug] ?? []).map(([id, name, typeSlug, basePrice, description], activityIndex) => withPlace({
        id: id ?? stableUuid(`product:${vendor.slug}:${outlet.slug}:${activityIndex}`),
        vendor_id: vendor.id, outlet_id: outlet.id, category_id: activityCategoryId,
        type_slugs: [typeSlug], name,
        slug: `demo-${vendor.slug}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(0, 95),
        description, product_type: typeSlug === 'cultural' ? 'experience' : 'activity',
        requires_booking: true, base_price: basePrice,
        cover_url: PHOTO_URLS[(vendorIndex + outletIndex + activityIndex + 3) % PHOTO_URLS.length],
        tags: ['malaysia', outlet.state.toLowerCase().replaceAll(' ', '-'), 'demo'],
        status: 'active', review_status: 'approved',
      })),
    );
    await upsert('products', products);
    const variants = products.map((product, index) => ({ id: stableUuid(`variant:${product.id}:adult`), product_id: product.id, name: 'Adult', sku: `EXTRA-${vendorIndex}-${index}-ADULT`, price_offset: 0, is_default: true, is_active: true, sort_order: 0 }));
    await upsert('product_variants', variants);
    await upsert('inventory', variants.map((variant, index) => ({ id: stableUuid(`inventory:${variant.id}`), variant_id: variant.id, quantity: 25 + index * 5, reserved: 0, low_stock_threshold: 5 })), 'variant_id');
    await upsert('outlet_pages', outletRows.map((outlet, index) => ({ id: stableUuid(`outlet-page:${outlet.id}`), outlet_id: outlet.id, hero_url: PHOTO_URLS[(index + vendorIndex + 2) % PHOTO_URLS.length], brand_colour: vendorIndex === 0 ? '#b45309' : '#0e7490', font_family: vendorIndex === 0 ? 'Fraunces' : 'Plus Jakarta Sans', featured_ids: products.filter((product) => product.outlet_id === outlet.id).slice(0, 1).map((product) => product.id), seo_title: `${outlet.name} | ${vendor.name}`, seo_description: vendor.description, blocks: [{ id: 'hero', type: 'hero', title: vendor.name, body: vendor.description, image: PHOTO_URLS[(index + 2) % PHOTO_URLS.length] }, { id: 'products', type: 'product_grid', title: 'Featured experiences', body: 'Book a local experience with this outlet.' }, { id: 'hours', type: 'hours', title: 'Plan your visit' }, { id: 'contact', type: 'contact', title: 'Find the outlet' }], gallery: [{ url: PHOTO_URLS[(index + 1) % PHOTO_URLS.length], alt: `${outlet.name} experience` }, { url: PHOTO_URLS[(index + 4) % PHOTO_URLS.length], alt: `${vendor.name} in Malaysia` }] })), 'outlet_id');
    extraProducts.push(...products);
  }
  return extraProducts;
}

async function seedAdditionalVendorCommerce() {
  const random = seededRandom(20260713);
  const extraOrders = [];
  const extraItems = [];
  const extraBookings = [];
  const extraPayments = [];
  const extraReviews = [];
  const extraRedemptions = [];
  const allSlots = [];
  const slotBooked = new Map();
  let summary = { orders: 0, bookings: 0, reviews: 0 };

  for (const [vendorIndex, vendorSeed] of EXTRA_VENDORS.entries()) {
    const vendorId = vendorSeed.id;
    const { data: outlets, error: outletError } = await supabase.from('outlets').select('id,name,city,state').eq('vendor_id', vendorId);
    if (outletError) throw outletError;
    const { data: products, error: productError } = await supabase.from('products').select('id,name,product_type,requires_booking,base_price,cover_url,outlet_id').eq('vendor_id', vendorId).order('name');
    if (productError) throw productError;
    const productRows = products || [];
    const productIds = productRows.map((product) => product.id);
    const { data: variants, error: variantError } = await supabase.from('product_variants').select('id,product_id,name,price_offset,is_default').in('product_id', productIds);
    if (variantError) throw variantError;
    const variantRows = variants || [];
    const slots = productRows.filter((product) => product.requires_booking).flatMap((product, productIndex) => Array.from({ length: 12 }, (_, slotIndex) => {
      const starts = new Date(Date.now() + ((slotIndex % 28) - 5) * 86400000 + (10 + (slotIndex % 5)) * 3600000);
      return {
        id: stableUuid('extra-slot:' + vendorSeed.slug + ':' + product.id + ':' + slotIndex),
        product_id: product.id,
        outlet_id: product.outlet_id,
        starts_at: starts.toISOString(),
        ends_at: new Date(starts.getTime() + 2 * 3600000).toISOString(),
        capacity: 10 + (productIndex % 2) * 5,
        booked: 0,
        status: starts < new Date() ? 'expired' : 'available',
      };
    }));
    allSlots.push(...slots);
    const outletId = outlets?.[0]?.id || null;
    const priceRules = [
      { id: stableUuid('extra-price-rule:' + vendorSeed.slug + ':peak'), product_id: productRows[0]?.id, rule_type: 'peak', label: 'Weekend peak', multiplier: 1.15, priority: 20, is_active: true },
      { id: stableUuid('extra-price-rule:' + vendorSeed.slug + ':group'), product_id: productRows[1]?.id, rule_type: 'group_size', label: 'Small group rate', multiplier: 0.9, min_quantity: 4, priority: 15, is_active: true },
    ].filter((rule) => rule.product_id);
    await upsert('price_rules', priceRules);
    const vouchers = [
      { id: stableUuid('extra-voucher:' + vendorSeed.slug + ':welcome'), vendor_id: vendorId, outlet_id: null, code: 'WELCOME-' + (vendorIndex + 1), name: 'Welcome traveller 10%', voucher_type: 'percent', discount_value: 10, min_spend: 50, max_uses: 100, uses_count: 18, valid_from: new Date(Date.now() - 30 * 86400000).toISOString(), valid_until: new Date(Date.now() + 60 * 86400000).toISOString(), is_active: true, review_status: 'approved' },
      { id: stableUuid('extra-voucher:' + vendorSeed.slug + ':group'), vendor_id: vendorId, outlet_id: outletId, code: 'GROUP-' + (vendorIndex + 1), name: 'Group booking RM20 off', voucher_type: 'fixed', discount_value: 20, min_spend: 120, max_uses: 60, uses_count: 9, valid_from: new Date(Date.now() - 14 * 86400000).toISOString(), valid_until: new Date(Date.now() + 45 * 86400000).toISOString(), is_active: true, review_status: 'approved' },
      { id: stableUuid('extra-voucher:' + vendorSeed.slug + ':bogo'), vendor_id: vendorId, outlet_id: outletId, code: 'BOGO-' + (vendorIndex + 1), name: 'Bring a friend BOGO', voucher_type: 'bogo', discount_value: 0, min_spend: 0, max_uses: 40, uses_count: 4, valid_from: new Date(Date.now() - 10 * 86400000).toISOString(), valid_until: new Date(Date.now() + 40 * 86400000).toISOString(), is_active: true, product_id: productRows[0]?.id || null, buy_quantity: 1, free_quantity: 1, review_status: 'approved' },
    ];
    await upsert('vouchers', vouchers);

    const bookingsBefore = extraBookings.length;
    for (let orderIndex = 0; orderIndex < 80; orderIndex += 1) {
      const ageDays = orderIndex < 15 ? orderIndex % 7 : orderIndex < 35 ? 7 + (orderIndex % 23) : 45 + Math.floor(random() * 300);
      const createdAt = new Date(Date.now() - ageDays * 86400000 - Math.floor(random() * 86400000));
      const status = orderIndex % 19 === 0 ? 'cancelled' : orderIndex % 13 === 0 ? 'pending_payment' : orderIndex % 5 === 0 ? 'paid' : 'completed';
      const product = productRows[orderIndex % productRows.length];
      const variant = variantRows.find((candidate) => candidate.product_id === product.id && candidate.is_default) || variantRows.find((candidate) => candidate.product_id === product.id);
      const slot = product.requires_booking ? slots.find((candidate) => candidate.product_id === product.id && new Date(candidate.starts_at) > createdAt) : null;
      const quantity = 1 + (orderIndex % 2);
      const unitPrice = Number(product.base_price) + Number(variant?.price_offset || 0);
      const subtotal = Number((unitPrice * quantity).toFixed(2));
      const voucher = orderIndex % 6 === 0 ? vouchers[orderIndex % vouchers.length] : null;
      const discount = voucher ? Number((voucher.voucher_type === 'percent' ? subtotal * 0.1 : Math.min(20, subtotal)).toFixed(2)) : 0;
      const total = Number((subtotal - discount).toFixed(2));
      const orderId = stableUuid('extra-order:' + vendorSeed.slug + ':' + orderIndex);
      const itemId = stableUuid('extra-order-item:' + vendorSeed.slug + ':' + orderIndex);
      const paymentMethod = ['mock_card', 'ewallet', 'bank_transfer', 'wallet'][orderIndex % 4];
      const fulfilStatus = ['cancelled', 'refunded'].includes(status) ? 'cancelled' : status === 'completed' ? 'fulfilled' : status === 'paid' ? 'ready' : 'pending';
      extraOrders.push({ id: orderId, user_id: CUSTOMER_IDS[(orderIndex + vendorIndex) % CUSTOMER_IDS.length], status, subtotal, discount_amount: discount, total_amount: total, currency: 'MYR', payment_method: paymentMethod, voucher_code: voucher?.code || null, paid_at: ['paid', 'completed'].includes(status) ? new Date(createdAt.getTime() + 3600000).toISOString() : null, completed_at: status === 'completed' ? new Date(createdAt.getTime() + 86400000).toISOString() : null, cancelled_at: status === 'cancelled' ? new Date(createdAt.getTime() + 3600000).toISOString() : null, created_at: createdAt.toISOString(), updated_at: createdAt.toISOString() });
      extraItems.push({ id: itemId, order_id: orderId, vendor_id: vendorId, outlet_id: product.outlet_id, product_id: product.id, variant_id: variant?.id || null, slot_id: slot?.id || null, product_name: product.name, variant_name: variant?.name || null, slot_starts_at: slot?.starts_at || null, unit_price: unitPrice, quantity, line_total: subtotal, image_url: product.cover_url, fulfil_status: fulfilStatus, fulfilled_at: fulfilStatus === 'fulfilled' ? new Date(createdAt.getTime() + 86400000).toISOString() : null, created_at: createdAt.toISOString() });
      extraPayments.push({ id: stableUuid('extra-payment:' + vendorSeed.slug + ':' + orderIndex), order_id: orderId, method: paymentMethod, amount: total, status: ['paid', 'completed'].includes(status) ? 'succeeded' : status === 'pending_payment' ? 'pending' : 'failed', gateway_ref: 'DEMO-' + paymentMethod + '-' + vendorIndex + '-' + orderIndex, processed_at: ['paid', 'completed'].includes(status) ? new Date(createdAt.getTime() + 3600000).toISOString() : null, created_at: createdAt.toISOString() });
      if (slot && ['paid', 'completed'].includes(status)) {
        slot.booked += quantity;
        slotBooked.set(slot.id, slot.booked);
        extraBookings.push({ id: stableUuid('extra-booking:' + vendorSeed.slug + ':' + orderIndex), order_item_id: itemId, slot_id: slot.id, customer_id: CUSTOMER_IDS[(orderIndex + vendorIndex) % CUSTOMER_IDS.length], status: status === 'completed' ? (orderIndex % 4 === 0 ? 'checked_in' : 'confirmed') : 'confirmed', demo_qr_code: 'DEMO-QR-' + itemId.slice(0, 12), check_in_at: status === 'completed' && orderIndex % 4 === 0 ? new Date(createdAt.getTime() + 86400000).toISOString() : null });
      }
      if (voucher && status === 'completed') extraRedemptions.push({ id: stableUuid('extra-redemption:' + vendorSeed.slug + ':' + orderIndex), voucher_id: voucher.id, order_id: orderId, user_id: CUSTOMER_IDS[(orderIndex + vendorIndex) % CUSTOMER_IDS.length], discount });
      if (status === 'completed' && orderIndex % 2 === 0) extraReviews.push({ id: stableUuid('extra-review:' + vendorSeed.slug + ':' + orderIndex), user_id: CUSTOMER_IDS[(orderIndex + vendorIndex) % CUSTOMER_IDS.length], order_item_id: itemId, vendor_id: vendorId, outlet_id: product.outlet_id, product_id: product.id, rating: orderIndex % 4 === 0 ? 5 : 4, title: orderIndex % 4 === 0 ? 'A memorable local experience' : 'Friendly guide and smooth booking', body: 'The experience was well organised and felt genuinely local.', is_visible: true, created_at: new Date(createdAt.getTime() + 3 * 86400000).toISOString() });
    }
    summary = { orders: summary.orders + 80, bookings: summary.bookings + extraBookings.length - bookingsBefore, reviews: summary.reviews + extraReviews.filter((review) => review.vendor_id === vendorId).length };
  }

  await upsert('booking_slots', allSlots.map((slot) => ({ ...slot, status: slot.booked >= slot.capacity ? 'full' : slot.status })));
  await upsert('orders', extraOrders);
  await upsert('order_items', extraItems);
  await upsert('bookings', extraBookings);
  await upsert('payments', extraPayments);
  await upsert('voucher_redemptions', extraRedemptions);
  await upsert('reviews', extraReviews, 'order_item_id');
  return { ...summary, payments: extraPayments.length, redemptions: extraRedemptions.length };
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

  await upsert('vendors', THEMED_VENDORS.map((tv) => ({
    id: tv.id, owner_id: DEMO_USERS[9][0], name: tv.name, slug: tv.slug, description: tv.description,
    business_type: tv.businessType, status: 'approved', approved_by: DEMO_USERS[0][0], approved_at: new Date().toISOString(),
  })));
  // One outlet per themed vendor per city, cloning the same OUTLETS coords as
  // Rasa's (same order/index) so a themed product lands at the same pin as
  // its Rasa-outlet counterpart would have.
  const themedOutletRows = {};
  for (const tv of THEMED_VENDORS) {
    const rows = OUTLETS.map(([slug, , city, state, lat, lng]) => ({
      id: stableUuid(`outlet:${tv.slug}:${slug}`),
      vendor_id: tv.id,
      name: `${tv.name} — ${city}`,
      slug: `${tv.slug}-${slug}`,
      address: `${city}, Malaysia`,
      city,
      state,
      country: 'Malaysia',
      lat,
      lng,
      phone: '+60 3-5555 0199',
      operating_hours: { mon: { open: '09:00', close: '18:00' }, tue: { open: '09:00', close: '18:00' }, wed: { open: '09:00', close: '18:00' }, thu: { open: '09:00', close: '18:00' }, fri: { open: '09:00', close: '18:00' }, sat: { open: '09:00', close: '18:00' }, sun: { open: '09:00', close: '18:00' } },
      status: 'active',
    }));
    await upsert('outlets', rows);
    themedOutletRows[tv.slug] = rows;
  }

  const productRows = [];
  // Loop index per kept product. Variant ids and SKUs are derived from this,
  // not from the array position, so skipping the clones does not renumber the
  // variants of the products that survive.
  const productSeedIndex = [];
  for (let i = 0; i < 100; i += 1) {
    const seed = PRODUCT_SEEDS[i % PRODUCT_SEEDS.length];
    const [baseName, productType, basePrice, requiresBooking, categoryIndex, baseDescription, typeSlug, isFamilyFriendly] = seed;
    const placeBound = PLACE_BOUND_ACTIVITIES[i];
    // A place-bound type is only created where it actually is. Every other
    // index of these types is a clone this seed used to scatter across cities.
    if (!placeBound && PLACE_BOUND_TYPES.has(typeSlug)) continue;
    const themedVendor = typeSlug ? TYPE_TO_THEMED_VENDOR[typeSlug] : undefined;
    const outlet = themedVendor ? themedOutletRows[themedVendor.slug][i % outletRows.length] : outletRows[i % outletRows.length];
    const name = placeBound ? placeBound[0] : baseName;
    productSeedIndex.push(i);
    productRows.push(withPlace({
      id: stableUuid(`product:${i}`),
      vendor_id: themedVendor ? themedVendor.id : vendorId,
      outlet_id: outlet.id,
      category_id: CATEGORIES[categoryIndex][0],
      name,
      slug: placeBound ? placeBound[1] : `demo-${String(i + 1).padStart(3, '0')}-${baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(0, 95),
      description: placeBound ? placeBound[3] : productType === 'digital' ? `A self-guided digital travel companion for ${outlet.city}. Demo download: https://example.com/mywisata/${baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf` : baseDescription,
      product_type: productType,
      requires_booking: requiresBooking,
      base_price: basePrice + ((i % 5) * 2),
      cover_url: PHOTO_URLS[i % PHOTO_URLS.length],
      tags: ['malaysia', outlet.state.toLowerCase().replaceAll(' ', '-'), productType],
      type_slugs: placeBound ? [placeBound[2]] : typeSlug ? [typeSlug] : [],
      is_family_friendly: !!isFamilyFriendly,
      status: 'active',
    }));
  }
  await upsert('products', productRows);

  // The one genuine multi-outlet case: each Serenity treatment is also sold at
  // the other two branches, at its own price. Until this existed, outlet_offers
  // was empty and the detail page's "Available at N outlets" picker could never
  // render (plan finding F4).
  const serenityOutlets = themedOutletRows['serenity-wellness-retreats'];
  await upsert('outlet_offers', WELLNESS_OFFER_PRICES.flatMap(([seedIndex, prices]) =>
    WELLNESS_OUTLET_INDICES.map((outletIndex, priceIndex) => ({
      id: stableUuid(`offer:${seedIndex}:${outletIndex}`),
      product_id: stableUuid(`product:${seedIndex}`),
      outlet_id: serenityOutlets[outletIndex].id,
      price: prices[priceIndex],
      status: 'active',
    })),
  ));

  // Two Explore Outdoors trails that only ever existed in the live database.
  const exploreOutdoors = THEMED_VENDORS.find((tv) => tv.slug === 'explore-outdoors-malaysia');
  const exploreOutlets = themedOutletRows[exploreOutdoors.slug];
  const exploreActivityRows = EXPLORE_OUTDOORS_ACTIVITIES.map(([id, outletIndex, name, typeSlug, basePrice, description]) => withPlace({
    id, vendor_id: exploreOutdoors.id, outlet_id: exploreOutlets[outletIndex].id,
    category_id: CATEGORIES[1][0], type_slugs: [typeSlug], name,
    slug: `demo-explore-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(0, 95),
    description, product_type: 'activity', requires_booking: true, base_price: basePrice,
    cover_url: PHOTO_URLS[outletIndex % PHOTO_URLS.length],
    tags: ['malaysia', exploreOutlets[outletIndex].state.toLowerCase().replaceAll(' ', '-'), 'activity'],
    status: 'active', review_status: 'approved',
  }));
  await upsert('products', exploreActivityRows);
  await upsert('product_variants', exploreActivityRows.map((product) => ({
    id: stableUuid(`variant:${product.id}:standard`), product_id: product.id, name: 'Standard',
    sku: `EXPLORE-${product.slug.slice(-8).toUpperCase()}`, price_offset: 0, is_default: true, is_active: true, sort_order: 0,
  })));

  // Themed outlets exist one-per-city for every themed vendor, but only a few
  // now hold a product. Deactivate the empty ones rather than leaving dead pins
  // on the map — never delete, orders reference outlet_id.
  const stockedOutletIds = new Set([
    ...productRows.map((product) => product.outlet_id),
    ...exploreActivityRows.map((product) => product.outlet_id),
    ...WELLNESS_OUTLET_INDICES.map((outletIndex) => serenityOutlets[outletIndex].id),
  ]);
  const emptyThemedOutletIds = Object.values(themedOutletRows)
    .flat()
    .map((outlet) => outlet.id)
    .filter((id) => !stockedOutletIds.has(id));
  if (emptyThemedOutletIds.length > 0) {
    await supabase.from('outlets').update({ status: 'inactive' }).in('id', emptyThemedOutletIds);
  }
  const extraProductRows = await seedAdditionalVendors(CATEGORIES);
  const extraCommerce = await seedAdditionalVendorCommerce();
  const allProductRows = [...productRows, ...extraProductRows];
  await upsert('outlet_pages', outletRows.map((outlet, index) => {
    const featured = productRows.find((product) => product.outlet_id === outlet.id);
    return {
      id: stableUuid(`outlet-page:${outlet.id}`), outlet_id: outlet.id, hero_url: PHOTO_URLS[index % PHOTO_URLS.length], brand_colour: ['#0f766e', '#0e7490', '#b45309', '#be123c'][index % 4], font_family: index % 4 === 2 ? 'Fraunces' : 'Plus Jakarta Sans', featured_ids: featured ? [featured.id] : [], seo_title: `${outlet.name} | Rasa Malaysia Kitchen`, seo_description: 'Discover Malaysian flavours and experiences with Rasa Malaysia Kitchen.', blocks: [{ id: 'intro', type: 'intro', title: 'A local day, made memorable', body: `Taste and explore ${outlet.city} with our local team.` }, { id: 'featured', type: 'product_grid', title: 'Featured from this outlet', body: 'Reserve a table, book an activity or shop a local favourite.' }, { id: 'gallery', type: 'gallery', title: 'A glimpse of the place' }, { id: 'hours', type: 'hours', title: 'Opening hours' }, { id: 'contact', type: 'contact', title: 'Find us' }, { id: 'cta', type: 'cta', title: 'Ready to explore?', body: 'Choose an experience and make your Malaysia day memorable.', cta: 'Browse featured experiences' }], gallery: [{ url: PHOTO_URLS[(index + 1) % PHOTO_URLS.length], alt: `${outlet.name} local experience` }, { url: PHOTO_URLS[(index + 3) % PHOTO_URLS.length], alt: `${outlet.city} Malaysia` }],
    };
  }), 'outlet_id');

  // Keyed on the loop index, not the array position — see productSeedIndex.
  const variantRows = productRows.flatMap((product, index) => {
    const seedIndex = productSeedIndex[index];
    return [
      { id: stableUuid(`variant:${seedIndex}:standard`), product_id: product.id, name: 'Standard', sku: `DEMO-${String(seedIndex + 1).padStart(4, '0')}-STD`, price_offset: 0, is_default: true, is_active: true, sort_order: 0 },
      ...(product.requires_booking ? [{ id: stableUuid(`variant:${seedIndex}:child`), product_id: product.id, name: 'Child', sku: `DEMO-${String(seedIndex + 1).padStart(4, '0')}-CHD`, price_offset: -15, is_default: false, is_active: true, sort_order: 1 }] : []),
    ];
  });
  await upsert('product_variants', variantRows);
  const inventoryRows = variantRows.filter((variant) => variant.name === 'Standard' && !productRows.find((p) => p.id === variant.product_id)?.requires_booking).map((variant, index) => ({
    id: stableUuid(`inventory:${variant.id}`), variant_id: variant.id, quantity: 180 + ((index * 37) % 420), reserved: 0, low_stock_threshold: 5,
  }));
  await upsert('inventory', inventoryRows, 'variant_id');
  const lowStockProduct = productRows.find((product) => product.product_type === 'food');
  const outOfStockProduct = productRows.find((product) => product.product_type === 'product');
  const lowStockVariants = variantRows.filter((variant) => [lowStockProduct?.id, outOfStockProduct?.id].includes(variant.product_id) && variant.name === 'Standard');
  await upsert('inventory', lowStockVariants.map((variant, index) => ({ id: stableUuid(`inventory:${variant.id}`), variant_id: variant.id, quantity: index === 0 ? 3 : 0, reserved: 0, low_stock_threshold: 5 })), 'variant_id');
  if (outOfStockProduct) await supabase.from('products').update({ status: 'inactive' }).eq('id', outOfStockProduct.id).eq('vendor_id', vendorId);

  // Positional picks: skipping the place-bound clones shortens productRows, so
  // wrap rather than index straight in — these only need *a* product to hang a
  // demo rule on, not a specific one.
  const pick = (n) => productRows[n % productRows.length];
  const priceRuleRows = [
    { id: stableUuid('price-rule:peak'), product_id: pick(5).id, rule_type: 'peak', label: 'School holiday peak', multiplier: 1.2, priority: 30, is_active: true },
    { id: stableUuid('price-rule:off-peak'), product_id: pick(6).id, rule_type: 'off_peak', label: 'Weekday off-peak', multiplier: 0.9, priority: 20, is_active: true },
    { id: stableUuid('price-rule:group'), product_id: pick(7).id, rule_type: 'group_size', label: 'Group of four', multiplier: 0.85, min_quantity: 4, priority: 25, is_active: true },
    { id: stableUuid('price-rule:tiered'), product_id: pick(8).id, rule_type: 'tiered', label: 'Family tier', fixed_amount: 118, min_quantity: 3, priority: 15, is_active: true },
    { id: stableUuid('price-rule:bundle'), product_id: pick(0).id, rule_type: 'bundle', label: 'Breakfast plus postcard bundle', fixed_amount: 30, bundle_product_ids: [pick(14).id, pick(15).id], priority: 40, is_active: true },
  ];
  await upsert('price_rules', priceRuleRows);

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

  const voucherRows = [...Array.from({ length: 100 }, (_, i) => ({
    id: stableUuid(`voucher:${i}`), vendor_id: vendorId, outlet_id: i % 4 === 0 ? null : outletRows[i % outletRows.length].id,
    code: `MYDEMO${String(i + 1).padStart(3, '0')}`, name: i % 2 ? 'Explorer RM10 Off' : 'Malaysia Welcome 15%',
    voucher_type: i % 2 ? 'fixed' : 'percent', discount_value: i % 2 ? 10 : 15,
    min_spend: i % 2 ? 50 : 30, max_uses: 100 + (i % 5) * 50, uses_count: Math.min(100 + (i % 5) * 50, i * 3),
    valid_from: new Date(Date.now() - 30 * 86400000).toISOString(), valid_until: new Date(Date.now() + (14 + (i % 90)) * 86400000).toISOString(), is_active: i % 17 !== 0, review_status: 'approved',
  })), ...Array.from({ length: 6 }, (_, i) => {
    const product = pick(10 + i);
    return { id: stableUuid(`voucher:bogo:${i}`), vendor_id: vendorId, outlet_id: product.outlet_id, code: `MYBOGO${String(i + 1).padStart(2, '0')}`, name: `Buy ${i % 2 ? 2 : 1} Get 1 ${product.name}`, voucher_type: 'bogo', discount_value: 0, min_spend: i % 2 ? 80 : 0, max_uses: 60, uses_count: 0, valid_from: new Date(Date.now() - 7 * 86400000).toISOString(), valid_until: new Date(Date.now() + 45 * 86400000).toISOString(), is_active: true, product_id: product.id, buy_quantity: i % 2 ? 2 : 1, free_quantity: 1, review_status: 'approved' };
  })];
  await upsert('vouchers', voucherRows);

  const random = seededRandom(20260711);
  const orders = [];
  const items = [];
  const bookings = [];
  const payments = [];
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
        image_url: product.cover_url,
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
    const paymentMethod = ['mock_card', 'ewallet', 'bank_transfer', 'wallet'][orderIndex % 4];
    orders.push({ id: orderId, user_id: CUSTOMER_IDS[orderIndex % CUSTOMER_IDS.length], status, subtotal, discount_amount: discount, total_amount: total, currency: 'MYR', payment_method: paymentMethod, voucher_code: orderIndex % 5 === 0 ? voucherRows[orderIndex % voucherRows.length].code : null, paid_at: ['paid', 'completed'].includes(status) ? new Date(createdAt.getTime() + 3600000).toISOString() : null, completed_at: status === 'completed' ? new Date(createdAt.getTime() + 86400000).toISOString() : null, cancelled_at: ['cancelled', 'refunded'].includes(status) ? new Date(createdAt.getTime() + 3600000).toISOString() : null, created_at: createdAt.toISOString(), updated_at: createdAt.toISOString() });
    payments.push({ id: stableUuid(`payment:${orderIndex}`), order_id: orderId, method: paymentMethod, amount: total, status: ['paid', 'completed'].includes(status) ? 'succeeded' : status === 'pending_payment' ? 'pending' : 'failed', gateway_ref: `DEMO-${paymentMethod}-${String(orderIndex).padStart(5, '0')}`, processed_at: ['paid', 'completed'].includes(status) ? new Date(createdAt.getTime() + 3600000).toISOString() : null, created_at: createdAt.toISOString() });
  }
  await upsert('orders', orders);
  await upsert('order_items', items);
  await upsert('bookings', bookings);
  await upsert('payments', payments);
  await upsert('booking_slots', slotRows.map((slot) => ({ ...slot, booked: bookingCountBySlot.get(slot.id) || slot.booked, status: (bookingCountBySlot.get(slot.id) || slot.booked) >= slot.capacity ? 'full' : slot.status })));

  const redemptionRows = orders.filter((order) => order.status === 'completed').slice(0, 120).map((order, index) => {
    const voucher = voucherRows[index % voucherRows.length];
    return { id: stableUuid(`voucher-redemption:${index}`), voucher_id: voucher.id, order_id: order.id, user_id: order.user_id, discount: order.discount_amount || 5 };
  });
  await upsert('voucher_redemptions', redemptionRows);

  const reviews = reviewCandidates.slice(0, 2000).map((candidate, index) => ({
    id: stableUuid(`review:${candidate.itemId}`), user_id: candidate.customerId, order_item_id: candidate.itemId, vendor_id: vendorId,
    outlet_id: candidate.product.outlet_id, product_id: candidate.product.id, rating: 4 + (index % 2), title: index % 3 ? 'A lovely Malaysian experience' : 'Worth the visit',
    body: `Enjoyed ${candidate.product.name.toLowerCase()} and the warm local hospitality.`, is_visible: true, created_at: new Date(candidate.createdAt.getTime() + 3 * 86400000).toISOString(),
  }));
  await upsert('reviews', reviews, 'order_item_id');
  await upsert('media_assets', allProductRows.map((product, index) => ({ id: stableUuid(`media:${product.id}`), vendor_id: product.vendor_id, outlet_id: product.outlet_id, product_id: product.id, url: product.cover_url, alt_text: `${product.name} in Malaysia`, media_type: 'image', sort_order: index % 4 })));

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

  console.log(JSON.stringify({ vendorId, outlets: outletRows.length, products: productRows.length, vouchers: voucherRows.length, orders: orders.length, orderItems: items.length, bookings: bookings.length, reviews: reviews.length, chatThreads: chatThreads.length, extraCommerce }, null, 2));
  console.log('Remote demo seed completed. Demo password for seeded auth users: demo123456');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
