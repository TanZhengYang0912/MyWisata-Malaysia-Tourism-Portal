#!/usr/bin/env node

import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import {
  UPSERT_LOCATION_CITIES_SQL,
  createSupabaseBatchUpserter,
  parseGeoNamesCity,
  resolveImportTransport,
  toDatabaseCity,
} from "./lib/geonames-cities.mjs";

const DEFAULT_SOURCE = "https://download.geonames.org/export/dump/cities1000.zip";
const BATCH_SIZE = 500;

async function downloadArchive(targetPath) {
  const response = await fetch(DEFAULT_SOURCE, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`GeoNames download failed (${response.status})`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(targetPath, { mode: 0o600 }));
}

function requireUnzip() {
  const result = spawnSync("unzip", ["-v"], { stdio: "ignore" });
  if (result.error || result.status !== 0) throw new Error("The unzip executable is required for GeoNames import");
}

async function upsertBatch(client, batch) {
  if (batch.length === 0) return;
  await client.query(UPSERT_LOCATION_CITIES_SQL, [JSON.stringify(batch)]);
}

function loadEnv() {
  for (const filename of [".env.local", ".env"]) {
    const filepath = path.resolve(process.cwd(), filename);
    if (!existsSync(filepath)) continue;
    for (const line of readFileSync(filepath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    break;
  }
}

export async function importGeoNamesCities({ archivePath, databaseUrl, supabaseUrl, serviceRoleKey }) {
  const transport = resolveImportTransport({ databaseUrl, supabaseUrl, serviceRoleKey });
  requireUnzip();

  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "mywisata-geonames-"));
  const downloadedPath = path.join(temporaryDirectory, "cities1000.zip");
  const sourcePath = archivePath ? path.resolve(archivePath) : downloadedPath;
  const postgresClient = transport === "postgres"
    ? new pg.Client({ connectionString: databaseUrl, application_name: "mywisata-geonames-import" })
    : null;
  const supabaseClient = transport === "supabase"
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
  const writeBatch = postgresClient
    ? (batch) => upsertBatch(postgresClient, batch)
    : createSupabaseBatchUpserter(supabaseClient);
  let imported = 0;
  let skipped = 0;
  let connected = false;

  try {
    if (!archivePath) await downloadArchive(downloadedPath);
    if (postgresClient) {
      await postgresClient.connect();
      connected = true;
      await postgresClient.query("BEGIN");
    }

    const unzip = spawn("unzip", ["-p", sourcePath, "cities1000.txt"], { stdio: ["ignore", "pipe", "pipe"] });
    const unzipFinished = new Promise((resolve, reject) => {
      unzip.once("error", reject);
      unzip.once("close", resolve);
    });
    let unzipError = "";
    unzip.stderr.setEncoding("utf8");
    unzip.stderr.on("data", (chunk) => { unzipError += chunk; });

    const lines = createInterface({ input: unzip.stdout, crlfDelay: Infinity });
    let batch = [];
    for await (const line of lines) {
      const city = parseGeoNamesCity(line);
      if (!city) {
        skipped += 1;
        continue;
      }
      batch.push(toDatabaseCity(city));
      if (batch.length >= BATCH_SIZE) {
        await writeBatch(batch);
        imported += batch.length;
        batch = [];
      }
    }
    await writeBatch(batch);
    imported += batch.length;

    const exitCode = await unzipFinished;
    if (exitCode !== 0) throw new Error(`GeoNames archive extraction failed: ${unzipError.trim() || "unknown unzip error"}`);

    if (postgresClient) await postgresClient.query("COMMIT");
    return { imported, skipped };
  } catch (error) {
    if (connected && postgresClient) await postgresClient.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    if (postgresClient) await postgresClient.end().catch(() => undefined);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main() {
  loadEnv();
  const fileIndex = process.argv.indexOf("--file");
  const archivePath = fileIndex >= 0 ? process.argv[fileIndex + 1] : undefined;
  if (fileIndex >= 0 && !archivePath) throw new Error("--file requires a path to cities1000.zip");
  const result = await importGeoNamesCities({
    archivePath,
    databaseUrl: process.env.DATABASE_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  });
  process.stdout.write(`GeoNames city import complete: ${result.imported} imported, ${result.skipped} skipped.\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "GeoNames city import failed"}\n`);
    process.exitCode = 1;
  });
}
