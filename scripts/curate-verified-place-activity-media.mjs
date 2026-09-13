#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const INPUT_PATH = path.resolve(ROOT, "scripts/data/verified-place-activity-media.json");
const ASSET_DIR = path.resolve(ROOT, "public/assets/customer/activity-media");
const USER_AGENT = "MyWisata-place-activity-curator/1.0 (local development; attribution recorded)";
const ALLOWED_LICENSE = /^(CC0(?: [0-9.]+)?|CC BY(?:-SA)?(?: [0-9.]+)?|Public domain|Official operator media; source attribution recorded)/i;
const COMMONS_REQUEST_INTERVAL_MS = 6_000;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

if (process.env.VERIFIED_PLACE_ACTIVITY_MEDIA_CURATE !== "1") {
  console.error("Refusing to curate assets without VERIFIED_PLACE_ACTIVITY_MEDIA_CURATE=1.");
  process.exit(1);
}

function stripMarkup(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson(url) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
      if (!response.ok) {
        if (response.status === 429) {
          const retryAfterSeconds = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
          const waitMilliseconds = Math.min(
            Math.max(Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 10_000 * (attempt + 1), 5_000),
            60_000,
          );
          console.warn(`Commons rate limited; waiting ${Math.ceil(waitMilliseconds / 1000)} seconds before retrying.`);
          await sleep(waitMilliseconds);
          continue;
        }
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return response.json();
    } catch (error) {
      lastError = error;
      await sleep(2500 * (attempt + 1));
    }
  }
  throw lastError;
}

async function download(url) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`image download failed: ${response.status} ${response.statusText}`);
  const payload = Buffer.from(await response.arrayBuffer());
  if (payload.byteLength < 10_000) throw new Error(`image download is too small: ${payload.byteLength} bytes`);
  return payload;
}

function assetPathFor(slug) {
  return `activity-media/${slug}.webp`;
}

const source = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
const seenPageIds = new Set();
const seenSlugs = new Set();
const curated = [];
fs.mkdirSync(ASSET_DIR, { recursive: true });

for (const [index, activity] of source.activities.entries()) {
  if (!["access", "informational"].includes(activity.kind)) throw new Error(`${activity.slug}: unsupported activity kind`);
  if (!/^[a-z0-9-]+$/.test(activity.slug) || seenSlugs.has(activity.slug)) throw new Error(`${activity.slug}: duplicate or invalid activity slug`);
  seenSlugs.add(activity.slug);
  if (Number.isInteger(activity.pageid)) {
    if (seenPageIds.has(activity.pageid)) throw new Error(`${activity.slug}: duplicate Commons pageid`);
    seenPageIds.add(activity.pageid);
  }

  const existingAssetPath = activity.asset_path ? path.resolve(ROOT, "public/assets/customer", activity.asset_path) : null;
  if (existingAssetPath && activity.sha256 && fs.existsSync(existingAssetPath)) {
    const actualHash = crypto.createHash("sha256").update(fs.readFileSync(existingAssetPath)).digest("hex");
    if (actualHash !== activity.sha256) throw new Error(`${activity.slug}: saved asset hash no longer matches its credit record`);
    curated.push(activity);
    console.log(`[${index + 1}/${source.activities.length}] ${activity.slug} <- reused verified asset`);
    continue;
  }

  if (!Number.isInteger(activity.pageid)) throw new Error(`${activity.slug}: missing Commons pageid for an uncurated asset`);

  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    pageids: String(activity.pageid),
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "1280",
  });
  const payload = await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`);
  const page = payload.query?.pages?.[0];
  const info = page?.imageinfo?.[0];
  const metadata = info?.extmetadata ?? {};
  const license = stripMarkup(metadata.LicenseShortName?.value);
  const artist = stripMarkup(metadata.Artist?.value);
  if (!page || !info?.thumburl || !/^image\/(jpeg|png|webp)$/i.test(info.mime ?? "")) throw new Error(`${activity.slug}: Commons record is not a usable photo`);
  if (!ALLOWED_LICENSE.test(license) || !artist) throw new Error(`${activity.slug}: unsupported or unattributed license (${license || "missing"})`);

  const assetPath = assetPathFor(activity.slug);
  const destination = path.resolve(ROOT, "public/assets/customer", assetPath);
  // Recover safely from a throttled run: preserve an already rendered local
  // asset, but still refetch its Commons attribution and recalculate its hash.
  const webp = activity.sha256 && fs.existsSync(destination)
    ? fs.readFileSync(destination)
    : await sharp(await download(info.thumburl)).rotate().resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
  const sha256 = crypto.createHash("sha256").update(webp).digest("hex");
  if (curated.some((item) => item.sha256 === sha256)) throw new Error(`${activity.slug}: duplicated rendered image hash`);
  if (!activity.sha256 || !fs.existsSync(destination)) fs.writeFileSync(destination, webp);
  const record = {
    kind: activity.kind,
    slug: activity.slug,
    pageid: activity.pageid,
    asset_path: assetPath,
    source_page: `https://commons.wikimedia.org/?curid=${activity.pageid}`,
    source_image_url: info.url,
    title: page.title,
    license,
    artist,
    sha256,
  };
  curated.push(record);
  source.activities[index] = record;
  fs.writeFileSync(INPUT_PATH, `${JSON.stringify(source, null, 2)}\n`);
  console.log(`[${index + 1}/${source.activities.length}] ${activity.slug} <- ${page.title}`);
  // Commons metadata and image delivery share rate limits. Keep new-image
  // curation deliberately slow so a broad catalogue run remains a good API
  // citizen instead of making later verification impossible.
  await sleep(COMMONS_REQUEST_INTERVAL_MS);
}

fs.writeFileSync(INPUT_PATH, `${JSON.stringify({ activities: curated }, null, 2)}\n`);
console.log(JSON.stringify({ curated: curated.length, assets: "public/assets/customer/activity-media" }, null, 2));
