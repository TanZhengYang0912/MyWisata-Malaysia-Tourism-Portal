#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import {
  isEligibleImageBucket,
  isImageObject,
  isSafeObjectPath,
  needsObjectRepair,
  PUBLIC_IMAGE_BUCKET_IDS,
  validateSyncEndpoints,
} from "./lib/local-storage-image-sync.mjs";

const PAGE_LIMIT = 1000;
const CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 15_000;
const APPLY = process.argv.slice(2).includes("--apply");
const args = process.argv.slice(2).filter((argument) => argument !== "--apply");

function readEnvFile(filename) {
  const filePath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filePath)) throw new Error(`Required environment file is missing: ${filename}`);

  const values = new Map();
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    values.set(key, value);
  }
  return values;
}

function requiredValue(values, keys, label) {
  for (const key of keys) {
    const value = values.get(key);
    if (value) return value;
  }
  throw new Error(`${label} is missing from its designated environment file.`);
}

function makeClient(url, key) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function encodedObjectUrl(origin, bucketId, objectPath) {
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  return `${origin}/storage/v1/object/public/${encodeURIComponent(bucketId)}/${encodedPath}`;
}

function cacheControlSeconds(value) {
  const match = String(value ?? "").match(/(?:max-age=)?(\d+)/i);
  return match?.[1] ?? "3600";
}

function makeBucketStats() {
  return {
    listed: 0,
    checked: 0,
    matching: 0,
    needsRepair: 0,
    downloadRequests: 0,
    upsertRequests: 0,
    acceptedUploads: 0,
    reconciledUploads: 0,
    verified: 0,
    failed: 0,
    needsRepairBytes: 0,
    downloadedBytes: 0,
    uploadBytesAttempted: 0,
  };
}

async function listImageObjects(client, bucketId) {
  const images = [];
  let listRequests = 0;

  async function visit(prefix) {
    for (let offset = 0; ; offset += PAGE_LIMIT) {
      const { data, error } = await client.storage.from(bucketId).list(prefix, {
        limit: PAGE_LIMIT,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      listRequests += 1;
      if (error) throw new Error(`Could not list ${bucketId}: ${error.message}`);

      const entries = data ?? [];
      for (const entry of entries) {
        const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (!isSafeObjectPath(objectPath)) {
          throw new Error(`Unsafe Storage object path reported in ${bucketId}.`);
        }

        if (entry.id === null || entry.id === undefined) {
          await visit(objectPath);
          continue;
        }
        if (!isImageObject(entry)) continue;

        const size = Number(entry.metadata.size);
        const etag = entry.metadata.eTag ?? entry.metadata.etag;
        if (!Number.isSafeInteger(size) || size < 0 || typeof etag !== "string" || !etag) {
          throw new Error(`Remote image listing omitted size or ETag metadata in ${bucketId}.`);
        }

        images.push({
          bucketId,
          objectPath,
          size,
          etag,
          mimeType: entry.metadata.mimetype,
          cacheControl: cacheControlSeconds(entry.metadata.cacheControl),
        });
      }

      if (entries.length < PAGE_LIMIT) break;
    }
  }

  await visit("");
  return { images, listRequests };
}

async function getLocalProbe(targetOrigin, image) {
  const response = await fetch(encodedObjectUrl(targetOrigin, image.bucketId, image.objectPath), {
    headers: { Range: "bytes=0-0" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const probe = { status: response.status, etag: response.headers.get("etag") };
  try {
    await response.body?.cancel();
  } catch {
    // The probe result already includes the status and ETag needed by the caller.
  }
  return probe;
}

async function runWithConcurrency(items, worker, onFailure) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        await worker(items[index]);
      } catch (error) {
        onFailure(items[index], error);
      }
    }
  }));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const startedAt = Date.now();
  if (args.length > 0) {
    if (args.length === 1 && args[0] === "--help") {
      console.log("Usage: node scripts/sync-local-storage-images.mjs [--apply]");
      console.log("Default mode audits only. --apply writes missing or mismatched images to local Supabase Storage.");
      return;
    }
    throw new Error(`Unsupported argument: ${args[0]}`);
  }

  const sourceEnv = readEnvFile(".env.local");
  const targetEnv = readEnvFile(".env.development.local");
  const sourceUrl = requiredValue(sourceEnv, ["NEXT_PUBLIC_SUPABASE_URL"], "Hosted Supabase URL");
  const sourceKey = requiredValue(sourceEnv, ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"], "Hosted service key");
  const targetUrl = requiredValue(targetEnv, ["NEXT_PUBLIC_SUPABASE_URL"], "Local Supabase URL");
  const targetKey = requiredValue(targetEnv, ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"], "Local service key");
  const { sourceOrigin, targetOrigin } = validateSyncEndpoints(sourceUrl, targetUrl);

  const source = makeClient(sourceOrigin, sourceKey);
  const target = makeClient(targetOrigin, targetKey);
  const [{ data: sourceBuckets, error: sourceBucketsError }, { data: targetBuckets, error: targetBucketsError }] = await Promise.all([
    source.storage.listBuckets(),
    target.storage.listBuckets(),
  ]);
  if (sourceBucketsError) throw new Error(`Hosted bucket inventory failed: ${sourceBucketsError.message}`);
  if (targetBucketsError) throw new Error(`Local bucket inventory failed: ${targetBucketsError.message}`);

  for (const bucketId of PUBLIC_IMAGE_BUCKET_IDS) {
    const sourceBucket = sourceBuckets.find((bucket) => bucket.id === bucketId);
    const targetBucket = targetBuckets.find((bucket) => bucket.id === bucketId);
    if (!isEligibleImageBucket(sourceBucket) || !isEligibleImageBucket(targetBucket)) {
      throw new Error(`Expected public image bucket is missing or private: ${bucketId}`);
    }
  }

  const allImages = [];
  let listRequests = 0;
  const bucketStats = Object.fromEntries(PUBLIC_IMAGE_BUCKET_IDS.map((bucketId) => [bucketId, makeBucketStats()]));
  for (const bucketId of PUBLIC_IMAGE_BUCKET_IDS) {
    const { images, listRequests: bucketListRequests } = await listImageObjects(source, bucketId);
    listRequests += bucketListRequests;
    bucketStats[bucketId].listed = images.length;
    allImages.push(...images);
  }

  const failureSamples = [];
  let localRangeGets = 0;
  await runWithConcurrency(allImages, async (image) => {
    const stats = bucketStats[image.bucketId];
    stats.checked += 1;
    localRangeGets += 1;
    const initialProbe = await getLocalProbe(targetOrigin, image);
    if (!needsObjectRepair(image.etag, initialProbe)) {
      stats.matching += 1;
      return;
    }

    stats.needsRepair += 1;
    stats.needsRepairBytes += image.size;
    if (!APPLY) return;

    stats.downloadRequests += 1;
    const { data, error: downloadError } = await source.storage.from(image.bucketId).download(image.objectPath);
    if (downloadError || !data) {
      throw new Error(`Hosted image download failed: ${downloadError?.message ?? "empty response"}`);
    }

    const bytes = Buffer.from(await data.arrayBuffer());
    stats.downloadedBytes += bytes.length;
    if (bytes.length !== image.size) throw new Error(`Hosted image size did not match listing metadata in ${image.bucketId}.`);

    stats.upsertRequests += 1;
    stats.uploadBytesAttempted += bytes.length;
    const { error: uploadError } = await target.storage.from(image.bucketId).upload(image.objectPath, bytes, {
      contentType: image.mimeType,
      cacheControl: image.cacheControl,
      upsert: true,
    });

    localRangeGets += 1;
    const finalProbe = await getLocalProbe(targetOrigin, image);
    if (needsObjectRepair(image.etag, finalProbe)) {
      throw new Error(uploadError
        ? `Local upload response was uncertain and the final ETag did not match: ${uploadError.message}`
        : "Local image ETag did not match the hosted object after upload.");
    }

    if (uploadError) stats.reconciledUploads += 1;
    else stats.acceptedUploads += 1;
    stats.verified += 1;
  }, (image, error) => {
    const stats = bucketStats[image.bucketId];
    stats.failed += 1;
    if (failureSamples.length < 10) {
      failureSamples.push({ bucket: image.bucketId, path: image.objectPath, error: errorMessage(error) });
    }
  });

  const buckets = Object.entries(bucketStats).map(([bucket, stats]) => ({ bucket, ...stats }));
  const totals = buckets.reduce((result, bucket) => {
    for (const key of Object.keys(makeBucketStats())) result[key] += bucket[key];
    return result;
  }, makeBucketStats());

  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    source: sourceOrigin,
    target: targetOrigin,
    scope: PUBLIC_IMAGE_BUCKET_IDS,
    listRequests,
    localRangeGets,
    candidates: allImages.length,
    hostedBytes: allImages.reduce((sum, image) => sum + image.size, 0),
    totals,
    buckets,
    failureSamples,
    elapsedMs: Date.now() - startedAt,
  }, null, 2));

  if (totals.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Local image sync stopped: ${errorMessage(error)}`);
  process.exitCode = 1;
});
