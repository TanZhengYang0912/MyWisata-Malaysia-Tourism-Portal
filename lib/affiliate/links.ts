// P4 — Affiliate link lookup/creation.
// affiliate_links is one row per USER (not per product) — see CLAUDE.md Section 3.

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateAffiliateCode } from './codes';

export interface AffiliateLink {
  id: string;
  userId: string;
  affiliateCode: string;
  isActive: boolean;
  createdAt: string;
}

type AffiliateLinkRow = {
  id: string;
  user_id: string;
  affiliate_code: string;
  is_active: boolean;
  created_at: string;
};

function mapLink(row: AffiliateLinkRow): AffiliateLink {
  return {
    id: row.id,
    userId: row.user_id,
    affiliateCode: row.affiliate_code,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

const MAX_CODE_ATTEMPTS = 5;

export function affiliateUrl(origin: string, code: string): string {
  return `${origin}/r/${code}`;
}

export async function getAffiliateLink(supabase: SupabaseClient, userId: string): Promise<AffiliateLink | null> {
  const { data, error } = await supabase
    .from('affiliate_links')
    .select('id,user_id,affiliate_code,is_active,created_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapLink(data as AffiliateLinkRow) : null;
}

/**
 * Idempotent: returns the user's existing link if one exists, otherwise creates one.
 * `created` tells the caller whether a new row was inserted (for the HTTP status code).
 *
 * Known limitation: affiliate_links has no UNIQUE constraint on user_id, only on
 * affiliate_code. Two concurrent first-time POSTs from the same user could each pass
 * the "does a link already exist" check and both insert — a rare race, not guarded
 * against here. Out of scope for Step 1 (see CLAUDE.md Section 4 migration list).
 */
export async function getOrCreateAffiliateLink(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ link: AffiliateLink; created: boolean }> {
  const existing = await getAffiliateLink(supabase, userId);
  if (existing) return { link: existing, created: false };

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const affiliateCode = generateAffiliateCode();
    const { data, error } = await supabase
      .from('affiliate_links')
      .insert({ user_id: userId, affiliate_code: affiliateCode })
      .select('id,user_id,affiliate_code,is_active,created_at')
      .single();

    if (!error) return { link: mapLink(data as AffiliateLinkRow), created: true };

    // 23505 = unique_violation — either the code collided (retry with a new one)
    // or another request already created this user's link (return it).
    if (error.code === '23505') {
      const nowExisting = await getAffiliateLink(supabase, userId);
      if (nowExisting) return { link: nowExisting, created: false };
      continue;
    }
    throw error;
  }
  throw new Error('Unable to generate a unique affiliate code after multiple attempts');
}
