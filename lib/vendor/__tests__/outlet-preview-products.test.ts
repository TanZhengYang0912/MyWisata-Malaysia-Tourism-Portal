import { describe, expect, it, vi } from 'vitest';
import { loadOutletPreviewProductPages } from '../outlet-preview-products';

describe('loadOutletPreviewProductPages', () => {
  it('loads all API pages in order and removes duplicate product ids', async () => {
    const pages = {
      1: { items: [{ id: 'a' }, { id: 'b' }], totalPages: 3 },
      2: { items: [{ id: 'b' }, { id: 'c' }], totalPages: 3 },
      3: { items: [{ id: 'd' }], totalPages: 3 },
    };
    const fetchPage = vi.fn(async (page: number) => pages[page as keyof typeof pages]);

    await expect(loadOutletPreviewProductPages(fetchPage)).resolves.toEqual([
      { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' },
    ]);
    expect(fetchPage.mock.calls).toEqual([[1], [2], [3]]);
  });

  it('loads the first page when the API reports an invalid page count', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: [{ id: 'a' }], totalPages: Number.NaN });

    await expect(loadOutletPreviewProductPages(fetchPage)).resolves.toEqual([{ id: 'a' }]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('fails the whole preview when a later page fails instead of rendering partial results', async () => {
    const fetchPage = vi.fn(async (page: number) => {
      if (page === 2) throw new Error('Page 2 failed');
      return { items: [{ id: 'a' }], totalPages: 3 };
    });

    await expect(loadOutletPreviewProductPages(fetchPage)).rejects.toThrow('Page 2 failed');
    expect(fetchPage.mock.calls).toEqual([[1], [2]]);
  });
});
