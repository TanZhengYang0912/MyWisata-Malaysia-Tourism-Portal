'use client';

// P4 — Member 4: vendor share analytics. CLAUDE-VENDOR-SHARE-ANALYTICS.md
// §12.3.3. Self-contained: fetches its own data from
// GET /api/vendor/share-analytics, so mounting it anywhere in the vendor
// dashboard is a one-line addition — no vendorId plumbing required from the
// host page for the normal (non-admin) case.
//
// Visual style matches the existing vendor dashboard components
// (components/vendor/recent-transactions.tsx, outlet-pie-chart.tsx) —
// plain <table> + gray-scale Tailwind, not the customer side's shadcn/CSS-var
// theme, so this drops in without looking like a foreign component.
//
// No PII: only listing names and counts ever render here — no customer or
// affiliate identity, per the spec's own acceptance criterion.

import { useEffect, useState } from 'react';
import { Share2, MousePointerClick, ShoppingBag, ChevronDown, ChevronRight } from 'lucide-react';
import type { VendorShareStats, ListingShareStat } from '@/lib/affiliate/vendor-share-stats';

type SortKey = 'shares' | 'clicks' | 'orders';

const PLATFORM_LABEL: Record<string, string> = {
  native: 'Share sheet',
  copy_link: 'Copied link',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  image_share: 'Shared image',
  image_download: 'Downloaded image',
  unknown: 'Unknown',
};

function platformLabel(platform: string): string {
  return PLATFORM_LABEL[platform] ?? platform;
}

interface VendorShareAnalyticsProps {
  /** Only meaningful for a super_admin/approver viewing a specific vendor;
   *  omit for the normal case — the API derives the vendor from the session. */
  vendorId?: string;
}

export function VendorShareAnalytics({ vendorId }: VendorShareAnalyticsProps) {
  const [stats, setStats] = useState<VendorShareStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('shares');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const url = vendorId ? `/api/vendor/share-analytics?vendorId=${vendorId}` : '/api/vendor/share-analytics';
        const res = await fetch(url);
        const body = (await res.json()) as { data: VendorShareStats | null; error: { message: string } | null };
        if (!res.ok || !body.data) {
          setError(body.error?.message ?? 'Unable to load share analytics.');
          return;
        }
        setStats(body.data);
      } catch {
        setError('Unable to load share analytics.');
      } finally {
        setLoading(false);
      }
    })();
  }, [vendorId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-400">Loading share analytics…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <p className="text-sm text-rose-600">{error}</p>
      </div>
    );
  }

  if (!stats) return null;

  const listings = [...stats.listings].sort((a, b) => b[sortKey] - a[sortKey]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Share2} label="Total shares" value={stats.totals.shares} tone="teal" />
        <StatCard icon={MousePointerClick} label="Clicks from shares" value={stats.totals.clicks} tone="blue" />
        <StatCard icon={ShoppingBag} label="Orders from shares" value={stats.totals.orders} tone="amber" />
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <Share2 size={14} /> Share performance
            </div>
            <h3 className="text-lg font-bold text-gray-950">By listing</h3>
          </div>
          <div className="flex gap-1 rounded-lg bg-gray-50 p-1 text-xs font-semibold">
            {(['shares', 'clicks', 'orders'] as SortKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSortKey(key)}
                className={`rounded-md px-3 py-1.5 capitalize ${sortKey === key ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        {listings.length === 0 ? (
          <p className="px-6 py-14 text-center text-sm text-gray-400">No shares yet for your listings.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-gray-100">
                <tr className="text-gray-500">
                  <th className="px-6 py-4 font-medium">Listing</th>
                  <th className="px-6 py-4 text-right font-medium">Shares</th>
                  <th className="px-6 py-4 font-medium">Top platform</th>
                  <th className="px-6 py-4 text-right font-medium">Clicks</th>
                  <th className="px-6 py-4 text-right font-medium">Orders</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {listings.map((listing) => (
                  <ListingRow
                    key={`${listing.listingType}-${listing.listingId}`}
                    listing={listing}
                    expanded={expanded === listing.listingId}
                    onToggle={() => setExpanded(expanded === listing.listingId ? null : listing.listingId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!stats.sourceTrackingActive && listings.length > 0 && (
          <p className="border-t border-gray-100 bg-gray-50 px-6 py-3 text-xs text-gray-500">
            Clicks and orders are real totals per listing. Per-platform click/order attribution isn&apos;t shown — that
            needs click-source tagging, which only applies going forward.
          </p>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: typeof Share2; label: string; value: number; tone: 'teal' | 'blue' | 'amber' }) {
  const toneClass = { teal: 'bg-secondary text-primary', blue: 'bg-secondary text-primary', amber: 'bg-amber-50 text-amber-700' }[tone];
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${toneClass}`}>
          <Icon size={18} />
        </div>
        <p className="font-medium text-gray-600">{label}</p>
      </div>
      <p className="text-2xl font-bold tracking-tight text-gray-950">{value.toLocaleString()}</p>
    </div>
  );
}

function ListingRow({ listing, expanded, onToggle }: { listing: ListingShareStat; expanded: boolean; onToggle: () => void }) {
  const hasBreakdown = listing.platformBreakdown.length > 0;
  return (
    <>
      <tr className="hover:bg-gray-50/60">
        <td className="px-6 py-4">
          <button
            type="button"
            onClick={hasBreakdown ? onToggle : undefined}
            disabled={!hasBreakdown}
            className="flex items-center gap-2 text-left font-medium text-gray-900 disabled:cursor-default"
          >
            {hasBreakdown ? (
              expanded ? <ChevronDown size={14} className="shrink-0 text-gray-400" /> : <ChevronRight size={14} className="shrink-0 text-gray-400" />
            ) : (
              <span className="w-[14px] shrink-0" />
            )}
            {listing.listingName}
          </button>
          <p className="mt-0.5 pl-[22px] text-xs text-gray-400 capitalize">{listing.listingType}</p>
        </td>
        <td className="px-6 py-4 text-right font-mono text-gray-900">{listing.shares}</td>
        <td className="px-6 py-4 text-gray-700">{listing.topPlatform ? platformLabel(listing.topPlatform) : '—'}</td>
        <td className="px-6 py-4 text-right font-mono text-gray-900">{listing.clicks}</td>
        <td className="px-6 py-4 text-right font-mono text-gray-900">{listing.orders}</td>
      </tr>
      {expanded && hasBreakdown && (
        <tr className="bg-gray-50/60">
          <td colSpan={5} className="px-6 py-4 pl-[52px]">
            <ul className="space-y-1.5">
              {listing.platformBreakdown.map((p) => (
                <li key={p.platform} className="flex items-center gap-3 text-xs">
                  <span className="w-28 shrink-0 text-gray-500">{platformLabel(p.platform)}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(6, (p.count / listing.platformBreakdown[0].count) * 100)}%` }}
                    />
                  </span>
                  <span className="w-6 shrink-0 text-right font-mono text-gray-700">{p.count}</span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
