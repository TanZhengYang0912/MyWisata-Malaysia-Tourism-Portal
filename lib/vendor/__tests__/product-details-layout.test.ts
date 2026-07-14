import { describe, expect, it } from 'vitest';
import { getProductDetailsLayoutClasses } from '../product-details-layout';

describe('product details layout', () => {
  it('keeps pricing inside the scrollable drawer and actions visible', () => {
    const layout = getProductDetailsLayoutClasses();

    expect(layout.drawer).toContain('flex-col');
    expect(layout.content).toContain('overflow-y-auto');
    expect(layout.actions).toContain('sticky');
    expect(layout.actions).toContain('bottom-0');
    expect(layout.pricing).not.toContain('fixed');
  });
});
