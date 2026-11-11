export type SupportErrorAction = 'sign_in' | 'edit_input' | 'retry_read' | 'check_operation' | 'choose_file' | 'contact_support' | 'open_record' | 'reopen_ticket' | 'return_to_list' | 'wait' | 'review_handoff';

const SUPPORT_ERRORS: Record<string, { key: string; action: SupportErrorAction }> = {
  UNAUTHORIZED: { key: 'signIn', action: 'sign_in' },
  VALIDATION_FAILED: { key: 'checkFields', action: 'edit_input' },
  INVALID_INPUT: { key: 'checkFields', action: 'edit_input' },
  INVALID_FORM: { key: 'checkFields', action: 'edit_input' },
  INVALID_CAPTION: { key: 'checkFields', action: 'edit_input' },
  NOT_FOUND: { key: 'notFound', action: 'return_to_list' },
  FORBIDDEN: { key: 'notAvailable', action: 'return_to_list' },
  CONFLICT: { key: 'conflict', action: 'retry_read' },
  OPERATION_CONFLICT: { key: 'conflict', action: 'edit_input' },
  TICKET_LOCKED: { key: 'closed', action: 'reopen_ticket' },
  HANDOFF_REVIEW_REQUIRED: { key: 'handoffChanged', action: 'review_handoff' },
  PREVIEW_UNAVAILABLE: { key: 'handoffChanged', action: 'review_handoff' },
  OPERATION_UNKNOWN: { key: 'checking', action: 'check_operation' },
  READ_UNAVAILABLE: { key: 'readUnavailable', action: 'retry_read' },
  WRITE_UNAVAILABLE: { key: 'checking', action: 'check_operation' },
  FILE_TOO_LARGE: { key: 'fileTooLarge', action: 'choose_file' },
  INVALID_FILE_TYPE: { key: 'fileType', action: 'choose_file' },
  INVALID_FILE_CONTENT: { key: 'fileContent', action: 'choose_file' },
  MISSING_FILE: { key: 'chooseFile', action: 'choose_file' },
  ATTACHMENT_UNAVAILABLE: { key: 'fileContent', action: 'choose_file' },
  UPLOAD_FAILED: { key: 'uploadFailed', action: 'choose_file' },
  PAYMENT_STATUS_UNCERTAIN: { key: 'paymentUncertain', action: 'open_record' },
  RATE_LIMITED: { key: 'rateLimited', action: 'wait' },
};

export function supportError(code: string): { key: string; action: SupportErrorAction } {
  return SUPPORT_ERRORS[code] ?? { key: 'unavailable', action: 'contact_support' };
}

export function supportTicketLoadFailure(code: string | undefined): 'not_found' | 'retry' {
  return code === 'NOT_FOUND' || code === 'FORBIDDEN' ? 'not_found' : 'retry';
}
