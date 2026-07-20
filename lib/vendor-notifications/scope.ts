import type { SupabaseClient } from '@supabase/supabase-js';

export type VendorAudience = 'owner' | 'assigned_outlet' | 'owner_and_assigned_outlet';

export type VendorRecipient = {
  userId: string;
  role: 'vendor_owner' | 'outlet_manager';
  outletId: string | null;
};

type VendorRow = { owner_id: string | null; status: string | null };
type OutletRow = { vendor_id: string | null };
type ManagerRow = { user_id: string | null; outlet_id: string | null };

/**
 * Resolve the vendor users who should receive an event. All lookups are scoped
 * from the approved vendor, so an outlet belonging to another vendor can never
 * leak its manager into this recipient list.
 */
export async function resolveVendorRecipients(input: {
  vendorId: string;
  outletId?: string | null;
  audience: VendorAudience;
  serviceDb: SupabaseClient;
}): Promise<VendorRecipient[]> {
  const { data: vendor, error: vendorError } = await input.serviceDb
    .from('vendors')
    .select('owner_id,status')
    .eq('id', input.vendorId)
    .maybeSingle();

  if (vendorError) throw vendorError;
  const vendorRow = vendor as VendorRow | null;
  if (!vendorRow || vendorRow.status !== 'approved' || !vendorRow.owner_id) return [];

  const recipients: VendorRecipient[] = [];
  const seen = new Set<string>();
  const add = (recipient: VendorRecipient) => {
    const key = `${recipient.userId}:${recipient.role}:${recipient.outletId ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      recipients.push(recipient);
    }
  };

  if (input.audience === 'owner') {
    add({ userId: vendorRow.owner_id, role: 'vendor_owner', outletId: null });
    return recipients;
  }
  if (!input.outletId) return recipients;

  const { data: outlet, error: outletError } = await input.serviceDb
    .from('outlets')
    .select('vendor_id')
    .eq('id', input.outletId)
    .maybeSingle();

  if (outletError) throw outletError;
  const outletRow = outlet as OutletRow | null;
  if (!outletRow || outletRow.vendor_id !== input.vendorId) return [];

  if (input.audience === 'owner_and_assigned_outlet') {
    add({ userId: vendorRow.owner_id, role: 'vendor_owner', outletId: null });
  }

  const { data: managers, error: managerError } = await input.serviceDb
    .from('outlet_managers')
    .select('user_id,outlet_id')
    .eq('outlet_id', input.outletId);

  if (managerError) throw managerError;
  for (const manager of (managers ?? []) as ManagerRow[]) {
    if (manager.user_id && manager.outlet_id === input.outletId) {
      add({ userId: manager.user_id, role: 'outlet_manager', outletId: input.outletId });
    }
  }

  return recipients;
}
