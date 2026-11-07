import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VendorPageHeader } from '@/components/vendor/vendor-page-header';

describe('VendorPageHeader', () => {
  it('renders an accessible title with optional context and responsive actions', () => {
    const markup = renderToStaticMarkup(
      <VendorPageHeader
        eyebrow={<span>Vendor workspace</span>}
        title="Business profile"
        description="Details customers see."
        actions={<button type="button">Save changes</button>}
      />,
    );

    expect(markup).toContain('<h1');
    expect(markup).toContain('Business profile</h1>');
    expect(markup).toContain('Vendor workspace');
    expect(markup).toContain('Details customers see.');
    expect(markup).toContain('Save changes');
    expect(markup).toContain('md:flex-row');
    expect(markup).toContain('md:items-end');
  });

  it('supports a title without optional context or actions', () => {
    const markup = renderToStaticMarkup(<VendorPageHeader title="Activity" />);
    expect(markup).toContain('Activity</h1>');
    expect(markup).not.toContain('<p');
    expect(markup).not.toContain('<button');
  });
});
