import { describe, expect, it } from 'vitest';
import { getProductDetailsLayoutClasses } from '../product-details-layout';

describe('product details layout', () => {
  it('uses a centered page layout with actions at the top', () => {
    const layout = getProductDetailsLayoutClasses();

    // The vendor layout wrapper (app/vendor/layout.tsx) already provides
    // width constraints and centring — the detail page class must not add its
    // own max-width so the detail view stays consistent with the listing page.
    expect(layout.page).not.toContain('max-w-6xl');
    expect(layout.page).toContain('space-y-5');
    expect(layout.content).toContain('space-y-5');
    expect(layout.actions).toContain('sticky');
    expect(layout.actions).toContain('top-4');
    expect(layout.pricing).not.toContain('fixed');
  });

  it('uses a balanced hero and shared workspace surfaces', () => {
    const layout = getProductDetailsLayoutClasses();

    expect(layout.heroMedia).toContain('aspect-[4/3]');
    expect(layout.heroMedia).not.toContain('lg:h-[440px]');
    expect(layout.heroContent).toContain('justify-center');
    expect(layout.localNav).toContain('sticky');
    expect(layout.section).toContain('rounded-2xl');
    expect(layout.pricing).toContain('bg-gray-50');
  });
});
