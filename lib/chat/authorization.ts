import type { SupabaseClient } from '@supabase/supabase-js';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';

type ChatThread = { id: string; customer_id: string; outlet_id: string };

/** Explicit API boundary: legacy chat RLS also admits Wallet Approver.
 * Keep real customer/vendor/manager participation, not that staff override. */
export async function accessibleChatThreadIds(
  db: SupabaseClient,
  userId: string,
  threads: ChatThread[],
): Promise<Set<string>> {
  const allowed = new Set(threads.filter((thread) => thread.customer_id === userId).map((thread) => thread.id));
  const others = threads.filter((thread) => !allowed.has(thread.id));
  if (!others.length) return allowed;
  if (await isSuperAdmin(db, userId)) return new Set(threads.map((thread) => thread.id));

  const outletIds = [...new Set(others.map((thread) => thread.outlet_id))];
  const [owned, managed] = await Promise.all([
    db.from('outlets').select('id,vendors!inner(owner_id)').in('id', outletIds).eq('vendors.owner_id', userId),
    db.from('outlet_managers').select('outlet_id').in('outlet_id', outletIds).eq('user_id', userId),
  ]);
  const participatingOutlets = new Set([
    ...(!owned.error ? (owned.data ?? []).map((outlet) => outlet.id) : []),
    ...(!managed.error ? (managed.data ?? []).map((manager) => manager.outlet_id) : []),
  ]);
  for (const thread of others) {
    if (participatingOutlets.has(thread.outlet_id)) allowed.add(thread.id);
  }
  return allowed;
}
