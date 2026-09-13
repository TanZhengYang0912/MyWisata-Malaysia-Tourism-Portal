import { describe, expect, it } from 'vitest';

import {
  isMissingProductTicketAdmissionSchemaError,
  resolveProductTicketAdmission,
} from '../product-ticket-policy';

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
});
