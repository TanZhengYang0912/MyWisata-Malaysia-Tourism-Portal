import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const migrationPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../supabase/migrations/033_kyc_security_hardening.sql',
);

test('admin_review_kyc rejects a null action before any review logic', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');
  const functionBody = migration.match(
    /CREATE OR REPLACE FUNCTION admin_review_kyc\(\n  p_user_id UUID, p_action TEXT, p_reason_code TEXT DEFAULT NULL, p_reason_detail TEXT DEFAULT NULL\n\)[\s\S]*?\n\$\$;/,
  )?.[0];

  assert.ok(functionBody, 'four-argument admin_review_kyc function must exist');
  assert.match(
    functionBody,
    /IF p_action IS NULL OR p_action NOT IN \('approve', 'reject', 'request_info'\) THEN RAISE EXCEPTION 'invalid_action'; END IF;/,
  );
  assert.ok(
    functionBody.indexOf('IF p_action IS NULL OR') < functionBody.indexOf("IF NOT is_admin(auth.uid())"),
    'action validation must run before all other review logic',
  );
});
