import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261111062334_support_customer_refund_status_lookup.sql'),
  'utf8',
);
const displayReferenceMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261112143812_support_customer_refund_display_reference.sql'),
  'utf8',
);

describe('Support customer refund status lookup', () => {
  it('filters refunds through the owning order and bounds the result in SQL', () => {
    expect(migration).toMatch(/JOIN public\.orders AS customer_order ON customer_order\.id = refund\.order_id/);
    expect(migration).toMatch(/WHERE customer_order\.user_id = p_owner_user_id/);
    expect(migration).toMatch(/ORDER BY refund\.created_at DESC, refund\.id DESC\s+LIMIT 5/);
  });

  it('keeps the owner lookup RPC unavailable to browser roles', () => {
    expect(migration).toMatch(/SECURITY INVOKER\s+SET search_path = ''/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.list_support_customer_refunds\(uuid\) FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_support_customer_refunds\(uuid\) TO service_role/);
  });

  it('adds the linked order public reference while retaining owner scope and a bounded result', () => {
    expect(displayReferenceMigration).toMatch(/DROP FUNCTION IF EXISTS public\.list_support_customer_refunds\(uuid\)/);
    expect(displayReferenceMigration).toMatch(/order_display_id text/);
    expect(displayReferenceMigration).toMatch(/customer_order\.display_id::text/);
    expect(displayReferenceMigration).toMatch(/WHERE customer_order\.user_id = p_owner_user_id/);
    expect(displayReferenceMigration).toMatch(/ORDER BY refund\.created_at DESC, refund\.id DESC\s+LIMIT 5/);
    expect(displayReferenceMigration).toMatch(/REVOKE ALL ON FUNCTION public\.list_support_customer_refunds\(uuid\) FROM PUBLIC, anon, authenticated/);
    expect(displayReferenceMigration).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_support_customer_refunds\(uuid\) TO service_role/);
  });
});
