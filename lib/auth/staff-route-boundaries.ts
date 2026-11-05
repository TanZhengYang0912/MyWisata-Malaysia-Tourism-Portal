export function safeStaffVerificationNext(value: string | null | undefined): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/admin/dashboard';
  const url = new URL(value, 'https://mylawatan.invalid');
  if (url.pathname !== '/staff' && url.pathname !== '/admin' && !url.pathname.startsWith('/admin/')) return '/admin/dashboard';
  return `${url.pathname}${url.search}`;
}

export function staffVerificationDestination(next: string): string {
  return `/auth/staff-verification?next=${encodeURIComponent(safeStaffVerificationNext(next))}`;
}

export function staffMfaDestination(next: string): string {
  return `/auth/staff-mfa?next=${encodeURIComponent(safeStaffVerificationNext(next))}`;
}

export function isStaffProtectedPath(pathname: string): boolean {
  return ['/admin', '/staff', '/api/admin', '/api/admin-ai'].some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
