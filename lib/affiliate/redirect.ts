// P4 — Member 4: the affiliate redirect. See CLAUDE.md Step 2.
//
// Why the service-role client, not the cookie-aware one:
//   - affiliate_links only has an "own rows" SELECT policy (auth.uid() = user_id),
//     so a referred visitor (almost never the link owner) gets zero rows back
//     under RLS. Resolving a public affiliate code has to bypass that.
//   - affiliate_clicks has RLS disabled, but migration 006 only GRANTs the
//     `anon` Postgres role SELECT on all tables — not INSERT. An anonymous
//     visitor's insert would fail with "permission denied" under the
//     cookie-aware client.
// products and platform_settings both have public-read RLS policies and would
// work with the cookie-aware client, but using one client for the whole
// route keeps this simpler — none of these reads are user-permission-gated,
// an affiliate link is public by design.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { hashVisitorId } from './click';
import { getAttributionCookieDays } from './settings';

const MW_VISITOR_COOKIE = 'mw_visitor';
const MW_REF_COOKIE = 'mw_ref';
const VISITOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year
const SECONDS_PER_DAY = 86400;

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: maxAgeSeconds,
  };
}

/**
 * Resolves an affiliate code (optionally scoped to a product slug), logs the
 * click, sets the visitor/attribution cookies, and redirects. Never throws —
 * on any unexpected failure it falls back to a plain redirect so a broken
 * link never shows the visitor an error page.
 */
export async function handleAffiliateRedirect(
  request: NextRequest,
  code: string,
  slug?: string,
): Promise<NextResponse> {
  const origin = new URL(request.url).origin;

  try {
    const service = createServiceClient();

    const { data: link } = await service
      .from('affiliate_links')
      .select('id')
      .eq('affiliate_code', code)
      .eq('is_active', true)
      .maybeSingle();

    if (!link) {
      return NextResponse.redirect(new URL('/', origin), 302);
    }

    let product: { id: string } | null = null;
    if (slug) {
      const { data } = await service
        .from('products')
        .select('id')
        .eq('slug', slug)
        .eq('status', 'active')
        .maybeSingle();
      product = data ?? null;
    }

    // Cookie-aware client purely to see if the visitor happens to be logged in.
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();

    const visitorId = request.cookies.get(MW_VISITOR_COOKIE)?.value ?? crypto.randomUUID();

    const { data: click, error: clickErr } = await service
      .from('affiliate_clicks')
      .insert({
        link_id: link.id,
        clicker_id: user?.id ?? null,
        target_type: product ? 'product' : null,
        target_id: product?.id ?? null,
        ip_hash: hashVisitorId(visitorId),
      })
      .select('id')
      .single();

    if (clickErr) {
      console.error('[affiliate] click insert failed', clickErr.message);
    }

    const destination = product
      ? new URL(`/customer/activity/${product.id}`, origin)
      : new URL('/customer/explore', origin);

    const response = NextResponse.redirect(destination, 302);

    response.cookies.set(MW_VISITOR_COOKIE, visitorId, cookieOptions(VISITOR_COOKIE_MAX_AGE_SECONDS));

    // No click id means no attribution to reference — leave mw_ref untouched
    // rather than pointing it at nothing.
    if (!clickErr && click) {
      const cookieDays = await getAttributionCookieDays(service);
      response.cookies.set(MW_REF_COOKIE, click.id, cookieOptions(cookieDays * SECONDS_PER_DAY));
    }

    return response;
  } catch (error) {
    console.error('[affiliate] redirect failed', error instanceof Error ? error.message : error);
    return NextResponse.redirect(new URL('/', origin), 302);
  }
}
