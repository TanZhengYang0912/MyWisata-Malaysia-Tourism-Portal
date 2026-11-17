vi.mock('@/lib/platform/operations-settings', () => ({ ensureCustomEmailDeliveryEnabled: vi.fn().mockResolvedValue(undefined) }));
import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn<(input: Record<string, unknown>) => Promise<{messageId: string; accepted: string[]; rejected: string[]}>>(async () => ({messageId:'test',accepted:['test@example.test'],rejected:[]})) }));
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: mocks.send, close: vi.fn() }) } }));
vi.mock('../config', () => ({ getEmailConfig: () => ({host:'smtp.example.test',port:587,user:'test',pass:'test',from:'test@example.test'}) }));
import { sendCustomVendorEmail } from '../sender';
import { vendorInviteCopy } from '../copy';

describe('admin-reviewed outreach', () => {
  it('uses English invitation text and leaves the reviewed prose unchanged', async () => {
    const copy = vendorInviteCopy('Cake House', true);
    expect(copy.subject).toBe("You're invited to sell at events as Cake House");
    expect(copy.introduction).toContain('Cake House');
    await sendCustomVendorEmail({to:'test@example.test',subject:'Reviewed subject',body:'Reviewed <prose>'});
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({subject:'Reviewed subject',text:'Reviewed <prose>',html:expect.stringContaining('lang="en"')}));
    expect(mocks.send.mock.calls[0][0].html).toContain('Reviewed &lt;prose&gt;');
  });
});
