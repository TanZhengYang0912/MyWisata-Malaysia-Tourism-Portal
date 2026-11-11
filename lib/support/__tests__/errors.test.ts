import { describe, expect, it } from 'vitest';
import { supportError } from '../errors';

describe('supportError', () => {
  it('maps uncertain writes to checking the operation', () => {
    expect(supportError('OPERATION_UNKNOWN').action).toBe('check_operation');
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
});
