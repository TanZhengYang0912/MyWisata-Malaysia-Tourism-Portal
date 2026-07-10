import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Route access rules
const PUBLIC_ROUTES   = ['/', '/login', '/register', '/discovery', '/vendors'];
const VENDOR_ROUTES   = ['/vendor'];
const ADMIN_ROUTES    = ['/admin'];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  const isPublic  = PUBLIC_ROUTES.some(r => pathname.startsWith(r));
  const isVendor  = VENDOR_ROUTES.some(r => pathname.startsWith(r));
  const isAdmin   = ADMIN_ROUTES.some(r => pathname.startsWith(r));

  // Redirect unauthenticated users away from protected routes
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Role-based guard for vendor/admin portals.
  // Uses get_my_roles() RPC (SECURITY DEFINER) — direct RLS-filtered SELECT
  // on user_roles returns empty under the anon token in some contexts.
  if (user && (isVendor || isAdmin)) {
    const { data: roles } = await supabase.rpc('get_my_roles');
    const roleNames = (roles ?? []).map(
      (r: { role_name: string }) => r.role_name,
    );

    if (isAdmin && !roleNames.includes('super_admin') && !roleNames.includes('approver')) {
      return NextResponse.redirect(new URL('/discovery', request.url));
    }
    if (isVendor && !roleNames.includes('vendor_owner') && !roleNames.includes('outlet_manager')) {
      return NextResponse.redirect(new URL('/discovery', request.url));
    }
  }

  // Redirect logged-in users away from auth pages
  if (user && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/discovery', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
