import type { SupabaseClient } from '@supabase/supabase-js';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';

type ChatThread = { id: string; customer_id: string; outlet_id: string };

export class ChatAuthorizationLookupError extends Error {
  constructor() {
    super('chat_access_lookup_unavailable');
    this.name = 'ChatAuthorizationLookupError';
  }
}

/** Explicit API boundary: legacy chat RLS also admits Wallet Approver.
 * Keep real customer/vendor/manager participation, not that staff override. */
export async function accessibleChatThreadIds(
  db: SupabaseClient,
  userId: string,
  threads: ChatThread[],
  options: { throwOnLookupError?: boolean } = {},
): Promise<Set<string>> {
  const allowed = new Set(threads.filter((thread) => thread.customer_id === userId).map((thread) => thread.id));
  const others = threads.filter((thread) => !allowed.has(thread.id));
  if (!others.length) return allowed;
  try {
    if (await isSuperAdmin(db, userId, { throwOnLookupError: options.throwOnLookupError })) {
      return new Set(threads.map((thread) => thread.id));
    }
  } catch {
    if (options.throwOnLookupError) throw new ChatAuthorizationLookupError();
  }

  const outletIds = [...new Set(others.map((thread) => thread.outlet_id))];
  let ownedOutlets: string[] = [];
  let managedOutlets: string[] = [];
  try {
    const [owned, managed] = await Promise.all([
      db.from('outlets').select('id,vendors!inner(owner_id)').in('id', outletIds).eq('vendors.owner_id', userId),
      db.from('outlet_managers').select('outlet_id').in('outlet_id', outletIds).eq('user_id', userId),
    ]);
    if (!owned.error) ownedOutlets = (owned.data ?? []).map((outlet) => outlet.id);
    if (!managed.error) managedOutlets = (managed.data ?? []).map((manager) => manager.outlet_id);
    if (options.throwOnLookupError && (owned.error || managed.error)) throw new ChatAuthorizationLookupError();
  } catch {
    if (options.throwOnLookupError) {
      throw new ChatAuthorizationLookupError();
    }
    return allowed;
  }
  const participatingOutlets = new Set([...ownedOutlets, ...managedOutlets]);
  for (const thread of others) {
    if (participatingOutlets.has(thread.outlet_id)) allowed.add(thread.id);
  }
  return allowed;
}
