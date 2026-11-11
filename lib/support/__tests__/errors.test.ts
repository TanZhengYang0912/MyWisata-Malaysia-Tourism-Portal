import { describe, expect, it } from 'vitest';
import { supportError, supportTicketCreateFailure, supportTicketLoadFailure } from '../errors';

describe('supportError', () => {
  it('maps uncertain writes to checking the operation', () => {
    expect(supportError('OPERATION_UNKNOWN').action).toBe('check_operation');
    expect(supportError('WRITE_UNAVAILABLE')).toEqual({ key: 'checking', action: 'check_operation' });
  });

  it('does not echo unknown internal codes', () => {
    expect(supportError('database_password_failed')).toEqual({ key: 'unavailable', action: 'contact_support' });
  });

  it('gives recovery actions for missing, inaccessible, invalid, and throttled requests', () => {
    expect(supportError('NOT_FOUND').action).toBe('return_to_list');
    expect(supportError('FORBIDDEN').action).toBe('return_to_list');
    expect(supportError('INVALID_FILE_CONTENT').action).toBe('choose_file');
    expect(supportError('INVALID_CAPTION').action).toBe('edit_input');
    expect(supportError('RATE_LIMITED').action).toBe('wait');
  });

  it('offers a retry for temporary reads and treats only confirmed access failures as unavailable', () => {
    expect(supportTicketLoadFailure('READ_UNAVAILABLE')).toBe('retry');
    expect(supportTicketLoadFailure(undefined)).toBe('retry');
    expect(supportTicketLoadFailure('NOT_FOUND')).toBe('not_found');
    expect(supportTicketLoadFailure('FORBIDDEN')).toBe('not_found');
  });
});

describe('supportTicketCreateFailure', () => {
  it('keeps uncertain writes behind result checking', () => {
    expect(supportTicketCreateFailure(503, 'WRITE_UNAVAILABLE')).toBe('unknown');
    expect(supportTicketCreateFailure(409, 'OPERATION_CONFLICT')).toBe('unknown');
  });

  it('surfaces a confirmed withdrawal state change as a recoverable business outcome', () => {
    expect(supportTicketCreateFailure(409, 'INVALID_STATE')).toBe('withdrawal_no_longer_on_hold');
    expect(supportTicketCreateFailure(422, 'VALIDATION_FAILED')).toBe('known');
  });
});
