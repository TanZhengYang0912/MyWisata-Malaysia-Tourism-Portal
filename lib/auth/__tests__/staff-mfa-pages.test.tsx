import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const setup = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/staff-mfa', () => ({ requireStaffMfaSetup: setup }));
vi.mock('next/navigation', () => ({ redirect: (destination: string) => { throw new Error(`redirect:${destination}`); } }));
vi.mock('@/components/admin/kyc-mfa', () => ({
  KycMfa: ({ available, unavailableReason }: { available: boolean; unavailableReason: string }) => <div data-available={String(available)} data-reason={unavailableReason} />,
}));

const { default: StaffMfaPage } = await import('@/app/auth/staff-mfa/page');
const { default: KycMfaPage } = await import('@/app/admin/kyc/mfa/page');

describe.each([['staff', StaffMfaPage], ['kyc', KycMfaPage]] as const)('%s MFA bootstrap recovery', (_name, Page) => {
  it.each([[403, 'forbidden'], [503, 'unavailable']] as const)('offers the matching recovery for HTTP %s', async (status, reason) => {
    setup.mockResolvedValue({ response: new Response(null, { status }) });
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('data-available="false"');
    expect(html).toContain(`data-reason="${reason}"`);
  });

  it('keeps setup available to authorized staff', async () => {
    setup.mockResolvedValue({ response: null });
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('data-available="true"');
  });

  it('redirects an expired session to sign-in', async () => {
    setup.mockResolvedValue({ response: new Response(null, { status: 401 }) });
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirect:/login');
  });
});
