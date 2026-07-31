import { describe, expect, it } from 'vitest';
import { getProductDetailsLayoutClasses } from '../product-details-layout';

describe('product details layout', () => {
  it('uses a centered page layout with actions at the top', () => {
    const layout = getProductDetailsLayoutClasses();

    expect(layout.page).toContain('max-w-6xl');
    expect(layout.page).toContain('mx-auto');
    expect(layout.content).toContain('space-y-6');
    expect(layout.actions).toContain('sticky');
    expect(layout.actions).toContain('top-4');
    expect(layout.pricing).not.toContain('fixed');
  });
});
