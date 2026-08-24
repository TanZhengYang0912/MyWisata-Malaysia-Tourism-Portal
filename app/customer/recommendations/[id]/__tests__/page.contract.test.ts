import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pagePath = 'app/customer/recommendations/[id]/page.tsx';
const source = existsSync(pagePath) ? readFileSync(pagePath, 'utf8') : '';

describe('customer recommendation detail page', () => {
  it('uses the shared customer skeleton and stable owner-scoped API route', () => {
    expect(source).toContain('CustomerPageTitle');
    expect(source).toContain('CustomerPageShell');
    expect(source).toContain('fetch(`/api/recommendations/${id}`');
  });

  it('shows a customer-safe timeline and linked vendor without internal review data', () => {
    expect(source).toContain('detail.events');
    expect(source).toContain('detail.changesRequested');
    expect(source).toContain('/customer/vendor/');
    expect(source).not.toContain('internalNote');
    expect(source).not.toContain('moderation');
    expect(source).not.toContain('qualityScore');
  });
});
