// P4 — Member 4: affiliate redirect, no product slug.
// GET /r/[code] — logs the click, sets attribution cookies, redirects to
// /customer/explore. See CLAUDE.md Step 2.

import type { NextRequest } from 'next/server';
import { handleAffiliateRedirect } from '@/lib/affiliate/redirect';

interface Props {
  params: Promise<{ code: string }>;
}

export async function GET(request: NextRequest, { params }: Props) {
  const { code } = await params;
  return handleAffiliateRedirect(request, code);
}
