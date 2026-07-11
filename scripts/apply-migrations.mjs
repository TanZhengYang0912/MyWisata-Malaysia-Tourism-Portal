#!/usr/bin/env node
/**
 * One-shot migration runner: drops public schema and re-applies all 8 migrations.
 * Run with: node scripts/apply-migrations.mjs
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const { Client } = pg;

const CONNECTION_STRING = 'postgresql://postgres.ncdlaehknicabzjqskvk:ChunJie0213@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase/migrations');
const MIGRATION_FILES = [
  '001_initial_schema.sql',
  '002_governance_functions.sql',
  '003_rls_policies.sql',
  '004_audit_notify_rpc.sql',
  '005_my_roles_rpc.sql',
  '006_fix_default_grants.sql',
  '007_public_read_policies.sql',
  '008_vendor_realtime_and_chat_policies.sql',
];

async function run() {
  const client = new Client({ connectionString: CONNECTION_STRING, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('✅ Connected to Postgres');

  // Step 1: Drop and recreate public schema
  console.log('\n⏳ Dropping existing public schema…');
  await client.query(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
  `);
  console.log('✅ Schema reset complete');

  // Step 2: Apply each migration file in order
  for (const filename of MIGRATION_FILES) {
    const filepath = path.join(MIGRATIONS_DIR, filename);
    const sql = fs.readFileSync(filepath, 'utf8');
    console.log(`\n⏳ Applying ${filename}…`);
    try {
      await client.query(sql);
      console.log(`✅ ${filename} done`);
    } catch (err) {
      console.error(`❌ Error in ${filename}:`, err.message);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log('\n🎉 All migrations applied successfully!');
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
