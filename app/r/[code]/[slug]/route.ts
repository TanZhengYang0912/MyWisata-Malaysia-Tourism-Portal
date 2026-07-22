// P4 — Member 4: affiliate redirect, product-scoped.
// GET /r/[code]/[slug] — logs the click, sets attribution cookies, redirects
// to the product's activity page. See CLAUDE.md Step 2.
//
// Deliberately at the app root, not under /customer — /customer/* is
// role-guarded and would bounce an anonymous visitor before the cookie is
// ever set. CLAUDE-PUBLIC-PRODUCT-RETURN.md: an anonymous visitor is now
// sent to the public /guest/activity/[id] equivalent instead of the
// login-gated /customer/activity/[id] page — see
// lib/affiliate/redirect.ts::guestDestinationPath. The cookie is set either
// way, so attribution survives regardless of which page the visitor lands on.

import type { NextRequest } from 'next/server';
import { handleAffiliateRedirect } from '@/lib/affiliate/redirect';

interface Props {
  params: Promise<{ code: string; slug: string }>;
}

export async function GET(request: NextRequest, { params }: Props) {
  const { code, slug } = await params;
  return handleAffiliateRedirect(request, code, slug);
}
