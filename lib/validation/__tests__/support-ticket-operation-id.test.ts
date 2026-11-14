import { describe, expect, it } from 'vitest';
import { supportTicketSchema } from '../chatbot-schemas';

describe('supportTicketSchema operation id', () => {
  it('requires an operation id when a withdrawal is linked', () => {
    expect(supportTicketSchema.safeParse({
      withdrawalId: 'bd1e6bc6-2e6e-4419-bbd8-9b510575ef23',
      subject: 'Withdrawal update',
      body: 'Please check this withdrawal.',
    }).success).toBe(false);
  });

  it('accepts a withdrawal ticket with its stable operation id', () => {
    expect(supportTicketSchema.safeParse({
      withdrawalId: 'bd1e6bc6-2e6e-4419-bbd8-9b510575ef23',
      operationId: '9e93f6a7-a11a-47b0-87bd-619e2481190a',
      subject: 'Withdrawal update',
      body: 'Please check this withdrawal.',
    }).success).toBe(true);
  });
});
