import { describe, expect, it } from 'vitest';
import { supportError } from '../errors';

describe('supportError', () => {
  it('maps uncertain writes to checking the operation', () => {
    expect(supportError('OPERATION_UNKNOWN').action).toBe('check_operation');
  });

  it('does not echo unknown internal codes', () => {
    expect(supportError('database_password_failed')).toEqual({ key: 'unavailable', action: 'contact_support' });
  });
});
