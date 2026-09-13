#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "vendor-images";
const ENTITY_PREFIX = "entities/";
const GALLERY_COUNT = 3;
const PALETTES = [
  ["#010066", "#174c77", "#ffcc00"],
  ["#12372a", "#436850", "#adbc9f"],
  ["#551b14", "#9b3922", "#f6c453"],
  ["#172554", "#2563eb", "#bae6fd"],
  ["#3b0764", "#7e22ce", "#f0abfc"],
];

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

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "entity";
}

function seedFor(type, id, name, location, variant) {
  return crypto.createHash("sha256").update([type, id, name, location, variant].join("|"), "utf8").digest("hex");
}

function paletteFor(seed) {
  return PALETTES[Number.parseInt(seed.slice(0, 2), 16) % PALETTES.length];
}

function initials(name) {
  return name.trim().split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "MW";
}

function makeSvg({ type, id, name, location, variant, logo = false }) {
  const seed = seedFor(type, id, name, location, variant);
  const [primary, secondary, accent] = paletteFor(seed);
  const number = Number.parseInt(seed.slice(2, 8), 16);
  const rotation = number % 360;
  const offset = number % 180;
  const entityLabel = type === "vendor" ? "PARTNER IDENTITY" : "OUTLET IDENTITY";
  const mark = initials(name);
  const title = escapeXml(name.slice(0, 46));
  const place = escapeXml(location.slice(0, 46));
  const uniquePattern = logo
    ? `<circle cx="400" cy="400" r="280" fill="url(#gradient)"/><circle cx="400" cy="400" r="244" fill="none" stroke="${escapeXml(accent)}" stroke-width="14" stroke-dasharray="${80 + number % 80} 28" transform="rotate(${rotation} 400 400)"/><text x="400" y="455" text-anchor="middle" font-size="176" font-weight="900" fill="#fff" font-family="Arial, sans-serif">${escapeXml(mark)}</text>`
    : `<path d="M0 ${offset} C260 ${80 + number % 170} 500 ${260 + number % 160} 900 ${offset + 120} L900 900 L0 900Z" fill="${escapeXml(accent)}" opacity=".25"/><circle cx="${140 + number % 680}" cy="${130 + number % 480}" r="${46 + number % 110}" fill="none" stroke="${escapeXml(accent)}" stroke-width="18" opacity=".8"/><path d="M${80 + number % 160} 760 Q450 ${220 + number % 240} ${760 - number % 140} 760" fill="none" stroke="#fff" stroke-width="8" opacity=".3"/><rect x="52" y="52" width="796" height="796" rx="48" fill="none" stroke="#fff" stroke-width="3" opacity=".3"/>`;
  const text = logo
    ? `<text x="400" y="705" text-anchor="middle" font-size="30" font-weight="800" letter-spacing="5" fill="${escapeXml(primary)}" font-family="Arial, sans-serif">MYWISATA IDENTITY MARK</text>`
    : `<text x="72" y="112" font-size="22" font-weight="800" letter-spacing="5" fill="#fff" opacity=".82" font-family="Arial, sans-serif">MYWISATA · ${entityLabel}</text><text x="72" y="640" font-size="44" font-weight="900" fill="#fff" font-family="Arial, sans-serif">${title}</text><text x="72" y="695" font-size="24" font-weight="600" fill="#fff" opacity=".86" font-family="Arial, sans-serif">${place}</text><text x="72" y="786" font-size="18" font-weight="700" letter-spacing="3" fill="${escapeXml(accent)}" font-family="Arial, sans-serif">IDENTITY ARTWORK · ${variant}/3</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900" role="img" aria-labelledby="title desc"><title id="title">${title}</title><desc id="desc">MyWisata ${entityLabel.toLowerCase()} artwork for ${title} in ${place}</desc><defs><linearGradient id="gradient" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(${rotation})"><stop stop-color="${escapeXml(primary)}"/><stop offset=".58" stop-color="${escapeXml(secondary)}"/><stop offset="1" stop-color="${escapeXml(accent)}"/></linearGradient></defs><rect width="900" height="900" fill="url(#gradient)"/>${uniquePattern}${text}</svg>`;
}

function publicPath(supabase, objectPath) {
  return supabase.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
}

async function buildAssets(supabase, entity) {
  const location = [entity.city, entity.state].filter(Boolean).join(", ") || "Malaysia";
  const slug = slugify(entity.slug || entity.name);
  const base = `${ENTITY_PREFIX}${entity.type}/${slug}`;
  const logoPath = `${base}/logo.png`;
  const logoBody = await sharp(Buffer.from(makeSvg({ ...entity, location, variant: "logo", logo: true }))).png().toBuffer();
  const gallery = await Promise.all(Array.from({ length: GALLERY_COUNT }, async (_, index) => {
    const variant = index + 1;
    const objectPath = `${base}/gallery-${variant}.png`;
    const body = await sharp(Buffer.from(makeSvg({ ...entity, location, variant }))).png().toBuffer();
    return {
      objectPath,
      body,
      hash: crypto.createHash("sha256").update(body).digest("hex"),
      url: publicPath(supabase, objectPath),
      alt: `${entity.name} ${entity.type} view ${variant} · ${location}`,
      sortOrder: index,
    };
  }));
  return {
    slug,
    logoPath,
    logoBody,
    logoUrl: publicPath(supabase, logoPath),
    gallery,
    location,
  };
}

async function upload(supabase, objectPath, body) {
  const { error } = await supabase.storage.from(BUCKET).upload(objectPath, body, { contentType: "image/png", cacheControl: "31536000", upsert: true });
  if (error) throw new Error(`${objectPath}: ${error.message}`);
}

async function updateInBatches(items, handler, concurrency = 8) {
  for (let index = 0; index < items.length; index += concurrency) {
    const batch = items.slice(index, index + concurrency);
    await Promise.all(batch.map((item, offset) => handler(item, index + offset)));
    console.log(`Uploaded media for ${Math.min(index + batch.length, items.length)}/${items.length} entities.`);
  }
}

loadEnv();
if (process.env.VENDOR_OUTLET_MEDIA_REPAIR !== "1") {
  console.error("Refusing to write remote vendor/outlet media without VENDOR_OUTLET_MEDIA_REPAIR=1.");
  process.exit(1);
}
if (process.env.VENDOR_OUTLET_MEDIA_ARTWORK_DEMO !== "1") {
  console.error("Refusing to create non-photographic identity artwork. Use verified vendor/outlet photographs instead.");
  process.exit(1);
}
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY.");
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const [{ data: vendors, error: vendorError }, { data: outlets, error: outletError }] = await Promise.all([
  supabase.from("vendors").select("id,name,slug,business_type").eq("status", "approved").order("name"),
  supabase.from("outlets").select("id,vendor_id,name,slug,city,state").eq("status", "active").eq("review_status", "approved").order("name"),
]);
if (vendorError || outletError) throw vendorError || outletError;
const entities = [
  ...(outlets || []).map((entity) => ({ ...entity, type: "outlet" })),
];
const assets = await Promise.all(entities.map(async (entity) => ({ entity, ...(await buildAssets(supabase, entity)) })));
const galleryHashes = assets.flatMap((item) => item.gallery.map((media) => media.hash));
if (new Set(galleryHashes).size !== galleryHashes.length) throw new Error("Generated gallery content hash collision detected.");

const { data: generatedMedia, error: generatedMediaError } = await supabase.from("media_assets").select("id,url").like("url", `${ENTITY_PREFIX}%`);
if (generatedMediaError) throw generatedMediaError;
if (generatedMedia?.length) {
  const ids = generatedMedia.map((row) => row.id);
  const { error } = await supabase.from("media_assets").delete().in("id", ids);
  if (error) throw error;
}

await updateInBatches(assets, async ({ logoPath, logoBody, gallery }) => {
  await Promise.all([upload(supabase, logoPath, logoBody), ...gallery.map((media) => upload(supabase, media.objectPath, media.body))]);
});

const rows = assets.flatMap(({ entity, logoPath, gallery }) => [
  { vendor_id: entity.vendor_id, outlet_id: entity.id, product_id: null, url: logoPath, alt_text: `${entity.name} logo`, media_type: "image", sort_order: -1 },
  ...gallery.map((media) => ({ vendor_id: entity.vendor_id, outlet_id: entity.id, product_id: null, url: media.objectPath, alt_text: media.alt, media_type: "image", sort_order: media.sortOrder, contentHash: media.hash })),
]);
for (let index = 0; index < rows.length; index += 200) {
  const batch = rows.slice(index, index + 200);
  const withHashRows = batch.map(({ contentHash, ...row }) => ({ ...row, content_hash: contentHash ?? null }));
  const { error: withHashError } = await supabase.from("media_assets").insert(withHashRows);
  if (!withHashError) continue;
  const { error } = await supabase.from("media_assets").insert(batch.map((row) => { const clone = { ...row }; delete clone.contentHash; return clone; }));
  if (error) throw error;
}

console.log(JSON.stringify({ vendors: vendors?.length || 0, outlets: outlets?.length || 0, gallery_assets: galleryHashes.length, logo_assets: assets.length, storage_prefix: ENTITY_PREFIX, gallery_slides_per_entity: GALLERY_COUNT, generated_content_hashes_unique: new Set(galleryHashes).size === galleryHashes.length, artwork_mode: "demo_only" }, null, 2));
