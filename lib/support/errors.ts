export type SupportErrorAction = 'sign_in' | 'edit_input' | 'retry_read' | 'check_operation' | 'choose_file' | 'contact_support' | 'open_record' | 'reopen_ticket';

const SUPPORT_ERRORS: Record<string, { key: string; action: SupportErrorAction }> = {
  UNAUTHORIZED: { key: 'signIn', action: 'sign_in' },
  VALIDATION_FAILED: { key: 'checkFields', action: 'edit_input' },
  TICKET_LOCKED: { key: 'closed', action: 'reopen_ticket' },
  OPERATION_UNKNOWN: { key: 'checking', action: 'check_operation' },
  READ_UNAVAILABLE: { key: 'readUnavailable', action: 'retry_read' },
  FILE_TOO_LARGE: { key: 'fileTooLarge', action: 'choose_file' },
  INVALID_FILE_TYPE: { key: 'fileType', action: 'choose_file' },
  PAYMENT_STATUS_UNCERTAIN: { key: 'paymentUncertain', action: 'open_record' },
  RATE_LIMITED: { key: 'rateLimited', action: 'contact_support' },
};

export function supportError(code: string): { key: string; action: SupportErrorAction } {
  return SUPPORT_ERRORS[code] ?? { key: 'unavailable', action: 'contact_support' };
}
