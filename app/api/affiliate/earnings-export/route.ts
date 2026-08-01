// P4 — Member 4: affiliate earnings export. CLAUDE-P4-EXTRAS-2.md Extra 6.
// GET /api/affiliate/earnings-export?range=month|year|all — a downloadable
// CSV of the CURRENT user's own commission history. Own data only: userId
// comes from the authenticated session below, never from a request
// parameter, and lib/affiliate/earnings-export.ts's query is additionally
// scoped by real own-row RLS on affiliate_links/_clicks/_attributions
// regardless.
//
// Returns a raw text/csv Response, not the repo's apiOk() JSON envelope —
// same class of exception as app/api/share-image/[type]/[id]/route.tsx's
// raw ImageResponse: a file download can't be wrapped in a JSON envelope
// and still trigger a browser save-file dialog. Error paths still use
// apiFail(), matching that same precedent.

import { createClient } from '@/lib/supabase/server';
import { apiFail } from '@/lib/validation/schemas';
import { csvRow } from '@/lib/admin/csv';
import { getAffiliateEarningsExport, type EarningsExportRange } from '@/lib/affiliate/earnings-export';

const VALID_RANGES: EarningsExportRange[] = ['month', 'year', 'all'];
const CSV_HEADER = ['Date', 'Activity', 'Order Reference', 'Order Amount (RM)', 'Commission Rate (%)', 'Commission Amount (RM)', 'Status', 'Cleared Date'];

function isoDate(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const rangeParam = new URL(request.url).searchParams.get('range');
  const range: EarningsExportRange = VALID_RANGES.includes(rangeParam as EarningsExportRange)
    ? (rangeParam as EarningsExportRange)
    : 'all';

  const rows = await getAffiliateEarningsExport(supabase, user.id, range);

  const lines = [
    csvRow(CSV_HEADER),
    ...rows.map((r) =>
      csvRow([
        isoDate(r.date),
        r.productName,
        r.orderReference,
        r.orderAmount !== null ? r.orderAmount.toFixed(2) : '',
        (r.commissionRate * 100).toFixed(2),
        r.commissionAmount.toFixed(2),
        r.status,
        isoDate(r.clearedAt),
      ]),
    ),
  ];
  // Leading BOM so Excel opens UTF-8 (e.g. non-ASCII product names) without
  // mojibake — plain-ASCII readers/spreadsheets ignore it harmlessly.
  const csv = '﻿' + lines.join('\r\n') + '\r\n';

  const fileName = `mywisata-affiliate-earnings-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
