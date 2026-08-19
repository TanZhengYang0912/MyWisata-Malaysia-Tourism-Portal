import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260816150000_chat_threads_vendor_id_unique_live.sql',
);

describe('live chat thread schema repair', () => {
  it('derives vendor ownership and prevents duplicate customer-outlet threads', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS vendor_id uuid');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_customer_outlet_unique');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.set_chat_thread_vendor_id');
    expect(sql).toContain('CREATE TRIGGER chat_threads_set_vendor_id');
  });
});
