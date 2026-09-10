import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(resolve(process.cwd(), 'components/vendor/product-details-page.tsx'), 'utf8');

describe('vendor product detail workspace contract', () => {
  it('provides one local navigation path to each management section', () => {
    expect(pageSource).toContain('aria-label={t(\'productDetails.sectionNavigation\')}');
    expect(pageSource).toContain('href="#customer-content"');
    expect(pageSource).toContain('href="#inventory"');
    expect(pageSource).toContain('href="#pricing"');
    expect(pageSource).toContain('id="customer-content"');
    expect(pageSource).toContain('id="inventory"');
    expect(pageSource).toContain('id="pricing"');
  });

  it('uses a compact hero and avoids repeating the product status in the facts row', () => {
    expect(pageSource).toContain('lg:grid-cols-[360px_minmax(0,1fr)]');
    expect(pageSource).toContain('layout.heroMedia');
    expect(pageSource).toContain('layout.section');
    expect(pageSource.match(/<StatusBadge/g)).toHaveLength(1);
    expect(pageSource).not.toContain("t('productDetails.status')");
  });
});
