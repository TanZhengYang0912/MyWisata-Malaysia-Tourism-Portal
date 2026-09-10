import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const variantsSource = readFileSync(resolve(process.cwd(), 'components/vendor/variant-manager.tsx'), 'utf8');
const pricingSource = readFileSync(resolve(process.cwd(), 'components/vendor/price-rule-manager.tsx'), 'utf8');

describe('vendor product management panels contract', () => {
  it('keeps variant operations while making the editor responsive and labelled', () => {
    expect(variantsSource).toContain('overflow-x-auto');
    expect(variantsSource).toContain('htmlFor="variant-name"');
    expect(variantsSource).toContain('htmlFor="variant-price-offset"');
    expect(variantsSource).toContain('/variants');
  });

  it('uses neutral pricing surfaces and visible field labels without changing API paths', () => {
    expect(pricingSource).toContain('layout.pricing');
    expect(pricingSource).not.toContain('bg-amber-50/50');
    expect(pricingSource).not.toContain('bg-amber-600');
    expect(pricingSource).toContain('htmlFor="pricing-rule-type"');
    expect(pricingSource).toContain('htmlFor="pricing-rule-label"');
    expect(pricingSource).toContain('/price-rules');
  });
});
