import { describe, expect, it } from 'vitest';
import {
  createDefaultOutletPageDocument,
} from '@/lib/vendor/outlet-page-schema';
import { selectDraftDocument, selectPublicDocument } from '@/lib/vendor/outlet-page-persistence';

describe('outlet page persistence selection', () => {
  it('public selection prefers the published document over a newer draft', () => {
    const published = createDefaultOutletPageDocument('Published Outlet');
    const draft = createDefaultOutletPageDocument('Draft Outlet');

    expect(selectPublicDocument({ published_document: published, draft_document: draft }).hero.title).toBe('Published Outlet');
  });

  it('legacy pages are readable when lifecycle documents are absent', () => {
    const result = selectDraftDocument({
      blocks: [],
      hero_url: 'https://example.com/hero.jpg',
    });

    expect(result.hero.imageUrl).toBe('https://example.com/hero.jpg');
  });

  it('keeps a published page useful when its document has no content blocks', () => {
    const result = selectPublicDocument({
      published_document: {
        ...createDefaultOutletPageDocument('Published Outlet'),
        blocks: [],
      },
    });

    expect(result.blocks.map((block) => block.type)).toContain('product_grid');
  });
});
