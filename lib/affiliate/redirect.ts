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
import { productImageUrl } from '@/lib/storage/product-image';
import { hashVisitorId } from './click';
import { sanitizeCampaign } from './campaign';
import { getAttributionCookieDays, getMonthlyClickCap } from './settings';
import { logFraudFlag, hasRecentOpenFlag } from './fraud';
import { GUEST_EXPLORE_PATH, guestVendorHref } from '@/lib/auth/guest-mode';

const MW_VISITOR_COOKIE = 'mw_visitor';
const MW_REF_COOKIE = 'mw_ref';
// Rolling window, not a calendar month: a calendar-month reset would let a
// capped affiliate get the full cap again on day 1 of the next month right
// after maxing out on day 30 (up to 2x the intended allowance in ~48h).
// Only the cap VALUE is a platform_settings knob (getMonthlyClickCap) — the
// window length isn't, to avoid a second setting nothing has asked for yet.
const CLICK_CAP_WINDOW_DAYS = 30;
const VISITOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year
const SECONDS_PER_DAY = 86400;

// CLAUDE-FUNNEL-AI.md: matches share_events.platform's real vocabulary, not
// a per-social-network list — see lib/affiliate/funnel.ts's header comment
// for why. Anything else in ?src= is dropped (source stays null) rather than
// stored as-is, so the funnel's per-platform grouping can't be polluted by
// arbitrary query-string junk.
const KNOWN_SHARE_SOURCES = new Set(['native', 'copy_link', 'image_share', 'image_download']);

function parseKnownSource(searchParams: URLSearchParams): string | null {
  const src = searchParams.get('src');
  return src && KNOWN_SHARE_SOURCES.has(src) ? src : null;
}

// CLAUDE-CAMPAIGN-CLEARING-TRANSLATE.md Feature 1: `?utm_campaign=` alongside
// the existing `?src=` platform tag — same click row, separate column, so an
// affiliate can see "insta-jan: 40 clicks, 5 bookings" without losing the
// existing per-platform breakdown. Sanitized here (not just trusted from the
// query string) since this is the actual write path.
function parseCampaign(searchParams: URLSearchParams): string | null {
  return sanitizeCampaign(searchParams.get('utm_campaign'));
}

// CLAUDE-SHARE-SURFACES.md Surface 4: `?type=` tells the redirect what the
// slug/id path segment actually identifies. Absent or unrecognized ->
// 'product', so every link shared before this change (which never had a
// type param) keeps resolving exactly as it did. 'vendor' and 'outlet' both
// map to the outlets table — there's no separate vendor entity being
// shared; components/shared/share-button.tsx's `vendor` shareType already
// points at the outlet page too, since that IS the public storefront.
type ShareTargetType = 'product' | 'outlet' | 'recommendation';

function parseShareTargetType(searchParams: URLSearchParams): ShareTargetType {
  const raw = searchParams.get('type');
  if (raw === 'vendor' || raw === 'outlet') return 'outlet';
  if (raw === 'recommendation') return 'recommendation';
  return 'product';
}

interface ResolvedTarget {
  targetId: string;
  destinationPath: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string | null;
}

/**
 * Resolves the slug/id path segment against the right table for its type.
 * Returns null when nothing matches (unknown/inactive product, unknown
 * outlet, no segment given at all, or an unresolvable type) — callers fall
 * back to the generic site redirect/preview (see the caller's own comment on
 * why that fallback is '/customer', not '/customer/explore').
 *
 * 'recommendation' always returns null today: there is no public per-post
 * detail route on vendor_recommendations (CLAUDE-SHARE-SURFACES.md Surface 2
 * is on hold pending coordination with Member 3), and the one existing
 * customer-facing recommendations page (app/customer/recommendations) is a
 * private, login-gated list of the CURRENT user's own submissions — not a
 * page a referred visitor could ever meaningfully land on. An earlier
 * version of this branch sent visitors there anyway and stored the raw
 * unverified path segment as targetId; both were wrong (a broken/misleading
 * destination, and a fabricated id with no backing row). Falling through to
 * null is honest: same degrade-gracefully behaviour as an unresolved product
 * or outlet, no fake data written. Revisit once Member 3 ships a real public
 * route — see the coordination note this was raised with.
 */
async function resolveTarget(
  service: ReturnType<typeof createServiceClient>,
  targetType: ShareTargetType,
  slugOrId: string | undefined,
): Promise<ResolvedTarget | null> {
  if (!slugOrId) return null;

  if (targetType === 'product') {
    const { data } = await service
      .from('products')
      .select('id, name, description, cover_url')
      .eq('slug', slugOrId)
      .eq('status', 'active')
      .maybeSingle();
    if (!data) return null;
    return {
      targetId: data.id,
      destinationPath: `/customer/activity/${data.id}`,
      ogTitle: data.name,
      ogDescription: data.description ?? SITE_PREVIEW_DESCRIPTION,
      ogImage: productImageUrl(data.cover_url) || null,
    };
  }

  if (targetType === 'outlet') {
    const [{ data: outlet }, { data: page }] = await Promise.all([
      service.from('outlets').select('id, name, address, city, state').eq('id', slugOrId).maybeSingle(),
      service.from('outlet_pages').select('hero_url, seo_description').eq('outlet_id', slugOrId).maybeSingle(),
    ]);
    if (!outlet) return null;
    return {
      targetId: outlet.id,
      destinationPath: `/customer/outlet/${outlet.id}`,
      ogTitle: outlet.name,
      ogDescription: page?.seo_description || `Explore products and experiences at ${outlet.name}.`,
      ogImage: page?.hero_url ?? null,
    };
  }

  // recommendation: see the function doc comment above — no public detail
  // route exists yet, so this always falls through to the generic fallback.
  return null;
}

/**
 * CLAUDE-PUBLIC-PRODUCT-RETURN.md Part 1: an anonymous visitor must land on
 * a page that actually renders for them, not the login-gated /customer/*
 * equivalent. /guest/activity/[id] and /guest/vendor/[vendorId] already
 * exist (built for the pre-existing Guest Mode feature) and are exactly
 * that — public listing view + a "Sign in to book"/"Sign in to purchase"
 * CTA that already carries a safe returnTo via guestLoginHref/postLoginPath.
 * Logged-in visitors still go straight to the /customer/* page as before;
 * only anonymous ones get redirected here.
 */
function guestDestinationPath(targetType: ShareTargetType, targetId: string): string | null {
  if (targetType === 'product') return `/guest/activity/${targetId}`;
  if (targetType === 'outlet') return guestVendorHref(targetId);
  return null;
}

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
      .select('id,user_id')
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

    const targetType = parseShareTargetType(request.nextUrl.searchParams);
    const target = await resolveTarget(service, targetType, slug);

    // Link-unfurling bots never reach the click-logging/cookie-setting code
    // below at all — they get a self-contained OG preview page served
    // directly at this URL instead. Crawlers generally don't execute JS and
    // often don't follow redirects the way a browser does, so relying on
    // them landing on the real destination page's own OG tags after a 302
    // isn't reliable; this guarantees a correct preview either way, and
    // guarantees zero click/cookie pollution from bot traffic. Applies to
    // every target type, not just products — an unfurled vendor/outlet link
    // would otherwise inflate that outlet's click count the same way
    // products did before this check existed.
    if (crawler) {
      return renderOgPreview({
        title: target?.ogTitle ?? SITE_PREVIEW_TITLE,
        description: target?.ogDescription ?? SITE_PREVIEW_DESCRIPTION,
        image: target?.ogImage ?? null,
        url: request.url,
      });
    }

    // Cookie-aware client purely to see if the visitor happens to be logged in.
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();

    // Self-click guard: the link owner opening their own link (logged in as
    // themselves) must not inflate their own click count, click-cap window,
    // or funnel rate — and must not set mw_ref, since onOrderPaid()'s
    // self-referral guard would reject the commission anyway. Only catches
    // it when the owner is actually logged in as themselves; an anonymous/
    // incognito self-click is indistinguishable from real traffic at click
    // time, same inherent limitation the commission-side guard has (it only
    // catches self-referral at purchase time, via the buyer's account).
    const isOwnLink = Boolean(user?.id) && user!.id === link.user_id;

    const visitorId = request.cookies.get(MW_VISITOR_COOKIE)?.value ?? crypto.randomUUID();
    const source = parseKnownSource(request.nextUrl.searchParams);
    const campaign = parseCampaign(request.nextUrl.searchParams);

    // Limited-tier affiliates (anything short of full KYC-verified) get a
    // deliberately small trial click allowance, §8.3. Full affiliates are
    // never capped. `fullAffiliate` matches app/api/affiliate/link/route.ts's
    // own `full` computation exactly — the same two fields (tier, kyc_status)
    // decide "is this a full affiliate" in both places. The redirect always
    // still sends the visitor to the right page either way — capping only
    // ever withholds the click row and attribution cookie, never the
    // redirect itself.
    const { data: owner } = await service
      .from('users')
      .select('tier, kyc_status')
      .eq('id', link.user_id)
      .maybeSingle();
    const fullAffiliate = owner?.tier === 'kyc_verified' && owner?.kyc_status === 'approved';
    // A rejected KYC resubmission can't generate a NEW link (see that route's
    // 403), but an existing link created before rejection still works here —
    // treat it as permanently capped rather than falling through to the
    // window count, which would otherwise let it earn normally.
    let limitedCapReached = owner?.kyc_status === 'rejected';
    let clicksThisWindow = 0;
    const monthlyClickCap = await getMonthlyClickCap(service);
    if (!fullAffiliate && !limitedCapReached) {
      const windowStart = new Date(Date.now() - CLICK_CAP_WINDOW_DAYS * 86_400_000).toISOString();
      const { count } = await service
        .from('affiliate_clicks')
        .select('id', { count: 'exact', head: true })
        .eq('link_id', link.id)
        .gte('created_at', windowStart);
      clicksThisWindow = count ?? 0;
      limitedCapReached = clicksThisWindow >= monthlyClickCap;
    }

    const { data: click, error: clickErr } = (limitedCapReached || isOwnLink)
      ? { data: null, error: null }
      : await service
        .from('affiliate_clicks')
        .insert({
          link_id: link.id,
          clicker_id: user?.id ?? null,
          target_type: target ? targetType : null,
          target_id: target?.targetId ?? null,
          ip_hash: hashVisitorId(visitorId),
          source,
          campaign,
        })
        .select('id')
        .single();

    if (clickErr) {
      console.error('[affiliate] click insert failed', clickErr.message);
    }

    // Observability: a silent cap is an unprovable one. Deduped the same way
    // the sweep-detected fraud types already are (lib/affiliate/fraud.ts) —
    // one open flag per link per 24h while capped, not one per excess click
    // (every click after the cap sees the same frozen clicksThisWindow count,
    // so without this dedupe every one of them would log a fresh flag).
    if (limitedCapReached && !(await hasRecentOpenFlag(service, link.id, 'click_cap_reached'))) {
      await logFraudFlag(service, {
        linkId: link.id,
        userId: link.user_id,
        flagType: 'click_cap_reached',
        severity: 'low', // expected behaviour for a limited-tier affiliate, not itself evidence of abuse
        detail: {
          clicksThisWindow,
          cap: monthlyClickCap,
          windowDays: CLICK_CAP_WINDOW_DAYS,
          ownerKycRejected: owner?.kyc_status === 'rejected',
        },
      });
    }

    // Attribution still works the same regardless of target: the cookie is
    // set below whether or not `target` resolved — a share that lands the
    // visitor on the homepage because the target 404'd still pays out on
    // whatever they book later (last-click attribution, not "this exact
    // page must convert"). Fallback is '/customer' (not '/customer/explore')
    // per the UI restructure that moved the customer home page there — for
    // an anonymous visitor the equivalent fallback is /guest/explore, same
    // reasoning as the guestDestinationPath branch below.
    //
    // CLAUDE-PUBLIC-PRODUCT-RETURN.md Part 1: an anonymous (no-session)
    // visitor gets the /guest/* equivalent of the resolved target instead of
    // the login-gated /customer/* page — that's the fix for the
    // referral -> login wall -> homepage bug. Logged-in visitors are
    // unaffected. See guestDestinationPath's doc comment.
    const destination = user
      ? new URL(target ? target.destinationPath : '/customer', origin)
      : new URL((target && guestDestinationPath(targetType, target.targetId)) ?? GUEST_EXPLORE_PATH, origin);

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
