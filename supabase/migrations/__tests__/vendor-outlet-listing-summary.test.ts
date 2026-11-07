import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261107124912_vendor_outlet_listing_summary.sql'),
  'utf8',
);

describe('vendor outlet listing summary migration', () => {
  it('aggregates distinct vendor product associations for requested outlets', () => {
    expect(migration).toMatch(/UNION\s+SELECT/i);
    expect(migration).not.toMatch(/UNION\s+ALL/i);
    expect(migration).toMatch(/outlet\.id\s*=\s*ANY\s*\(COALESCE\(p_outlet_ids/i);
    expect(migration).toMatch(/outlet\.vendor_id\s*=\s*p_vendor_id/i);
    expect(migration).toMatch(/vendor_id\s*=\s*p_vendor_id/i);
    expect(migration).toMatch(/offer\.status\s*=\s*'active'/i);
    expect(migration).toMatch(/COUNT\s*\(\s*DISTINCT\s+.*product_id/i);
  });

  it('marks only active accommodation products and limits RPC execution to the server', () => {
    expect(migration).toMatch(/category_id\s*=\s*p_accommodation_category_id/i);
    expect(migration).toMatch(/is_accommodation_outlet/i);
    expect(migration).toMatch(/SECURITY\s+INVOKER/i);
    expect(migration).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION[\s\S]*FROM\s+PUBLIC,\s*anon,\s*authenticated/i);
    expect(migration).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION[\s\S]*TO\s+service_role/i);
  });
});
