#!/usr/bin/env node
/** Rebuild the disposable KYC integration database from every SQL migration. */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

for (const filename of ['.env.local', '.env']) {
  const file = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  break;
}

const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error('Missing SUPABASE_DB_URL or DATABASE_URL');

const migrations = fs.readdirSync(path.resolve('supabase/migrations'))
  .filter((filename) => filename.endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b));

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;');
  for (const filename of migrations) {
    await client.query(fs.readFileSync(path.join('supabase/migrations', filename), 'utf8'));
    console.log(`applied ${filename}`);
  }
} finally {
  await client.end();
}
