// P4 — Affiliate click hashing. Pure, no framework/DB imports.

import { createHash } from 'crypto';

/**
 * affiliate_clicks.ip_hash is repurposed to dedup by the `mw_visitor` cookie
 * value instead of a real IP address — see CLAUDE.md Section 3. SHA-256 hex
 * is 64 chars, which fits the column's VARCHAR(64) exactly.
 */
export function hashVisitorId(visitorId: string): string {
  return createHash('sha256').update(visitorId).digest('hex');
}
