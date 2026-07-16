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

// Link-unfurling bots fetch the raw /r/[code] URL server-side to build a
// share-card preview — every one of those hits was previously logged as a
// real click and got a real mw_visitor/mw_ref cookie pair, so a single
// share inflated click counts (and could even pollute fraud-sweep signals)
// with zero human involvement. Substrings, matched case-insensitively
// against the User-Agent header. Deliberately not exhaustive — these are
// the ones actually named as a problem; add more here if a new one shows
// up in the click log with an obviously-bot UA.
const CRAWLER_USER_AGENT_SUBSTRINGS = [
  'whatsapp',
  'facebookexternalhit',
  'facebot', // Facebook's other crawler UA, used by some of its own products
  'telegrambot',
  'twitterbot',
  'slackbot',
  'googlebot',
];

function isKnownCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return CRAWLER_USER_AGENT_SUBSTRINGS.some((needle) => ua.includes(needle));
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface OgPreview {
  title: string;
  description: string;
  image: string | null;
  url: string;
}

/**
 * A minimal, self-contained HTML document carrying only OG/Twitter-card meta
 * tags — no click logging, no cookies, nothing product-page-shaped. Crawlers
 * read these tags directly from whatever URL they fetch; they generally do
 * NOT execute JS and often don't follow redirects the way a browser does, so
 * this has to be served AT the /r/[code] URL itself rather than relying on
 * them landing on the real activity page after a 302.
 */
function renderOgPreview(preview: OgPreview): NextResponse {
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(preview.title)}</title>
<meta property="og:title" content="${escapeHtml(preview.title)}">
<meta property="og:description" content="${escapeHtml(preview.description)}">
<meta property="og:url" content="${escapeHtml(preview.url)}">
<meta property="og:type" content="website">
${preview.image ? `<meta property="og:image" content="${escapeHtml(preview.image)}">` : ''}
<meta name="twitter:card" content="${preview.image ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${escapeHtml(preview.title)}">
<meta name="twitter:description" content="${escapeHtml(preview.description)}">
${preview.image ? `<meta name="twitter:image" content="${escapeHtml(preview.image)}">` : ''}
</head>
<body></body>
</html>`;
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/**
 * Resolves an affiliate code (optionally scoped to a product slug), logs the
 * click, sets the visitor/attribution cookies, and redirects. Never throws —
 * on any unexpected failure it falls back to a plain redirect so a broken
 * link never shows the visitor an error page.
 */
const SITE_PREVIEW_TITLE = 'MyWisata — Malaysian Tourism Marketplace';
const SITE_PREVIEW_DESCRIPTION = 'Discover and book activities, tours, and experiences across Malaysia.';

export async function handleAffiliateRedirect(
  request: NextRequest,
  code: string,
  slug?: string,
): Promise<NextResponse> {
  const origin = new URL(request.url).origin;
  const crawler = isKnownCrawler(request.headers.get('user-agent'));

  try {
    const service = createServiceClient();

    const { data: link } = await service
      .from('affiliate_links')
      .select('id')
      .eq('affiliate_code', code)
      .eq('is_active', true)
      .maybeSingle();

    if (!link) {
      // A crawler still gets a valid preview card for an invalid/inactive
      // code — generic site branding, not an error page. No click to log
      // either way, since there's no real link to attribute to.
      if (crawler) {
        return renderOgPreview({ title: SITE_PREVIEW_TITLE, description: SITE_PREVIEW_DESCRIPTION, image: null, url: request.url });
      }
      return NextResponse.redirect(new URL('/', origin), 302);
    }

    let product: { id: string; name: string; description: string | null; cover_url: string | null } | null = null;
    if (slug) {
      const { data } = await service
        .from('products')
        .select('id, name, description, cover_url')
        .eq('slug', slug)
        .eq('status', 'active')
        .maybeSingle();
      product = data ?? null;
    }

    // Link-unfurling bots never reach the click-logging/cookie-setting code
    // below at all — they get a self-contained OG preview page served
    // directly at this URL instead. Crawlers generally don't execute JS and
    // often don't follow redirects the way a browser does, so relying on
    // them landing on the real activity page's own OG tags after a 302
    // isn't reliable; this guarantees a correct preview either way, and
    // guarantees zero click/cookie pollution from bot traffic.
    if (crawler) {
      return renderOgPreview({
        title: product?.name ?? SITE_PREVIEW_TITLE,
        description: product?.description ?? SITE_PREVIEW_DESCRIPTION,
        image: product?.cover_url ?? null,
        url: request.url,
      });
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
      : new URL('/customer', origin);

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
