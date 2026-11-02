import { describe, expect, it, vi } from 'vitest';
import { loadPublicContentSources } from '../server';
import type { PublicTranslationRequestItem } from '../contract';

function queryResult(data: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'in', 'eq', 'gte']) builder[method] = vi.fn(() => builder);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve);
  return builder;
}

describe('loadPublicContentSources', () => {
  it('reads only public review copy and requires its product and vendor to remain approved', async () => {
    const reviewQuery = queryResult([{
      id: 'review-1', title: 'Lovely visit', body: 'Would return', product_id: 'product-1', vendor_id: 'vendor-1', is_visible: true,
    }]);
    const productQuery = queryResult([{ id: 'product-1', vendor_id: 'vendor-1' }]);
    const vendorQuery = queryResult([{ id: 'vendor-1' }]);
    const from = vi.fn((table: string) => table === 'reviews' ? reviewQuery : table === 'products' ? productQuery : vendorQuery);
    const db = { from } as never;
    const items: PublicTranslationRequestItem[] = [{ entityType: 'review', entityId: 'review-1', fields: ['title', 'body'] }];

    const sources = await loadPublicContentSources(db, items);

    expect(sources.get('review:review-1:title')?.sourceText).toBe('Lovely visit');
    expect(sources.get('review:review-1:body')?.sourceText).toBe('Would return');
    expect(reviewQuery.select).toHaveBeenCalledWith('id,title,body,product_id,vendor_id,is_visible');
    expect(reviewQuery.eq).toHaveBeenCalledWith('is_visible', true);
    expect(productQuery.eq).toHaveBeenCalledWith('review_status', 'approved');
    expect(vendorQuery.eq).toHaveBeenCalledWith('status', 'approved');
  });

  it('uses the public campaign projection rather than querying restricted campaign tables', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'campaign-1', title: 'Public event', summary: 'Short copy', description: 'Details' }], error: null });
    const from = vi.fn();
    const db = { from, rpc } as never;
    const items: PublicTranslationRequestItem[] = [{ entityType: 'promotion_campaign', entityId: 'campaign-1', fields: ['title', 'summary', 'description'] }];

    const sources = await loadPublicContentSources(db, items);

    expect(rpc).toHaveBeenCalledWith('get_public_promotion_campaigns', { p_slug: null });
    expect(from).not.toHaveBeenCalled();
    expect(sources.get('promotion_campaign:campaign-1:description')?.sourceText).toBe('Details');
  });

  it('filters catalog source records by active public status before making them available', async () => {
    const productQuery = queryResult([{ id: 'product-1', name: 'Public item', description: 'Public description' }]);
    const from = vi.fn(() => productQuery);
    const db = { from } as never;
    const items: PublicTranslationRequestItem[] = [{ entityType: 'product', entityId: 'product-1', fields: ['name', 'description'] }];

    const sources = await loadPublicContentSources(db, items);

    expect(productQuery.eq).toHaveBeenCalledWith('status', 'active');
    expect(productQuery.eq).toHaveBeenCalledWith('review_status', 'approved');
    expect(sources.size).toBe(2);
  });

  it('loads only paid, in-date event-promotion copy and never selects payment fields', async () => {
    const query = queryResult([{ id: 'event-1', title: 'Food festival', details: 'Local food stalls' }]);
    const from = vi.fn(() => query);
    const db = { from } as never;
    const items: PublicTranslationRequestItem[] = [{ entityType: 'vendor_event_promotion', entityId: 'event-1', fields: ['title', 'details'] }];

    const sources = await loadPublicContentSources(db, items);

    expect(from).toHaveBeenCalledWith('vendor_event_promotions');
    expect(query.select).toHaveBeenCalledWith('id,title,details');
    expect(query.eq).toHaveBeenCalledWith('status', 'paid');
    expect(query.gte).toHaveBeenCalledWith('ends_on', expect.any(String));
    expect(sources.get('vendor_event_promotion:event-1:title')?.sourceText).toBe('Food festival');
    expect(sources.get('vendor_event_promotion:event-1:details')?.sourceText).toBe('Local food stalls');
  });
});
