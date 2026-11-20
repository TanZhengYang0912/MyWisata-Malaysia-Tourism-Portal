import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_COOKIE, resolveAppLocale } from '@/lib/i18n/locale';
import { staffAssurance } from '@/lib/auth/staff-assurance';
import { staffPasskeyEnforcementEnabled } from '@/lib/auth/staff-passkey-config';
import { isStaffProtectedPath, staffMfaDestination, staffVerificationDestination } from '@/lib/auth/staff-route-boundaries';
import { pickDemoRole } from '@/lib/auth/demo-user-role';
import { roleHomePath } from '@/lib/auth/post-login-destination';

const localeCookieOptions = {
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
};

const ADMIN_PAGE = /^\/admin(\/|$)/;
const ADMIN_API = /^\/api\/admin(-ai)?(\/|$)/;
const MFA_SETUP_PAGES = ['/admin/security', '/admin/kyc/mfa'];

/**
 * Staff surfaces need an authenticator-verified (aal2) session: admin pages
 * redirect to the setup/verify page, admin APIs refuse. Signed-out requests are
 * left to each route's own sign-in handling. The database role functions enforce
 * the same rule for direct Supabase calls.
 * Plan: Docs/plans/2026-10-14-1543-staff-two-factor-login.md
 */
export function adminAssuranceGate(pathname: string, claims: { sub?: unknown; aal?: unknown } | null | undefined): 'page' | 'api' | null {
  if (typeof claims?.sub !== 'string' || !claims.sub || claims.aal === 'aal2') return null;
  if (ADMIN_API.test(pathname)) return 'api';
  if (ADMIN_PAGE.test(pathname) && !MFA_SETUP_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`))) return 'page';
  return null;
}

/**
 * Where `/` sends a visitor, or null to fall through to the client fallback in
 * app/page.tsx. `roleRows` is null when the role lookup failed. Matches that
 * fallback and the auth callback: guests and role-less accounts browse
 * /customer; everyone else goes to the home of their highest-priority role.
 */
export function rootEntryDestination(
  isSignedIn: boolean,
  roleRows: Array<{ role_name?: string | null }> | null,
): string | null {
  if (!isSignedIn) return '/customer';
  if (!roleRows) return null;
  if (roleRows.length === 0) return '/customer';
  return roleHomePath(pickDemoRole(roleRows.map((row) => ({ roles: { name: row.role_name } }))));
}

/**
 * Keep the Supabase session cookie fresh before Next renders a page or calls a
 * protected route. Server Components cannot reliably write refreshed cookies,
 * so this must run in the request Proxy.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const forwardedHeaders = new Headers(request.headers);
  const pendingCookies: Array<{ name: string; value: string; options?: Record<string, unknown> }> = [];
  const responseHeaders = new Headers();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            pendingCookies.push({ name, value, options: options as Record<string, unknown> });
          });

          const requestCookieHeader = request.headers.get('cookie');
          if (requestCookieHeader === null) forwardedHeaders.delete('cookie');
          else forwardedHeaders.set('cookie', requestCookieHeader);

          Object.entries(headers).forEach(([key, value]) => responseHeaders.set(key, value));
        },
      },
    },
  );

  // getClaims validates the access token and refreshes it when necessary.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  const fetchDestination = request.headers.get('sec-fetch-dest');
  const isPageRead = request.method === 'GET'
    && !request.nextUrl.pathname.startsWith('/api/')
    && (fetchDestination === 'document' || !fetchDestination || request.headers.get('rsc') === '1');
  const isPrefetch = request.headers.has('next-router-prefetch') || request.headers.get('purpose') === 'prefetch';
  const isDocumentNavigation = isPageRead && !isPrefetch && fetchDestination === 'document';
  const gate = adminAssuranceGate(request.nextUrl.pathname, claims);
  const isRootEntry = !gate && request.nextUrl.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD');
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  let accountLocale: unknown;
  // The account language is read once per full page load, which also writes it to
  // the locale cookie; in-app navigations then use that cookie, and a change saved
  // on this device sets the cookie itself. `/` only redirects, so it never needs it.
  if (typeof claims?.sub === 'string' && claims.sub && claims.is_anonymous !== true && isDocumentNavigation && !isRootEntry) {
    try {
      const { data, error } = await supabase.rpc('get_my_preferred_locale');
      if (!error) accountLocale = data;
    } catch {
      // Keep navigation available if the account preference cannot be read.
    }
  }
  const locale = resolveAppLocale({
    accountLocale,
    cookieLocale,
    acceptLanguage: request.headers.get('accept-language'),
  });

  forwardedHeaders.set('x-app-locale', locale);
  // The root layout picks which translations to inline from this; set, never trust the client's.
  forwardedHeaders.set('x-app-pathname', request.nextUrl.pathname);
  let supabaseResponse = gate === 'api'
    ? NextResponse.json({ data: null, error: { code: 'MFA_REQUIRED', message: 'Authenticator verification required' } }, { status: 403 })
    : gate === 'page'
      ? NextResponse.redirect(new URL(staffMfaDestination(request.nextUrl.pathname + request.nextUrl.search), request.url))
      : NextResponse.next({ request: { headers: forwardedHeaders } });
  if (!gate && isStaffProtectedPath(request.nextUrl.pathname) && staffPasskeyEnforcementEnabled()) {
    try {
      const status = claims?.sub ? await staffAssurance(supabase) : null;
      if (!status?.required || !status.verified) {
        supabaseResponse = request.nextUrl.pathname.startsWith('/api/')
          ? NextResponse.json({ data: null, error: { code: 'STAFF_PASSKEY_REQUIRED', message: 'Password and Passkey verification required' } }, { status: claims?.sub ? 403 : 401 })
          : NextResponse.redirect(new URL(claims?.sub ? staffVerificationDestination(request.nextUrl.pathname + request.nextUrl.search) : '/login', request.url));
      }
    } catch {
      supabaseResponse = request.nextUrl.pathname.startsWith('/api/')
        ? NextResponse.json({ data: null, error: { code: 'AUTHORIZATION_UNAVAILABLE', message: 'Staff verification unavailable' } }, { status: 503 })
        : NextResponse.redirect(new URL(staffVerificationDestination(request.nextUrl.pathname + request.nextUrl.search), request.url));
    }
    supabaseResponse.headers.set('Cache-Control', 'private, no-store');
  }
  // `/` is redirected here rather than with redirect() in app/page.tsx: the root
  // loading.tsx makes a page redirect a streamed client-side meta refresh, while
  // this is a 307 sent before any HTML or JavaScript.
  if (isRootEntry) {
    const isSignedIn = typeof claims?.sub === 'string' && claims.sub.length > 0;
    let roleRows: Array<{ role_name?: string | null }> | null = null;
    if (isSignedIn) {
      const { data, error } = await supabase.rpc('get_my_roles');
      roleRows = error ? null : (data ?? []) as Array<{ role_name?: string | null }>;
    }
    const destination = rootEntryDestination(isSignedIn, roleRows);
    if (destination) {
      supabaseResponse = NextResponse.redirect(new URL(destination, request.url));
      // The destination depends on the session cookie; never let a shared cache keep it.
      supabaseResponse.headers.set('Cache-Control', 'private, no-store');
    }
  }


  responseHeaders.forEach((value, key) => supabaseResponse.headers.set(key, value));
  pendingCookies.forEach(({ name, value, options }) =>
    supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2]),
  );
  // Background responses may finish after /api/locale saves a newer preference.
  // Only full document navigations initialize/sync this cookie; RSC and API
  // reads still receive x-app-locale without persisting an older request snapshot.
  if (isDocumentNavigation && cookieLocale !== locale) {
    supabaseResponse.cookies.set(LOCALE_COOKIE, locale, localeCookieOptions);
  }

  return supabaseResponse;
}
