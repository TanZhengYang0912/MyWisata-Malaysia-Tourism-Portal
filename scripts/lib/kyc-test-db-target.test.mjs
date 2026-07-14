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
