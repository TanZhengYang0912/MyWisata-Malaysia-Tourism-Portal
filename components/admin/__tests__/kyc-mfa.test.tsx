import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { findElements, installTestDom, TestEvent } from '@/components/shared/__tests__/render-test-dom';
const mfa = vi.hoisted(() => ({ listFactors: vi.fn(), unenroll: vi.fn(), enroll: vi.fn() }));
const signOut = vi.hoisted(() => vi.fn());
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { mfa, signOut } }) }));
vi.mock('@/components/shared/language-switcher', () => ({ LanguageSwitcher: () => <button aria-label="Language">English</button> }));
vi.mock('@/components/customer/customer-site-footer', () => ({ CustomerSiteFooter: () => <footer data-site-footer="slim">Legal links</footer> }));
// Image preloading needs a browser DOM; these tests exercise account recovery.
vi.mock('next/image', () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
const { KycMfa, STAFF_CODE_INPUT_CLASS } = await import('../kyc-mfa');
const { Input } = await import('@/components/ui/input');
describe('KYC MFA entry', () => {
  it.each([
    { failed: false, next: '/admin/reports/reconciliation', destination: '/admin/reports/reconciliation' },
    { failed: true, next: '/admin/reports/reconciliation', destination: '/admin/reports/reconciliation' },
    { failed: false, next: 'https://untrusted.example/', destination: '/admin/dashboard' },
  ])('recovers a forbidden account with failed=$failed, next=$next', async ({ failed, next, destination }) => {
    signOut.mockReset();
    signOut.mockResolvedValue({ error: failed ? new Error('private auth error') : null });
    const document = installTestDom();
    navigation.push.mockReset();
    Object.defineProperty(window, 'location', { value: { href: 'http://localhost/', origin: 'http://localhost' }, configurable: true });
    const { createRoot } = await import('react-dom/client');
    const container = document.createElement('div');
    const root = createRoot(container as unknown as Element);
    try {
      await act(async () => root.render(<KycMfa next={next} scope="staff" available={false} unavailableReason="forbidden" />));
      expect(container.textContent).toContain('kyc.mfa.staffAccountRequired');
      const switchAccount = findElements(container, node => node.tagName === 'BUTTON' && node.textContent === 'kyc.mfa.switchAccount')[0];
      expect(switchAccount).toBeDefined();
      await act(async () => switchAccount.dispatchEvent(new TestEvent('click', { bubbles: true })));
      expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
      if (failed) {
        expect(navigation.push).not.toHaveBeenCalled();
        expect(container.textContent).toContain('kyc.mfa.switchAccountError');
        expect(container.textContent).not.toContain('private auth error');
      } else {
        expect(navigation.push).toHaveBeenCalledWith(`/login?next=${encodeURIComponent(destination)}`);
      }
    } finally { await act(async () => root.unmount()); }
  });

  it('offers a reload for unavailable authorization without starting factor setup', async () => {
    mfa.listFactors.mockClear(); mfa.enroll.mockClear(); mfa.unenroll.mockClear();
    const document = installTestDom();
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { value: { reload, href: "http://localhost/", origin: "http://localhost" }, configurable: true });
    const { createRoot } = await import('react-dom/client');
    const container = document.createElement('div');
    const root = createRoot(container as unknown as Element);
    try {
      await act(async () => root.render(<KycMfa next="/admin/dashboard" scope="staff" available={false} unavailableReason="unavailable" />));
      const retry = findElements(container, node => node.tagName === 'BUTTON' && node.textContent === 'kyc.mfa.retry')[0];
      expect(retry).toBeDefined();
      await act(async () => retry.dispatchEvent(new TestEvent('click', { bubbles: true })));
      expect(reload).toHaveBeenCalledOnce();
      expect(mfa.listFactors).not.toHaveBeenCalled();
      expect(mfa.enroll).not.toHaveBeenCalled();
      expect(mfa.unenroll).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); }
  });

  it('distinguishes wrong-account recovery from a temporary setup failure', () => {
    const html = renderToStaticMarkup(<KycMfa next="/admin/dashboard" scope="staff" available={false} unavailableReason="forbidden" />);
    expect(html).toContain('kyc.mfa.staffAccountRequired');
    expect(html).not.toContain('kyc.mfa.setupError');
  });

  it('keeps the staff code field invisible while a code is being verified', () => {
    const html = renderToStaticMarkup(<Input disabled className={STAFF_CODE_INPUT_CLASS} />);
    const classes = html.match(/class="([^"]*)"/)?.[1].split(' ') ?? [];
    expect(classes).toContain('opacity-0');
    expect(classes).toContain('disabled:opacity-0');
    expect(classes).not.toContain('disabled:opacity-50');
  });
  it('reuses the original ceremony with staff-wide copy without generating any factor', () => {
    const html = renderToStaticMarkup(<KycMfa next="/admin/promotion-campaigns" scope="staff" />);
    expect(html).toContain('staffMfa.title');
    expect(html).toContain('data-brand-logo="mylawatan"');
    expect(html).toContain('data-site-footer="slim"');
    expect(html).toContain('aria-label="Language"');
    expect(html).not.toContain('var(--font-display)');
    expect((html.match(/<main/g) ?? []).length).toBe(1);
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).toContain('kyc.mfa.start');
    expect(html).not.toContain('data:image');
    expect(html).not.toContain('otpauth');
  });
  it('renders an explicit user-initiated setup action without pre-generating a secret', () => {
    const html = renderToStaticMarkup(<KycMfa next="/admin/kyc" />);
    expect(html).toContain('kyc.mfa.start');
    expect(html).not.toContain('data-brand-logo="mylawatan"');
    expect(html).not.toContain('data:image');
    expect(html).not.toContain('otpauth');
  });

  it('recognizes abandoned factors under either spelling and enrolls with the canonical brand', async () => {
    mfa.listFactors.mockResolvedValue({ data: { totp: [], all: [
      { id: 'old', factor_type: 'totp', status: 'unverified', friendly_name: 'MyLawatan KYC' },
      { id: 'current', factor_type: 'totp', status: 'unverified', friendly_name: 'MYLawatan KYC' },
      { id: 'other', factor_type: 'totp', status: 'unverified', friendly_name: 'Other application' },
    ] }, error: null });
    mfa.unenroll.mockResolvedValue({ error: null });
    mfa.enroll.mockResolvedValue({ data: { id: 'new', type: 'totp', totp: { qr_code: 'data:image/svg+xml;base64,PHN2Zy8+' } }, error: null });
    const document = installTestDom();
    const { createRoot } = await import('react-dom/client');
    const container = document.createElement('div');
    const root = createRoot(container as unknown as Element);
    try {
      await act(async () => root.render(<KycMfa next="/admin/kyc" />));
      const start = findElements(container, node => node.tagName === 'BUTTON' && node.textContent === 'kyc.mfa.start')[0];
      expect(start).toBeDefined();
      await act(async () => start.dispatchEvent(new TestEvent('click', { bubbles: true })));
      expect(mfa.unenroll.mock.calls).toEqual([[{ factorId: 'old' }], [{ factorId: 'current' }]]);
      expect(mfa.enroll).toHaveBeenCalledWith({ factorType: 'totp', friendlyName: 'MYLawatan KYC', issuer: 'MYLawatan' });
    } finally { await act(async () => root.unmount()); }
  });
});
