import { describe, expect, it } from 'vitest';
import { eventPromotionSubmitSchema } from '@/lib/validation/vendor-schemas';
import { eventPromotionFormErrors } from '../event-promotion-form-errors';

const valid = { title: 'Night market', details: 'Street food and music.', startDate: '2026-12-01', endDate: '2026-12-02', posterUrl: 'https://example.test/poster.webp' };

function errorsFor(input: Record<string, string>) {
  const result = eventPromotionSubmitSchema.safeParse(input);
  return result.success ? {} : eventPromotionFormErrors(result.error.flatten().fieldErrors, Boolean(input.startDate && input.endDate));
}

describe('event promotion form errors', () => {
  it('accepts a complete submission', () => {
    expect(errorsFor(valid)).toEqual({});
  });

  it('names every field the vendor still has to fix', () => {
    // The vendor-reported case: details "abc", no dates picked, image uploaded.
    expect(errorsFor({ ...valid, details: 'abc', startDate: '', endDate: '' })).toEqual({
      details: 'ui.eventPromotions.validation.details',
      dates: 'ui.eventPromotions.validation.datesRequired',
    });
    expect(errorsFor({ ...valid, title: 'ab', posterUrl: '' })).toEqual({
      title: 'ui.eventPromotions.validation.title',
      posterUrl: 'ui.eventPromotions.imageRequired',
    });
  });

  it('says so when the last day is before the first day', () => {
    expect(errorsFor({ ...valid, startDate: '2026-12-05', endDate: '2026-12-01' })).toEqual({ dates: 'ui.eventPromotions.validation.datesOrder' });
  });
});
