import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'app/api/admin/recommendations/route.ts';
const source = existsSync(path) ? readFileSync(path, 'utf8') : '';

describe('GET /api/admin/recommendations contract', () => {
  it('authorizes recommendation reviewers before using the service client', () => {
    expect(source).toContain("rpc('can_review_recommendation'");
    expect(source).toContain('createServiceClient');
    expect(source.indexOf("rpc('can_review_recommendation'")).toBeLessThan(source.indexOf('createServiceClient()'));
  });

  it('paginates and filters on the server', () => {
    expect(source).toContain("from('vendor_recommendations')");
    expect(source).toContain("{ count: 'exact' }");
    expect(source).toContain('.range(offset, offset + pageSize - 1)');
    expect(source).toContain("query.eq('status'");
    expect(source).toContain("query.ilike('vendor_name'");
  });

  it('returns queue age, assignment, counts, and server-owned actions', () => {
    expect(source).toContain('ageHours');
    expect(source).toContain('slaState');
    expect(source).toContain('assignee');
    expect(source).toContain('availableActions');
    expect(source).toContain('counts');
  });
});
