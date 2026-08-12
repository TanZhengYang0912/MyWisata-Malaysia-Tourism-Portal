import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  resolve(process.cwd(), 'app/admin/recommendations/page.tsx'),
  'utf8',
);

describe('recommendation moderation pagination', () => {
  it('limits the pending queue to ten recommendations per page', () => {
    expect(pageSource).toContain('const PENDING_PAGE_SIZE = 10;');
    expect(pageSource).toContain('const visiblePending = pending.slice(');
    expect(pageSource).toContain('aria-label="Pending recommendation pagination"');
    expect(pageSource).toContain('aria-label="Previous pending recommendation page"');
    expect(pageSource).toContain('aria-label="Next pending recommendation page"');
  });

  it('gives the reviewed queue its own count and ten-item pagination', () => {
    expect(pageSource).toContain('Reviewed ({reviewed.length})');
    expect(pageSource).toContain('const visibleReviewed = reviewed.slice(');
    expect(pageSource).toContain('aria-label="Reviewed recommendation pagination"');
    expect(pageSource).toContain('aria-label="Previous reviewed recommendation page"');
    expect(pageSource).toContain('aria-label="Next reviewed recommendation page"');
    expect(pageSource).toContain('of {reviewed.length} reviewed recommendations');
  });
});
