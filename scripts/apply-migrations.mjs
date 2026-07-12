#!/usr/bin/env node
/**
 * One-shot migration runner: drops public schema and re-applies all migrations.
 * Run with: node scripts/apply-migrations.mjs
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const { Client } = pg;

for (const filename of ['.env.local', '.env']) {
  const filepath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filepath)) continue;
  const content = fs.readFileSync(filepath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  break;
}

const CONNECTION_STRING = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!CONNECTION_STRING) {
  console.error('❌ Missing SUPABASE_DB_URL or DATABASE_URL. Refusing to connect without an explicit environment variable.');
  process.exit(1);
}

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
  '009_outlet_manager_one_to_one.sql',
  '010_allow_auth_user_profile_defaults.sql',
  '011_add_display_ids.sql',
  '012_add_booking_display_ids.sql',
  '013_content_review_workflow.sql',
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
