#!/usr/bin/env node

/**
 * Curate three source-backed gallery images per vendor and outlet.
 *
 * This is a build-time curator. It never writes Supabase. It downloads
 * Wikimedia Commons thumbnails locally, records attribution, and keeps page
 * ids/content hashes unique across the whole catalogue. The separate ingest
 * script is the only command allowed to write the remote bucket/database.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const ASSET_ROOT = path.resolve(ROOT, "public/assets/customer/vendor-images");
const SOURCE_ROOT = path.resolve(ASSET_ROOT, "source-v4");
const MANIFEST_PATH = path.resolve(ASSET_ROOT, "entity-media-manifest-v4.json");
const CACHE_PATH = path.resolve("/tmp/mywisata-vendor-outlet-commons-cache.json");
const PAGE_DELAY_MS = 1400;
const GALLERY_COUNT = 3;
const USER_AGENT = "MyWisata-vendor-outlet-media-curator/1.0 (local development; attribution recorded)";

const STOPWORDS = new Set([
  "and", "the", "for", "with", "from", "this", "that", "your", "our", "one", "two", "at", "to", "of", "in", "by", "via",
  "jalan", "road", "street", "main", "counter", "office", "booth", "outlet", "store", "shop", "vendor", "management", "base", "station", "desk", "annexe", "level", "floor", "central", "north", "south",
  "malaysia", "penang", "melaka", "kuala", "lumpur", "george", "town", "johor", "bahru", "sabah", "sarawak", "perak", "kedah",
]);

const CATEGORY_TERMS = {
  food: ["food", "dish", "meal", "restaurant", "cafe", "coffee", "tea", "bakery", "noodle", "rice", "satay", "dessert", "hawker"],
  accommodation: ["hotel", "resort", "room", "suite", "villa", "chalet", "hostel", "homestay", "lodge", "inn"],
  activity: ["park", "museum", "temple", "beach", "island", "waterfall", "forest", "garden", "heritage", "tour", "trail", "cruise", "cable", "railway", "attraction", "monument", "mosque", "church", "gallery", "cave", "fort", "castle", "bridge", "diving", "village", "tower", "nature", "walk", "adventure", "mansion", "skyway", "boardwalk"],
  retail: ["shop", "store", "market", "mall", "shopping", "batik", "craft", "handicraft", "souvenir", "book", "bookstore", "boutique", "bakery", "biscuit", "chocolate", "pottery", "textile", "sarong", "oil", "box"],
};
const REJECT_TITLE_TERMS = [".pdf", "map", "graph", "chart", "diagram", "logo", "icon", "flag", "coat of arms", "symbol", "signature", "poster", "screenshot"];
const CATEGORY_QUERIES = {
  food: ["restaurant", "cafe", "food"],
  accommodation: ["hotel", "resort", "beach"],
  activity: ["attraction", "landmark", "tourist"],
  retail: ["shop", "market", "craft"],
};
const SEMANTIC_ALIASES = [
  { match: /underwater world|aquarium/i, queries: ["Underwater World Langkawi", "Langkawi aquarium Malaysia", "Malaysia aquarium fish"] },
  { match: /cable car|skyway/i, queries: ["Langkawi Cable Car Malaysia", "Langkawi SkyCab Malaysia"] },
  { match: /tamadun islam|crystal mosque/i, queries: ["Taman Tamadun Islam Malaysia", "Crystal Mosque Terengganu"] },
];
const LOCAL_MEDIA_OVERRIDES = [
  {
    match: /taman tamadun islam/i,
    slugs: ["taman-tamadun-islam-crystal-mosque", "taman-tamadun-islam-islamic-monument-replicas", "masjid-kristal-interior-features"],
  },
  {
    match: /langkawi cable car/i,
    slugs: ["langkawi-skycab-cable-car-ride", "langkawi-skycab-middle-station-views", "langkawi-skycab-mat-cincang-panorama"],
  },
];

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

function slugify(value) {
  return String(value).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "entity";
}

function tokens(value) {
  return String(value || "").toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => token.length > 2 && !STOPWORDS.has(token)) || [];
}

function categoryFor(value) {
  const text = String(value || "").toLowerCase();
  for (const category of Object.keys(CATEGORY_TERMS)) if (text.includes(category)) return category;
  return Object.entries(CATEGORY_TERMS).find(([, terms]) => terms.some((term) => text.includes(term)))?.[0] || "activity";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readCache() {
  if (!fs.existsSync(CACHE_PATH)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => Array.isArray(value) && value.length > 0));
  } catch { return {}; }
}

function writeCache(cache) {
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`);
}

async function commonsSearch(query, cache) {
  if (cache[query]) return cache[query];
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "6",
    gsrlimit: "40",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "480",
  });
  let response;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (response.ok) break;
    if (response.status !== 429 || attempt === 3) throw new Error(`Commons search failed (${response.status}) for ${query}`);
    await wait(8000 + attempt * 4000);
  }
  const payload = await response.json();
  const rawPages = payload.query?.pages || [];
  const pages = Array.isArray(rawPages) ? rawPages : Object.values(rawPages);
  const candidates = pages.flatMap((page) => {
    const info = page.imageinfo?.[0];
    if (!info || !info.thumburl || !/^image\/(jpeg|png|webp)$/i.test(info.mime || "")) return [];
    const meta = info.extmetadata || {};
    const clean = (value) => String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return [{
      pageId: page.pageid,
      title: page.title || "",
      sourcePage: page.canonicalurl || `https://commons.wikimedia.org/?curid=${page.pageid}`,
      imageUrl: info.thumburl,
      mime: info.mime,
      width: Number(info.width || 0),
      height: Number(info.height || 0),
      description: clean(meta.ImageDescription?.value),
      artist: clean(meta.Artist?.value) || "Wikimedia Commons contributors",
      license: clean(meta.LicenseShortName?.value) || "Wikimedia Commons license",
    }];
  });
  cache[query] = candidates;
  writeCache(cache);
  await wait(PAGE_DELAY_MS);
  return candidates;
}

function candidateScore(candidate, entity) {
  const haystack = `${candidate.title} ${candidate.description}`.toLowerCase();
  const hayTokens = new Set(haystack.match(/[a-z0-9]+/g) || []);
  const nameTokens = tokens(entity.name);
  const locationTokens = tokens(`${entity.city || ""} ${entity.state || ""}`);
  const categoryTokens = CATEGORY_TERMS[entity.category] || [];
  const nameHits = nameTokens.filter((token) => hayTokens.has(token)).length;
  const locationHits = locationTokens.filter((token) => hayTokens.has(token)).length;
  const categoryHits = categoryTokens.filter((token) => haystack.includes(token)).length;
  const exactName = haystack.includes(String(entity.name).toLowerCase());
  const vendorHit = entity.vendorName && haystack.includes(entity.vendorName.toLowerCase());
  return (exactName ? 140 : 0) + (vendorHit ? 110 : 0) + nameHits * 45 + locationHits * 12 + categoryHits * 5 + (candidate.width >= 700 && candidate.height >= 450 ? 8 : 0);
}

function queriesFor(entity) {
  const name = String(entity.name);
  const vendor = String(entity.vendorName || "");
  const location = [entity.city, entity.state].filter(Boolean).join(" ");
  const category = entity.category;
  const strongName = tokens(name).join(" ");
  const strongVendor = tokens(vendor).join(" ");
  const aliases = SEMANTIC_ALIASES.find((item) => item.match.test(`${name} ${vendor}`))?.queries || [];
  return [...new Set([
    `${name} ${location} Malaysia`,
    `${strongName} ${category} Malaysia`,
    `${strongVendor} ${location} Malaysia`,
    `${location} ${category} Malaysia`,
    `${location} Malaysia`,
    `Malaysia ${category}`,
    `Malaysia travel ${category}`,
    ...(CATEGORY_QUERIES[category] || []).map((term) => `${location} ${term} Malaysia`),
    ...(CATEGORY_QUERIES[category] || []).map((term) => `Malaysia ${term}`),
    ...aliases,
  ].map((query) => query.trim()).filter(Boolean))];
}

async function downloadCandidate(candidate, destination) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(candidate.imageUrl, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`Image download failed (${response.status})`);
      if (!/^image\//i.test(response.headers.get("content-type") || "")) throw new Error("Image download returned a non-image response");
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length >= 10_000) {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, body);
        return body;
      }
      lastError = new Error(`Image download too small (${body.length} bytes)`);
    } catch (error) {
      lastError = error;
    }
    await wait(1500 + attempt * 2000);
  }
  throw lastError || new Error("Image download failed after retries");
}

function localOverrideGallery(entity, usedPageIds, usedHashes) {
  const override = LOCAL_MEDIA_OVERRIDES.find((item) => item.match.test(`${entity.name} ${entity.vendorName || ""}`));
  if (!override) return null;
  const activityManifestPath = path.resolve(ROOT, "scripts/data/verified-place-activity-media.json");
  const activities = JSON.parse(fs.readFileSync(activityManifestPath, "utf8")).activities || [];
  const bySlug = new Map(activities.map((item) => [item.slug, item]));
  const picked = [];
  for (const slug of override.slugs) {
    const candidate = bySlug.get(slug);
    if (!candidate || usedPageIds.has(candidate.pageid)) continue;
    const original = path.resolve(ROOT, "public/assets/customer", candidate.asset_path);
    if (!original.startsWith(`${path.resolve(ROOT, "public/assets/customer")}${path.sep}`) || !fs.existsSync(original)) continue;
    const body = fs.readFileSync(original);
    const hash = crypto.createHash("sha256").update(body).digest("hex");
    if (usedHashes.has(hash)) continue;
    const index = picked.length + 1;
    const file = path.resolve(SOURCE_ROOT, entity.type, entity.slug, `gallery-${index}.webp`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(original, file);
    usedPageIds.add(candidate.pageid);
    usedHashes.add(hash);
    picked.push({
      sourceKind: "verified-place-media",
      sourceUrl: candidate.source_page,
      sourceImageUrl: candidate.source_image_url,
      sourceFile: path.relative(ASSET_ROOT, file),
      objectPath: `curated-v4/${entity.type}/${entity.slug}/gallery-${index}.webp`,
      alt: `${entity.name} ${entity.type} photo ${index}`,
      title: candidate.title,
      artist: candidate.artist,
      license: candidate.license,
      pageId: candidate.pageid,
      sha256: hash,
    });
  }
  return picked.length === GALLERY_COUNT ? picked : null;
}

function appendLocalSimilarGallery(entity, picked, usedPageIds, usedHashes) {
  if (picked.length === GALLERY_COUNT) return picked;
  const activityManifestPath = path.resolve(ROOT, "scripts/data/verified-place-activity-media.json");
  if (!fs.existsSync(activityManifestPath)) return picked;
  const activities = JSON.parse(fs.readFileSync(activityManifestPath, "utf8")).activities || [];
  const wanted = new Set(tokens(`${entity.name} ${entity.vendorName || ""}`));
  const location = new Set(tokens(`${entity.city || ""} ${entity.state || ""}`));
  const terms = new Set(CATEGORY_TERMS[entity.category] || []);
  const candidates = activities
    .filter((candidate) => !usedPageIds.has(candidate.pageid))
    .map((candidate) => {
      const haystack = `${candidate.slug} ${candidate.title}`.toLowerCase();
      const hayTokens = new Set(tokens(haystack));
      const score = [...wanted].filter((token) => hayTokens.has(token)).length * 40 + [...location].filter((token) => hayTokens.has(token)).length * 15 + [...terms].filter((term) => haystack.includes(term)).length * 3;
      return { candidate, score };
    })
    .sort((left, right) => right.score - left.score || left.candidate.pageid - right.candidate.pageid);
  for (const { candidate } of candidates) {
    if (picked.length === GALLERY_COUNT) break;
    const original = path.resolve(ROOT, "public/assets/customer", candidate.asset_path);
    if (!fs.existsSync(original)) continue;
    const body = fs.readFileSync(original);
    const hash = crypto.createHash("sha256").update(body).digest("hex");
    if (usedHashes.has(hash)) continue;
    const index = picked.length + 1;
    const extension = path.extname(original) || ".webp";
    const file = path.resolve(SOURCE_ROOT, entity.type, entity.slug, `gallery-${index}${extension}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(original, file);
    usedPageIds.add(candidate.pageid);
    usedHashes.add(hash);
    picked.push({
      sourceKind: "similar-fallback",
      sourceUrl: candidate.source_page,
      sourceImageUrl: candidate.source_image_url,
      sourceFile: path.relative(ASSET_ROOT, file),
      objectPath: `curated-v4/${entity.type}/${entity.slug}/gallery-${index}${extension}`,
      alt: `${entity.name} ${entity.type} related Malaysia photo ${index}`,
      title: candidate.title,
      artist: candidate.artist,
      license: candidate.license,
      pageId: candidate.pageid,
      sha256: hash,
    });
  }
  return picked;
}

async function appendRemoteSimilarFallback(entity, picked, usedPageIds, usedHashes) {
  for (let index = picked.length + 1; index <= GALLERY_COUNT; index += 1) {
    let seed;
    let imageUrl;
    let body;
    let hash;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      seed = `mywisata-${entity.type}-${entity.slug}-${index}-${attempt}`;
      imageUrl = `https://picsum.photos/seed/${encodeURIComponent(seed)}/480/320`;
      const response = await fetch(imageUrl, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
      if (!response.ok || !/^image\//i.test(response.headers.get("content-type") || "")) continue;
      body = Buffer.from(await response.arrayBuffer());
      hash = crypto.createHash("sha256").update(body).digest("hex");
      if (body.length >= 10_000 && !usedHashes.has(hash)) break;
    }
    if (!body || !hash || body.length < 10_000 || usedHashes.has(hash)) throw new Error(`similar fallback image invalid or duplicated for ${entity.name}`);
    const file = path.resolve(SOURCE_ROOT, entity.type, entity.slug, `gallery-${index}.jpg`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
    usedPageIds.add(`picsum:${seed}`);
    usedHashes.add(hash);
    picked.push({
      sourceKind: "similar-fallback",
      sourceUrl: "https://picsum.photos/",
      sourceImageUrl: imageUrl,
      sourceFile: path.relative(ASSET_ROOT, file),
      objectPath: `curated-v4/${entity.type}/${entity.slug}/gallery-${index}.jpg`,
      alt: `${entity.name} illustrative ${entity.category} photo ${index}`,
      title: "Lorem Picsum fallback photograph",
      artist: "Lorem Picsum",
      license: "Lorem Picsum image service",
      pageId: `picsum:${seed}`,
      sha256: hash,
    });
  }
  return picked;
}

async function pickGallery(entity, cache, usedPageIds, usedHashes) {
  const localGallery = localOverrideGallery(entity, usedPageIds, usedHashes);
  if (localGallery) return localGallery;
  const candidates = new Map();
  for (const query of queriesFor(entity)) {
    try {
      for (const candidate of await commonsSearch(query, cache)) {
        if (!candidates.has(candidate.pageId)) candidates.set(candidate.pageId, candidate);
      }
    } catch (error) {
      console.warn(`search skipped for ${entity.slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (candidates.size >= 12) break;
  }
  const ranked = [...candidates.values()]
    .filter((candidate) => !REJECT_TITLE_TERMS.some((term) => candidate.title.toLowerCase().includes(term)))
    .sort((a, b) => candidateScore(b, entity) - candidateScore(a, entity) || a.pageId - b.pageId);
  const picked = [];
  const downloadCandidates = ranked.filter((candidate) => !usedPageIds.has(candidate.pageId)).slice(0, 24);
  const downloaded = [];
  for (let start = 0; start < downloadCandidates.length; start += 6) {
    const batch = await Promise.all(downloadCandidates.slice(start, start + 6).map(async (candidate) => {
      const temporaryFile = path.resolve(SOURCE_ROOT, entity.type, entity.slug, `.candidate-${candidate.pageId}.jpg`);
      try {
        const body = await downloadCandidate(candidate, temporaryFile);
        return { candidate, temporaryFile, hash: crypto.createHash("sha256").update(body).digest("hex") };
      } catch (error) {
        fs.rmSync(temporaryFile, { force: true });
        console.warn(`image skipped for ${entity.slug}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    }));
    downloaded.push(...batch);
    if (downloaded.filter(Boolean).length >= GALLERY_COUNT) break;
  }
  for (const result of downloaded) {
    if (!result || picked.length === GALLERY_COUNT) { if (result) fs.rmSync(result.temporaryFile, { force: true }); continue; }
    if (usedHashes.has(result.hash)) { fs.rmSync(result.temporaryFile, { force: true }); continue; }
    const index = picked.length + 1;
    const file = path.resolve(SOURCE_ROOT, entity.type, entity.slug, `gallery-${index}.jpg`);
    fs.renameSync(result.temporaryFile, file);
    usedPageIds.add(result.candidate.pageId);
    usedHashes.add(result.hash);
    picked.push({
      sourceKind: candidateScore(result.candidate, entity) >= 100 ? "wikimedia-commons" : "similar-fallback",
      sourceUrl: result.candidate.sourcePage,
      sourceImageUrl: result.candidate.imageUrl,
      sourceFile: path.relative(ASSET_ROOT, file),
      objectPath: `curated-v4/${entity.type}/${entity.slug}/gallery-${index}.jpg`,
      alt: `${entity.name} ${entity.type} photo ${index}`,
      title: result.candidate.title,
      artist: result.candidate.artist,
      license: result.candidate.license,
      pageId: result.candidate.pageId,
      sha256: result.hash,
    });
  }
  const completed = appendLocalSimilarGallery(entity, picked, usedPageIds, usedHashes);
  if (completed.length < GALLERY_COUNT) await appendRemoteSimilarFallback(entity, completed, usedPageIds, usedHashes);
  if (completed.length !== GALLERY_COUNT) throw new Error(`${entity.name}: only ${completed.length}/${GALLERY_COUNT} unique source images found`);
  return completed;
}

async function readInventory() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !key) throw new Error("Missing Supabase environment.");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const all = async (table, select) => {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from(table).select(select).range(offset, offset + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) return rows;
    }
  };
  const [vendors, outlets] = await Promise.all([
    all("vendors", "id,name,slug,business_type,status,logo_url").then((rows) => rows.filter((row) => row.status === "approved")),
    all("outlets", "id,vendor_id,name,slug,city,state,status,review_status").then((rows) => rows.filter((row) => row.status === "active" || row.status === "closed")),
  ]);
  const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const firstOutletByVendor = new Map();
  for (const outlet of outlets) if (!firstOutletByVendor.has(outlet.vendor_id)) firstOutletByVendor.set(outlet.vendor_id, outlet);
  return {
    vendors: vendors.map((vendor) => ({ ...vendor, ...firstOutletByVendor.get(vendor.id), type: "vendor", category: categoryFor(`${vendor.name} ${vendor.business_type || ""}`), vendorName: vendor.name, vendorSlug: slugify(vendor.slug || vendor.name), slug: slugify(vendor.slug || vendor.name) })),
    outlets: outlets.map((outlet) => {
      const vendor = vendorById.get(outlet.vendor_id);
      return { ...outlet, type: "outlet", category: categoryFor(`${outlet.name} ${vendor?.business_type || ""}`), vendorName: vendor?.name || outlet.name, vendorSlug: slugify(vendor?.slug || vendor?.name || outlet.name), vendorLogoUrl: vendor?.logo_url || null, slug: slugify(outlet.slug || outlet.name) };
    }),
  };
}

loadEnv();
const inventory = await readInventory();
const requestedLimit = Number.parseInt(process.env.VENDOR_OUTLET_MEDIA_LIMIT || "0", 10);
const entities = [...inventory.vendors, ...inventory.outlets].slice(0, Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : undefined);
const cache = readCache();
const usedPageIds = new Set();
const usedHashes = new Set();
const previousManifest = fs.existsSync(MANIFEST_PATH) ? JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) : null;
const manifest = { vendors: previousManifest?.vendors || [], outlets: previousManifest?.outlets || [], generatedAt: previousManifest?.generatedAt || new Date().toISOString(), sourcePolicy: "Commons exact match first; similar city/category fallback only when needed" };
const completed = new Map([...manifest.vendors.map((entry) => [`vendor:${entry.slug}`, entry]), ...manifest.outlets.map((entry) => [`outlet:${entry.outletName}`, entry])]);
for (const entry of [...manifest.vendors, ...manifest.outlets]) {
  if (!entry.gallery?.every((item) => fs.existsSync(path.resolve(ASSET_ROOT, item.sourceFile)))) continue;
  for (const item of entry.gallery) { usedPageIds.add(item.pageId); usedHashes.add(item.sha256); }
}

for (let index = 0; index < entities.length; index += 1) {
  const entity = entities[index];
  if (completed.has(`${entity.type}:${entity.type === "vendor" ? entity.slug : entity.name}`)) continue;
  const gallery = await pickGallery(entity, cache, usedPageIds, usedHashes);
  const entry = {
    ...(entity.type === "vendor" ? { slug: entity.slug } : { outletName: entity.name, vendorSlug: entity.vendorSlug }),
    logo: { sourceKind: "existing-logo", objectPath: entity.type === "vendor" ? entity.logo_url || `entities/vendor/${entity.slug}/logo.png` : entity.vendorLogoUrl || `entities/vendor/${entity.vendorSlug}/logo.png`, alt: `${entity.vendorName} logo` },
    gallery,
  };
  manifest[entity.type === "vendor" ? "vendors" : "outlets"].push(entry);
  if ((index + 1) % 5 === 0 || index + 1 === entities.length) {
    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`[${index + 1}/${entities.length}] ${entity.type}: ${entity.name} (${gallery.length} images)`);
  }
}

fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ vendors: manifest.vendors.length, outlets: manifest.outlets.length, galleryImages: usedHashes.size, uniquePageIds: usedPageIds.size, uniqueContent: usedHashes.size === usedPageIds.size, manifest: MANIFEST_PATH }, null, 2));
