import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const layoutSource = readFileSync(
  resolve(process.cwd(), 'app/admin/layout.tsx'),
  'utf8',
);
const sharedSidebarSource = readFileSync(
  resolve(process.cwd(), 'components/layout/portal-sidebar.tsx'),
  'utf8',
);
const moduleMigrationSource = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260915222000_dynamic_staff_modules.sql'),
  'utf8',
);

describe('admin navigation shell', () => {
  it('routes approvers away from unrelated pages and does not poll support unread counts', () => {
    expect(layoutSource).toContain('if (!staffAccessReady || !currentUser || currentUser.role === "approver") return;');
    expect(layoutSource).toContain('router.replace(currentUser.role === "staff" ? "/staff" : navigationHrefs[0] ?? "/login")');
    expect(moduleMigrationSource).toContain("('withdrawals', 'approver', TRUE)");
    expect(readFileSync(resolve(process.cwd(), 'app/page.tsx'), 'utf8')).toContain('approver: "/admin/withdrawals"');
  });

  it('keeps the sidebar fixed while the navigation list can scroll independently', () => {
    expect(layoutSource).toContain('className="flex h-screen overflow-hidden"');
    expect(layoutSource).toContain('<PortalSidebar');
    expect(layoutSource).toMatch(/<PortalSidebar[\s\S]*?sections={sidebarSections}[\s\S]*?fixed/);
    expect(sharedSidebarSource).toContain('w-60');
    expect(sharedSidebarSource).toContain('min-h-0 flex-1 overflow-y-auto');
    expect(layoutSource).toContain('className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto lg:ml-60"');
  });

  it('provides a localized label for the staff conduct navigation item', () => {
    expect(moduleMigrationSource).toContain("('staff_conduct', 'Staff Conduct', 'navigation.Staff Conduct'");
    expect(readFileSync(resolve(process.cwd(), 'app/i18n/locales/en/admin.json'), 'utf8')).toContain('"Staff Conduct": "Staff Conduct"');
    expect(readFileSync(resolve(process.cwd(), 'app/i18n/locales/zh-CN/admin.json'), 'utf8')).toContain('"Staff Conduct": "员工行为"');
    expect(readFileSync(resolve(process.cwd(), 'app/i18n/locales/ms/admin.json'), 'utf8')).toContain('"Staff Conduct": "Tatakelakuan"');
  });

  it('uses a real sign-out action in the sticky toolbar', () => {
    expect(layoutSource).toContain('await supabase.auth.signOut();');
    expect(layoutSource).toContain('tCommon("actions.signOut")');
    expect(layoutSource).toMatch(/<header className="sticky top-0 z-40[\s\S]*?<button[\s\S]*?aria-label={tCommon\("actions\.signOut"\)}/);
    expect(layoutSource).not.toContain('> Switch account</Link>');
  });

  it('exposes the same personal notification inbox to every signed-in Admin staff role', () => {
    expect(layoutSource).toContain('pathname !== "/admin/notifications"');
    expect(layoutSource).toContain('staffPermissionKeys.includes("admin.withdrawal.approve") && <NotificationBell scope="staff" allHref="/admin/notifications" />');
    expect(readFileSync(resolve(process.cwd(), 'app/admin/notifications/page.tsx'), 'utf8')).toContain('<NotificationCenter scope="staff"');
  });

  it('polls one shared queue-count endpoint and renders the same pending badge for review nav items', () => {
    expect(layoutSource).toContain('/api/admin/navigation/counts');
    expect(layoutSource).toContain('pendingCountFor');
    expect(layoutSource).toContain('accessibility.pendingItems');
    expect(layoutSource).toContain('currentCounts.catalogue');
    expect(layoutSource).toContain('currentCounts.withdrawals');
    expect(layoutSource).toContain('currentCounts.chatReports');
    expect(layoutSource).not.toContain('currentUser.role === "staff" ? 0');
    expect(layoutSource).not.toContain('!staffAccessReady || !currentUser || currentUser.role === "staff"');
  });

  it('shows content-review queues only to content reviewers and withdrawals only to wallet approvers', () => {
    expect(layoutSource).toContain('staffNavigationSections(staffModules)');
    expect(layoutSource).not.toContain('CONTENT_REVIEW_ROLES');
    expect(layoutSource).not.toContain('WITHDRAWAL_REVIEW_ROLES');
    expect(moduleMigrationSource).toContain("('kyc_review', 'admin', TRUE)");
    expect(moduleMigrationSource).toContain("('withdrawals', 'approver', TRUE)");
  });

  it('exposes wallet approver governance only to super admins', () => {
    expect(moduleMigrationSource).toContain("'wallet_approvers', 'Wallet Approvers'");
    expect(moduleMigrationSource).not.toMatch(/\('wallet_approvers', '(?:admin|approver|staff)',/);
  });

  it('exposes one unified Access Control destination only to super admins', () => {
    expect(moduleMigrationSource).toContain("'access_control', 'Access Control'");
    expect(moduleMigrationSource).not.toMatch(/\('access_control', '(?:admin|approver|staff)',/);
    expect(moduleMigrationSource).not.toMatch(/'\/admin\/(?:entitlements|audit-log)'/);
  });

  it('keeps the sidebar separators subtle and leaves the toolbar visually open', () => {
    expect(sharedSidebarSource).toContain('border-b border-white/10 px-4 py-4');
    expect(sharedSidebarSource).toContain('data-portal-sidebar="true"');
    expect(sharedSidebarSource).toContain('bg-slate-800');
    expect(layoutSource).toContain('className="sticky top-0 z-40 flex h-16 items-center justify-end gap-2 bg-background/95 pl-16 pr-4 backdrop-blur-md sm:pr-6 lg:pl-6"');
    expect(layoutSource).not.toContain('border-b-2 border-gray-200');
  });

  it('keeps search and permitted notifications reachable beside compact mobile actions', () => {
    expect(layoutSource).toContain('<AdminMobileActions');
    expect(layoutSource).toContain('lg:hidden');
    expect(layoutSource).toContain('hidden items-center gap-2 lg:flex');
    expect(layoutSource).toContain('aria-label={tCommon("command.openPalette")}');
    expect(layoutSource).toContain('staffPermissionKeys.includes("admin.withdrawal.approve") && <NotificationBell scope="staff" allHref="/admin/notifications" />');
  });

  it('keeps the responsive breakpoint and staff security destination connected', () => {
    expect(layoutSource).toContain('<div className="lg:hidden">');
    expect(layoutSource).toContain('manageDevicesHref={staffPasskeyRequired ? staffVerificationDestination(pathname) : ""}');
    expect(layoutSource).toContain('<div className="hidden items-center gap-2 lg:flex">');
    expect(readFileSync(resolve(process.cwd(), 'components/admin/admin-mobile-actions.tsx'), 'utf8')).toContain('href={manageDevicesHref}');
  });
});
