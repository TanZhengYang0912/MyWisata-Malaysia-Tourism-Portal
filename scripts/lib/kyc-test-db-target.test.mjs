import assert from 'node:assert/strict';
import test from 'node:test';
import { validateKycTestResetTarget } from './kyc-test-db-target.mjs';

const ref = 'abcdefghijklmnopqrst';
const apiUrl = `https://${ref}.supabase.co`;

test('accepts matching direct and pooler Supabase targets only with exact confirmation', () => {
  assert.equal(validateKycTestResetTarget({
    apiUrl, connectionString: `postgresql://postgres:secret@db.${ref}.supabase.co:5432/postgres`, confirmation: ref,
  }), ref);
  assert.equal(validateKycTestResetTarget({
    apiUrl, connectionString: `postgresql://postgres.${ref}:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`, confirmation: ref,
  }), ref);
});

test('rejects empty, mismatched, and substring project references', () => {
  assert.throws(() => validateKycTestResetTarget({
    apiUrl: 'https://.supabase.co', connectionString: `postgresql://postgres:secret@db.${ref}.supabase.co/postgres`, confirmation: ref,
  }), /valid project ref/);
  assert.throws(() => validateKycTestResetTarget({
    apiUrl, connectionString: 'postgresql://postgres:secret@db.zyxwvutsrqponmlkjihg.supabase.co/postgres', confirmation: ref,
  }), /exactly match/);
  assert.throws(() => validateKycTestResetTarget({
    apiUrl, connectionString: `postgresql://postgres.${ref}x:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`, confirmation: ref,
  }), /recognised Supabase/);
  assert.throws(() => validateKycTestResetTarget({
    apiUrl, connectionString: `postgresql://postgres:secret@db.${ref}.supabase.co/postgres`, confirmation: '',
  }), /Refusing destructive replay/);
});

test('rejects non-canonical KYC API URLs before database target validation', () => {
  const database = `postgresql://postgres:secret@db.${ref}.supabase.co/postgres`;
  for (const malformed of [
    `http://${ref}.supabase.co`,
    `https://user:password@${ref}.supabase.co`,
    `https://${ref}.supabase.co:443`,
    `https://${ref}.supabase.co/rest/v1`,
    `https://${ref}.supabase.co?x=1`,
    `https://${ref}.supabase.co#fragment`,
  ]) {
    assert.throws(() => validateKycTestResetTarget({
      apiUrl: malformed, connectionString: database, confirmation: ref,
    }), /valid project ref/);
  }
});
