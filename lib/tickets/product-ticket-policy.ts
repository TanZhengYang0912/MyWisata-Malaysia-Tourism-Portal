export const TICKET_ENTRY_POLICIES = ['single_entry', 'group_entry', 'multi_entry'] as const;

export type TicketEntryPolicy = typeof TICKET_ENTRY_POLICIES[number];

export type ProductTicketAdmissionInput = {
  requiresBooking: boolean;
  ticketEntryPolicy?: TicketEntryPolicy | null;
  ticketEntryLimit?: number | null;
  ticketValidityDays?: number | null;
};

export type ProductTicketAdmissionConfig = {
  ticketEntryPolicy: TicketEntryPolicy;
  ticketEntryLimit: number;
  ticketValidityDays: number | null;
};

export const DEFAULT_PRODUCT_TICKET_ADMISSION: ProductTicketAdmissionConfig = {
  ticketEntryPolicy: 'single_entry',
  ticketEntryLimit: 1,
  ticketValidityDays: null,
};

/**
 * The ticket-admission migration is additive. This narrow detector lets API
 * reads keep legacy products usable while an environment is awaiting it.
 */
export function isMissingProductTicketAdmissionSchemaError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
      ? error.message
      : '';
  const normalized = message.toLowerCase();

  return normalized.includes('does not exist')
    && ['ticket_entry_policy', 'ticket_entry_limit', 'ticket_validity_days']
      .some((column) => normalized.includes(column));
}

export function isDefaultProductTicketAdmission(config: ProductTicketAdmissionConfig): boolean {
  return config.ticketEntryPolicy === DEFAULT_PRODUCT_TICKET_ADMISSION.ticketEntryPolicy
    && config.ticketEntryLimit === DEFAULT_PRODUCT_TICKET_ADMISSION.ticketEntryLimit
    && config.ticketValidityDays === DEFAULT_PRODUCT_TICKET_ADMISSION.ticketValidityDays;
}

/**
 * Normalises product ticket settings before they are persisted. Product records
 * remain the source of truth; checkout only receives the resulting pass policy.
 */
export function resolveProductTicketAdmission(
  input: ProductTicketAdmissionInput,
): { ok: true; value: ProductTicketAdmissionConfig } | { ok: false; message: string } {
  if (!input.requiresBooking) {
    return {
      ok: true,
      value: DEFAULT_PRODUCT_TICKET_ADMISSION,
    };
  }

  const ticketEntryPolicy = input.ticketEntryPolicy ?? 'single_entry';
  const ticketEntryLimit = Math.floor(input.ticketEntryLimit ?? 1);
  const ticketValidityDays = input.ticketValidityDays == null ? null : Math.floor(input.ticketValidityDays);

  if (ticketEntryPolicy === 'single_entry') {
    return {
      ok: true,
      value: { ticketEntryPolicy, ticketEntryLimit: 1, ticketValidityDays: null },
    };
  }

  if (ticketEntryLimit < 2) {
    return { ok: false, message: 'Group and multi-entry tickets must include at least two admissions.' };
  }

  if (ticketEntryPolicy === 'multi_entry') {
    if (ticketValidityDays == null || ticketValidityDays < 1 || ticketValidityDays > 365) {
      return { ok: false, message: 'Multi-entry tickets need a validity period between 1 and 365 days.' };
    }
    return { ok: true, value: { ticketEntryPolicy, ticketEntryLimit, ticketValidityDays } };
  }

  return { ok: true, value: { ticketEntryPolicy, ticketEntryLimit, ticketValidityDays: null } };
}
