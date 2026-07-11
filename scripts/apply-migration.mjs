#!/usr/bin/env node
/**
 * Apply a Supabase migration file using service_role key.
 * Usage: node scripts/apply-migration.mjs <path-to-sql-file>
 */

import fs from 'node:fs';
import path from 'node:path';

for (const filename of ['.env.local', '.env']) {
  const filepath = path.resolve(process.cwd(), filename);
  if (fs.existsSync(filepath)) {
    const content = fs.readFileSync(filepath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const m = t.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
    break;
  }
}

const url        = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('❌ Missing env vars');
  process.exit(1);
}

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('❌ Usage: node scripts/apply-migration.mjs <sql-file>');
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(process.cwd(), sqlFile), 'utf8');
console.log(`ℹ Applying ${sqlFile} (${sql.length} chars)`);

// Supabase Postgres query endpoint (via PostgREST rpc / pg endpoint)
// Use the admin PG endpoint via a temporary function or direct SQL execution.
// PostgREST doesn't expose raw SQL — must use pg_meta or the SQL Editor endpoint.

const projectRef = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!projectRef) { console.error('❌ Could not parse project ref from URL'); process.exit(1); }

const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    apikey:        serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ sql }),
});

if (!res.ok) {
  console.error(`❌ HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  console.error('Note: this requires an exec_sql RPC to exist. Falling back to instructions.');
  console.error('\nRun this SQL in Supabase Dashboard → SQL Editor:');
  console.error('─────────────────────────');
  console.error(sql);
  console.error('─────────────────────────');
  process.exit(1);
}

console.log('✅ Migration applied');
