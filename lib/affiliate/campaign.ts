// P4 — CLAUDE-CAMPAIGN-CLEARING-TRANSLATE.md Feature 1: campaign-label
// sanitization. Pure, no framework/DB imports — used both server-side
// (lib/affiliate/redirect.ts, the actual write path) and client-side
// (the dashboard's campaign-link generator, for an immediate URL preview).
// The server-side call is the one that matters for safety; the client-side
// one is just so the affiliate sees the same string that will end up stored.

const MAX_CAMPAIGN_LENGTH = 50;

/** Trim, lowercase, strip anything but [a-z0-9-_], cap length. Empty -> null. */
export function sanitizeCampaign(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, MAX_CAMPAIGN_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}
