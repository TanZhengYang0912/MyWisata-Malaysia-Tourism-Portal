// Turns the event promotion schema's field errors (from the browser check or from the
// API's 422 body) into one translation key per form field, so the vendor sees which
// field to fix instead of a generic "Request body failed validation".

export type EventPromotionFormField = 'title' | 'details' | 'dates' | 'posterUrl';

export function eventPromotionFormErrors(
  fieldErrors: Partial<Record<string, string[] | undefined>>,
  hasBothDates: boolean,
): Partial<Record<EventPromotionFormField, string>> {
  const out: Partial<Record<EventPromotionFormField, string>> = {};
  if (fieldErrors.title?.length) out.title = 'ui.eventPromotions.validation.title';
  if (fieldErrors.details?.length) out.details = 'ui.eventPromotions.validation.details';
  if (fieldErrors.startDate?.length || fieldErrors.endDate?.length) {
    out.dates = hasBothDates ? 'ui.eventPromotions.validation.datesOrder' : 'ui.eventPromotions.validation.datesRequired';
  }
  if (fieldErrors.posterUrl?.length) out.posterUrl = 'ui.eventPromotions.imageRequired';
  return out;
}
