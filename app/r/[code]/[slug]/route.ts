// P4 — Member 4: affiliate redirect, product-scoped.
// GET /r/[code]/[slug] — logs the click, sets attribution cookies, redirects
// to the product's activity page. See CLAUDE.md Step 2.
//
// Deliberately at the app root, not under /customer — /customer/* is
// role-guarded and would bounce an anonymous visitor before the cookie is
// ever set. (The activity page itself still bounces anonymous visitors to
// login today; that's a separate known issue, not fixed here — the cookie
// is set before the bounce, so attribution survives the login.)

import type { NextRequest } from 'next/server';
import { handleAffiliateRedirect } from '@/lib/affiliate/redirect';

interface Props {
  params: Promise<{ code: string; slug: string }>;
}

export async function GET(request: NextRequest, { params }: Props) {
  const { code, slug } = await params;
  return handleAffiliateRedirect(request, code, slug);
}
