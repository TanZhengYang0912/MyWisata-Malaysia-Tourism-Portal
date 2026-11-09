import { describe, expect, it } from 'vitest';

import {
  isMissingProductTicketAdmissionSchemaError,
  resolveProductTicketAdmission,
} from '../product-ticket-policy';
import * as ticketPolicy from '../product-ticket-policy';

describe('product ticket admission policy', () => {
  it('keeps the historical single-entry defaults when no policy is supplied', () => {
    expect(resolveProductTicketAdmission({ requiresBooking: false })).toEqual({
      ok: true,
      value: {
        ticketEntryLimit: 1,
        ticketEntryPolicy: 'single_entry',
        ticketValidityDays: null,
      },
    });
  });

  it('recognises only missing ticket-admission schema errors', () => {
    expect(
      isMissingProductTicketAdmissionSchemaError({
        message: 'column products.ticket_entry_policy does not exist',
      }),
    ).toBe(true);
    expect(
      isMissingProductTicketAdmissionSchemaError({
        message: 'column products.name does not exist',
      }),
    ).toBe(false);
  });

  it('accepts bookable products and explicitly linked admissions, but rejects other non-bookable products', () => {
    expect(ticketPolicy.isTicketEligibleProduct).toBeDefined();
    if (typeof ticketPolicy.isTicketEligibleProduct !== 'function') return;

    expect(ticketPolicy.isTicketEligibleProduct({ requires_booking: true })).toBe(true);
    expect(ticketPolicy.isTicketEligibleProduct({ requires_booking: false })).toBe(false);
    expect(ticketPolicy.isTicketEligibleProduct({ requires_booking: false, product_places: { relation_type: 'admission' } })).toBe(true);
    expect(ticketPolicy.isTicketEligibleProduct({ requires_booking: false, product_places: [{ relation_type: 'admission' }] })).toBe(true);
    expect(ticketPolicy.isTicketEligibleProduct({ requires_booking: false, product_places: [{ relation_type: 'addon' }] })).toBe(false);
    expect(ticketPolicy.isTicketEligibleProduct({ requires_booking: null })).toBe(false);
    expect(ticketPolicy.isTicketEligibleProduct(null)).toBe(true);
  });
});
