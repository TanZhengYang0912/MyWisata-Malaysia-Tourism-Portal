#!/usr/bin/env node
/**
 * One-time authenticator setup for a shared demo staff account.
 * Plan: Docs/plans/2026-10-14-1543-staff-two-factor-login.md
 *
 * Usage (password via env so it stays out of shell history):
 *   STAFF_MFA_PASSWORD=... node scripts/setup-staff-mfa.mjs approver@demo.local
 *
 * Signs in as the account, adds one authenticator (TOTP) factor, verifies it with
 * a generated code, and PRINTS the setup key once. Nothing is written to disk.
 * Share the key privately (team vault); never commit it. Real staff should set
 * up their own authenticator at /admin/security instead.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

for (const filename of ['.env.local', '.env']) {
  const filepath = path.resolve(process.cwd(), filename);
  if (fs.existsSync(filepath)) {
    for (const line of fs.readFileSync(filepath, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const m = t.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
    break;
  }
}

const email = process.argv[2];
const password = process.env.STAFF_MFA_PASSWORD;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!email || !password || !url || !anonKey) {
  console.error('Usage: STAFF_MFA_PASSWORD=... node scripts/setup-staff-mfa.mjs <email>  (needs Supabase URL + anon key in .env.local)');
  process.exit(1);
}

const FRIENDLY_NAME = 'MYLawatan';

/** RFC 6238 TOTP: SHA-1, 30-second steps, 6 digits. */
function totp(secret, now = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

async function auth(method, route, body, token = anonKey) {
  const response = await fetch(`${url}/auth/v1${route}`, {
    method,
    headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${route} failed (${response.status}): ${json.msg ?? json.message ?? json.error_description ?? 'unknown error'}`);
  return json;
}

const session = await auth('POST', '/token?grant_type=password', { email, password });
const token = session.access_token;
const user = await auth('GET', '/user', undefined, token);
const factors = (user.factors ?? []).filter((factor) => factor.factor_type === 'totp');
if (factors.some((factor) => factor.status === 'verified')) {
  console.error(`${email} already has an authenticator. To replace it, delete the factor in Supabase (Authentication → Users → ${email} → MFA) and run this again.`);
  process.exit(1);
}
for (const factor of factors.filter((entry) => [FRIENDLY_NAME, 'MyLawatan'].includes(entry.friendly_name))) {
  await auth('DELETE', `/factors/${factor.id}`, undefined, token);
}

const factor = await auth('POST', '/factors', { factor_type: 'totp', friendly_name: FRIENDLY_NAME, issuer: 'MYLawatan' }, token);
const challenge = await auth('POST', `/factors/${factor.id}/challenge`, {}, token);
await auth('POST', `/factors/${factor.id}/verify`, { challenge_id: challenge.id, code: totp(factor.totp.secret) }, token);

const envName = `E2E_TOTP_${email.split('@')[0].toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
console.log(`Authenticator set up and verified for ${email}.`);
console.log('');
console.log('Keep these private (team vault). Anyone with the key can generate codes for this account.');
console.log(`  Setup key:   ${factor.totp.secret}`);
console.log(`  Add link:    ${factor.totp.uri}`);
console.log(`  For tests:   ${envName}=${factor.totp.secret}   (add to .env.local, never commit)`);
