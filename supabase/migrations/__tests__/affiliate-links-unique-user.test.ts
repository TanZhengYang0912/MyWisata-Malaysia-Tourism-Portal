import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('affiliate link user uniqueness migration', () => {
  it('stops on historical duplicates before enforcing one link per user', () => {
    const migrationName = readdirSync(join(process.cwd(), 'supabase/migrations'))
      .find((name) => name.endsWith('_affiliate_links_unique_user.sql'));

    expect(migrationName).toBeDefined();
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations', migrationName!), 'utf8');

    expect(sql).toMatch(/GROUP BY\s+user_id[\s\S]+HAVING count\(\*\) > 1/i);
    expect(sql).toMatch(/RAISE EXCEPTION[\s\S]+duplicate/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX(?: IF NOT EXISTS)?\s+\w+[\s\S]+ON public\.affiliate_links\s*\(user_id\)/i);
  });
});
