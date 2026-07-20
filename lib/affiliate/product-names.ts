// P4 — Member 4: shared product-name resolution for affiliate stats.
//
// Why service-role, always: affiliate_clicks/affiliate_attributions can
// legitimately reference a product the caller's own RLS-scoped read can't
// see — e.g. products_public_read (013_content_review_workflow.sql) requires
// review_status = 'approved' for a non-owner, but a vendor re-editing an
// already-referred, already-active listing flips it back to
// 'pending_review'. That's real history that already paid out commission;
// the affiliate is entitled to see the name of what earned it regardless of
// the listing's current moderation state. Same reasoning as the `orders`
// lookup a few lines up in stats.ts.
//
// Why also by slug: affiliate_clicks.target_id / share_events.content_id are
// expected to always be a product's `id` today (see lib/affiliate/redirect.ts
// — resolveTarget's 'product' branch resolves slug -> id before ever writing
// the click row), but that's not guaranteed for every historical row or every
// target type, so resolution tries `id` first and falls back to `slug` for
// whatever's left over, rather than assuming the identifier shape.

import { createServiceClient } from '@/lib/supabase/service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves a set of raw product references (id or slug) to display names.
 * Returned map is keyed by whatever string was passed in, so callers can
 * look up with the same value they grouped on. Anything left unresolved
 * (genuinely deleted, or never existed) is simply absent from the map —
 * callers fall back to "Deleted listing".
 */
export async function resolveProductNames(refs: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!refs.length) return names;

  const idLike = refs.filter((ref) => UUID_RE.test(ref));
  const slugLike = refs.filter((ref) => !UUID_RE.test(ref));

  const service = createServiceClient();
  const [{ data: byId }, { data: bySlug }] = await Promise.all([
    idLike.length
      ? service.from('products').select('id, name').in('id', idLike)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    slugLike.length
      ? service.from('products').select('slug, name').in('slug', slugLike)
      : Promise.resolve({ data: [] as { slug: string | null; name: string }[] }),
  ]);

  for (const p of byId ?? []) names.set(p.id, p.name);
  for (const p of bySlug ?? []) if (p.slug) names.set(p.slug, p.name);

  return names;
}
