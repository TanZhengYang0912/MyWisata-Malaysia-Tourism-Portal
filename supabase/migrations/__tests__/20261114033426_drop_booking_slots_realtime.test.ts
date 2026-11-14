import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20261114033426_drop_booking_slots_realtime.sql',
);

describe('booking_slots Realtime publication removal', () => {
  it('removes only booking_slots from the Realtime publication, idempotently', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');
    const executableSql = sql.replace(/--.*$/gm, '');
    const statements = executableSql.match(/ALTER PUBLICATION[^;]*;/gi) ?? [];

    expect(statements).toEqual(['ALTER PUBLICATION supabase_realtime DROP TABLE public.booking_slots;']);
    expect(sql).toMatch(/IF EXISTS \(\s*SELECT 1 FROM pg_publication_tables/);
  });

  it('documents the rollout order and the rollback statement', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('Apply only after');
    expect(sql).toContain('Rollback: ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_slots;');
  });
});
