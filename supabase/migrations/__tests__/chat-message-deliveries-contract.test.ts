import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260816151000_chat_message_deliveries_live.sql',
);

describe('live chat delivery receipts schema repair', () => {
  it('creates the delivery table and makes receipt upserts safe', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.chat_message_deliveries');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS chat_message_deliveries_message_user_unique');
    expect(sql).toContain('CREATE POLICY chat_deliveries_participant');
  });
});
