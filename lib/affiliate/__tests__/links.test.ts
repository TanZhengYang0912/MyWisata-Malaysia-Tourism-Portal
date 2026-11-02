import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOrCreateAffiliateLink } from '../links';

type LinkRow = {
  id: string;
  user_id: string;
  affiliate_code: string;
  is_active: boolean;
  created_at: string;
};

function concurrentLinkClient() {
  const rows: LinkRow[] = [];
  let reads = 0;

  const client = {
    from: () => ({
      select: () => ({
        eq: (_column: string, userId: string) => ({
          maybeSingle: async () => {
            reads += 1;
            if (reads <= 2) return { data: null, error: null };
            return { data: rows.find((row) => row.user_id === userId) ?? null, error: null };
          },
        }),
      }),
      insert: (values: Omit<LinkRow, 'id' | 'created_at' | 'is_active'>) => ({
        select: () => ({
          single: async () => {
            if (rows.some((row) => row.user_id === values.user_id || row.affiliate_code === values.affiliate_code)) {
              return { data: null, error: { code: '23505' } };
            }
            const row: LinkRow = {
              ...values,
              id: 'link-1',
              is_active: true,
              created_at: '2026-10-28T00:00:00.000Z',
            };
            rows.push(row);
            return { data: row, error: null };
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient;

  return { client, rows };
}

describe('affiliate link creation', () => {
  it('returns the single link after concurrent first-time requests race', async () => {
    const { client, rows } = concurrentLinkClient();

    const results = await Promise.all([
      getOrCreateAffiliateLink(client, 'user-1'),
      getOrCreateAffiliateLink(client, 'user-1'),
    ]);

    expect(rows).toHaveLength(1);
    expect(results.map((result) => result.link.id)).toEqual(['link-1', 'link-1']);
    expect(results.map((result) => result.created).sort()).toEqual([false, true]);
  });
});
