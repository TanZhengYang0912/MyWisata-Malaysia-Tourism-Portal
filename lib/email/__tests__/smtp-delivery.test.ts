import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ sendMail: vi.fn(), close: vi.fn(), transport: vi.fn() }));
const settingsMocks = vi.hoisted(() => ({ ensureEnabled: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: mocks.transport } }));
vi.mock('@/lib/platform/operations-settings', () => ({ ensureCustomEmailDeliveryEnabled: settingsMocks.ensureEnabled }));
vi.mock('@/lib/email/config', () => ({ getEmailConfig: () => ({ host: 'smtp.example.test', port: 587, user: 'sender@example.test', pass: 'test-only', from: 'sender@example.test' }) }));
vi.mock('@/lib/pdf/receipt', () => ({ generateReceiptPdf: async () => Buffer.from('synthetic receipt') }));
import { sendStaffInvitationEmail, sendVendorEmail } from '../sender';
import { sendOrderReceiptEmail } from '../order-receipt';

const notice = { eventType: 'vendor_order_update' as const, vendorName: 'Synthetic vendor', reason: 'Synthetic pickup verification', occurredAt: '2026-10-14T00:00:00Z', to: 'synthetic@example.test' };
describe('SMTP is behind the durable delivery boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    settingsMocks.ensureEnabled.mockResolvedValue(undefined);
    mocks.transport.mockReturnValue({ sendMail: mocks.sendMail, close: mocks.close });
    mocks.sendMail.mockResolvedValue({ accepted: ['synthetic@example.test'], rejected: [], messageId: '<test@example.test>' });
  });
  it.each([
    { accepted: [], rejected: ['synthetic@example.test'] },
    { accepted: [], rejected: [] },
    { accepted: ['synthetic@example.test'], rejected: ['other@example.test'] },
  ])('rejects unconfirmed direct staff invitation delivery: %j', async (result) => {
    mocks.sendMail.mockResolvedValue({ ...result, messageId: '<test@example.test>' });
    await expect(sendStaffInvitationEmail({
      to: 'synthetic@example.test', roleName: 'Wallet Reviewer',
      permissionKeys: ['admin.withdrawal.approve'],
      invitationUrl: 'https://example.test/staff-invitations/synthetic',
      expiresAt: '2026-10-30T00:00:00Z',
    })).rejects.toThrow('email_delivery_not_confirmed');
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it('never submits SMTP if the claim cannot start', async () => {
    await expect(sendVendorEmail({ ...notice, delivery: { messageId: '<test@example.test>', beforeSend: async () => { throw new Error('lost claim'); } } })).rejects.toThrow('email_delivery_retryable');
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it('records the start before SMTP and supplies a stable correlation ID', async () => {
    const beforeSend = vi.fn();
    mocks.sendMail.mockImplementation(async () => { expect(beforeSend).toHaveBeenCalledOnce(); return { accepted: ['synthetic@example.test'], rejected: [], messageId: '<test@example.test>' }; });
    expect(await sendVendorEmail({ ...notice, delivery: { messageId: '<test@example.test>', beforeSend } })).toEqual({ id: '<test@example.test>' });
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ messageId: '<test@example.test>' }));
  });
  it('preserves uncertainty and removes SMTP details after DATA timeout', async () => {
    mocks.sendMail.mockRejectedValue({ code: 'ETIMEDOUT', command: 'DATA', message: 'private recipient and SMTP details' });
    await expect(sendVendorEmail({ ...notice, delivery: { messageId: '<test@example.test>', beforeSend: async () => {} } })).rejects.toMatchObject({ retrySafe: false, message: 'email_delivery_unknown' });
  });
  it('rejects a direct PDF receipt when SMTP accepts no recipients', async () => {
    mocks.sendMail.mockResolvedValue({ accepted: [], rejected: ['synthetic@example.test'], messageId: '<test@example.test>' });
    await expect(sendOrderReceiptEmail({ orderId: 'synthetic-order', recipientName: 'Synthetic buyer', createdAt: '2026-10-24T00:00:00Z', paymentMethod: 'wallet', items: [], subtotal: 0, discount: 0, total: 0, recipientEmail: 'synthetic@example.test' })).rejects.toThrow('email_delivery_not_confirmed');
  });
  it('keeps Guest receipt SMTP behind the same boundary', async () => {
    const beforeSend = vi.fn();
    expect(await sendOrderReceiptEmail({ orderId: 'synthetic-order', recipientName: 'Synthetic Guest', createdAt: '2026-10-14T00:00:00Z', paymentMethod: 'free_reservation', items: [], subtotal: 0, discount: 0, total: 0, recipientEmail: 'synthetic@example.test', delivery: { messageId: '<test@example.test>', beforeSend } })).toEqual({ id: '<test@example.test>' });
    expect(beforeSend).toHaveBeenCalledOnce();
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ messageId: '<test@example.test>' }));
  });
  it('blocks direct custom SMTP sends before creating a transport when paused', async () => {
    settingsMocks.ensureEnabled.mockRejectedValue(new Error('custom_email_delivery_paused'));
    await expect(sendVendorEmail(notice)).rejects.toThrow('custom_email_delivery_paused');
    expect(mocks.transport).not.toHaveBeenCalled();
    await expect(sendOrderReceiptEmail({ orderId: 'synthetic-order', recipientName: 'Synthetic Guest', createdAt: '2026-10-14T00:00:00Z', paymentMethod: 'free_reservation', items: [], subtotal: 0, discount: 0, total: 0, recipientEmail: 'synthetic@example.test' })).rejects.toThrow('custom_email_delivery_paused');
    expect(mocks.transport).not.toHaveBeenCalled();
  });
});
