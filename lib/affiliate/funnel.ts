// P4 — Member 4: shared funnel computation. CLAUDE-FUNNEL-AI.md Part 1.
//
// share_events -> affiliate_clicks -> affiliate_attributions, connected.
// Pure function, no DB access of its own — lib/affiliate/stats.ts (per-user)
// and lib/affiliate/admin-stats.ts (platform-wide) already fetch these three
// row sets for their own reasons; this does the shared math once instead of
// two divergent copies.
//
// Honest handling of the share<->click link (see CLAUDE-FUNNEL-AI.md): a
// share_event carries no id the later click can echo back, so per-platform
// clicks/conversions are only real once affiliate_clicks.source is actually
// populated (migration 035, written going forward from the share URL's
// ?src= param — see lib/affiliate/redirect.ts). Until at least one click has
// a source, byPlatform's clicks/conversions are null ("not available yet"),
// never a fabricated number. `source` values match share_events.platform's
// real vocabulary ('native' | 'copy_link' | 'image_share' | 'image_download'
// — see CLAUDE-SHARE-IMAGE.md §12.2.3 for the latter two) — not
// per-social-network, because the Web Share API never reports which app the
// OS share sheet routed to.

export interface FunnelPlatformRow {
  platform: string;
  shares: number;
  /** null = source-attribution not active yet — render as "—", never a fabricated 0. */
  clicks: number | null;
  conversions: number | null;
}

export interface Funnel {
  shares: number;
  clicks: number;
  conversions: number;
  /** clicks / shares, 0..1. null if shares = 0 (nothing to divide by). */
  shareToClickRate: number | null;
  /** conversions / clicks, 0..1. null if clicks = 0. */
  clickToConversionRate: number | null;
  byPlatform: FunnelPlatformRow[];
  /** true once >=1 click row has a non-null source — tells the UI whether byPlatform's clicks/conversions columns are meaningful yet. */
  sourceTrackingActive: boolean;
}

interface ShareInput {
  platform: string | null;
}

interface ClickInput {
  id: string;
  source: string | null;
}

interface ConversionInput {
  clickId: string;
}

export function computeFunnel(shares: ShareInput[], clicks: ClickInput[], conversions: ConversionInput[]): Funnel {
  const conversionClickIds = new Set(conversions.map((c) => c.clickId));
  const sourceTrackingActive = clicks.some((c) => c.source !== null);

  const platformMap = new Map<string, { shares: number; clicks: number; conversions: number }>();
  for (const share of shares) {
    const label = share.platform ?? 'unknown';
    const entry = platformMap.get(label) ?? { shares: 0, clicks: 0, conversions: 0 };
    entry.shares += 1;
    platformMap.set(label, entry);
  }
  for (const click of clicks) {
    if (!click.source) continue; // unattributed click — doesn't belong to any platform bucket
    const entry = platformMap.get(click.source) ?? { shares: 0, clicks: 0, conversions: 0 };
    entry.clicks += 1;
    if (conversionClickIds.has(click.id)) entry.conversions += 1;
    platformMap.set(click.source, entry);
  }

  const byPlatform: FunnelPlatformRow[] = [...platformMap.entries()]
    .map(([platform, v]) => ({
      platform,
      shares: v.shares,
      clicks: sourceTrackingActive ? v.clicks : null,
      conversions: sourceTrackingActive ? v.conversions : null,
    }))
    .sort((a, b) => b.shares - a.shares);

  return {
    shares: shares.length,
    clicks: clicks.length,
    conversions: conversions.length,
    shareToClickRate: shares.length > 0 ? clicks.length / shares.length : null,
    clickToConversionRate: clicks.length > 0 ? conversions.length / clicks.length : null,
    byPlatform,
    sourceTrackingActive,
  };
}
