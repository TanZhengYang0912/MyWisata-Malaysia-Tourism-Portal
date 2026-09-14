import { describe, expect, it, vi } from 'vitest';
import {
  allowRecommendationImageSelection,
  appendSelectedRecommendationImages,
  mergeRecommendationImages,
} from '@/lib/recommendations/submission';

describe('mergeRecommendationImages', () => {
  it('keeps existing photos when more photos are selected later', () => {
    const firstPhoto = { name: 'first.jpg' } as File;
    const secondPhoto = { name: 'second.jpg' } as File;

    expect(mergeRecommendationImages([firstPhoto], [secondPhoto])).toEqual([
      firstPhoto,
      secondPhoto,
    ]);
  });

  it('keeps a snapshot of selected photos when the file input is cleared', () => {
    const selectedPhoto = { name: 'selected.jpg' } as File;
    const liveSelection = { 0: selectedPhoto, length: 1 } as { 0?: File; length: number };
    let deferredUpdate: ((current: File[]) => File[]) | undefined;

    appendSelectedRecommendationImages(liveSelection as ArrayLike<File>, (update) => {
      deferredUpdate = update;
    });
    delete liveSelection[0];
    liveSelection.length = 0;

    expect(deferredUpdate?.([])).toEqual([selectedPhoto]);
  });

  it('replaces the oldest photos and keeps the newest five', () => {
    const existing = Array.from({ length: 5 }, (_, index) => ({ name: `old-${index + 1}.jpg` } as File));
    const selected = [
      { name: 'new-1.jpg' } as File,
      { name: 'new-2.jpg' } as File,
    ];

    expect(mergeRecommendationImages(existing, selected).map((file) => file.name)).toEqual([
      'old-3.jpg',
      'old-4.jpg',
      'old-5.jpg',
      'new-1.jpg',
      'new-2.jpg',
    ]);
  });

  it('stops image selection when replacement is declined', async () => {
    const confirmReplacement = vi.fn(() => false);

    expect(await allowRecommendationImageSelection(5, 0, confirmReplacement)).toBe(false);
    expect(confirmReplacement).toHaveBeenCalledOnce();
  });

  it('does not ask for confirmation while the selection stays within five photos', async () => {
    const confirmReplacement = vi.fn(() => false);

    expect(await allowRecommendationImageSelection(3, 2, confirmReplacement)).toBe(true);
    expect(confirmReplacement).not.toHaveBeenCalled();
  });

  it('asks for confirmation when a selection would overflow five photos', async () => {
    const confirmReplacement = vi.fn(() => true);

    expect(await allowRecommendationImageSelection(4, 2, confirmReplacement)).toBe(true);
    expect(confirmReplacement).toHaveBeenCalledOnce();
  });
});
