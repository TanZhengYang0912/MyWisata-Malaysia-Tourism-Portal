import { type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail } from '@/lib/validation/schemas';

export type VendorRole = 'vendor_owner' | 'outlet_manager';

export interface VendorAccess {
  userId: string;
  vendorId: string;
  role: VendorRole;
  outletIds: string[];
  isOwner: boolean;
  isOutletManager: boolean;
  authDb: SupabaseClient;
  serviceDb: SupabaseClient;
}

type AccessResult = { ok: true; access: VendorAccess } | { ok: false; response: Response };

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

/**
 * Resolve the caller's role and data scope before any service-role query.
 * The service client is only returned after the caller is scoped to this vendor.
 */
export async function authorizeVendor(vendorId: string, allowedRoles: VendorRole[] = ['vendor_owner', 'outlet_manager']): Promise<AccessResult> {
  const authDb = (await createClient()) as SupabaseClient;
  const { data: { user } } = await authDb.auth.getUser();
  if (!user) return { ok: false, response: apiFail('UNAUTHORIZED', 'Sign in required', 401) };

  const { data: vendor, error: vendorError } = await authDb
    .from('vendors')
    .select('id,owner_id,status')
    .eq('id', vendorId)
    .maybeSingle();
  if (vendorError) return { ok: false, response: apiFail('DB_ERROR', vendorError.message, 500) };
  if (!vendor) return { ok: false, response: apiFail('NOT_FOUND', 'Vendor not found', 404) };
  if (vendor.status !== 'approved') return { ok: false, response: apiFail('INVALID_STATE', 'Vendor is not approved', 403) };

  if (vendor.owner_id === user.id && allowedRoles.includes('vendor_owner')) {
    const { data: outlets, error } = await authDb.from('outlets').select('id').eq('vendor_id', vendorId);
    if (error) return { ok: false, response: apiFail('DB_ERROR', error.message, 500) };
    return {
      ok: true,
      access: {
        userId: user.id,
        vendorId,
        role: 'vendor_owner',
        outletIds: (outlets || []).map((outlet: { id: string }) => outlet.id),
        isOwner: true,
        isOutletManager: false,
        authDb,
        serviceDb: createServiceClient() as SupabaseClient,
      },
    };
  }

  if (!allowedRoles.includes('outlet_manager')) {
    return { ok: false, response: apiFail('FORBIDDEN', 'Vendor owner permission required', 403) };
  }

  const { data: assignments, error: assignmentError } = await authDb
    .from('outlet_managers')
    .select('outlet_id,outlets(vendor_id)')
    .eq('user_id', user.id);
  if (assignmentError) return { ok: false, response: apiFail('DB_ERROR', assignmentError.message, 500) };

  const outletIds: string[] = (assignments || [])
    .filter((assignment: { outlet_id: string; outlets: unknown; [key: string]: unknown }) => {
      const outletVendorId = relation<{ vendor_id: string }>(assignment.outlets as { vendor_id: string })?.vendor_id;
      return outletVendorId === vendorId && Boolean(assignment.outlet_id);
    })
    .map((assignment: { outlet_id: string; outlets: unknown; [key: string]: unknown }) => String(assignment.outlet_id));

  if (!outletIds.length) return { ok: false, response: apiFail('FORBIDDEN', 'You are not assigned to an outlet in this vendor', 403) };

  return {
    ok: true,
    access: {
      userId: user.id,
      vendorId,
      role: 'outlet_manager',
      outletIds: [...new Set(outletIds)],
      isOwner: false,
      isOutletManager: true,
      authDb,
      serviceDb: createServiceClient() as SupabaseClient,
    },
  };
}

export async function authorizeOutlet(vendorId: string, outletId: string, allowedRoles: VendorRole[] = ['vendor_owner', 'outlet_manager']) {
  const result = await authorizeVendor(vendorId, allowedRoles);
  if (!result.ok) return result;
  if (!result.access.outletIds.includes(outletId)) {
    return { ok: false as const, response: apiFail('FORBIDDEN', 'This outlet is outside your assigned scope', 403) };
  }
  return result;
}
