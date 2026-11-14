import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261114071709_admin_withdrawal_filtered_summary.sql'), 'utf8');

describe('admin withdrawal filtered summary migration', () => {
  it('ends its matching CTE before the aggregate SELECT', () => {
    expect(sql).toMatch(/WITH matching AS \([\s\S]*?\)\s+SELECT jsonb_build_object/i);
  });
});
