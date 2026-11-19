import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { pickDemoAssignment, pickDemoRole } from '@/lib/auth/demo-user-role';
import { isDemoToolRuntimeEnabled } from '@/lib/demo/runtime';
import type { Role, User } from '@/backend/core/types';

export const dynamic = 'force-dynamic';

type DemoUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  city: string | null;
  tier: User['verificationTier'];
  user_roles?: Array<{
    vendor_id: string | null;
    outlet_id: string | null;
    roles?: { name: Role } | { name: Role }[] | null;
    vendors?: { name: string } | { name: string }[] | null;
    outlets?: { name: string } | { name: string }[] | null;
  }>;
};

/**
 * Demo-only account picker. This route intentionally returns only the
 * seeded demo identity/role projection; the service key stays server-side.
 * The anon role can enumerate users but cannot read user_roles after RLS is
 * enabled, which would make every account appear to be a customer.
 * Auth identity existence is checked against the bounded server-side demo ID
 * projection; this avoids paging through the platform's complete Auth table.
 */
export async function GET(request: Request) {
  if (!isDemoToolRuntimeEnabled()) return NextResponse.json([]);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]);
  try {
    const db = createServiceClient({ signal });
    const [{ data: loginableData, error: authError }, { data, error }] = await Promise.all([
      db.rpc('list_loginable_demo_user_ids'),
      db
        .from('users')
        .select('id,email,full_name,city,tier,user_roles(vendor_id,outlet_id,roles(name),vendors(name),outlets(name))')
        .like('email', '%@demo.local')
        .order('email'),
    ]);

    if (error) throw error;
    if (authError) throw authError;

    // Only accounts with both a real auth.users row and a real role assignment
    // can complete /api/auth/me. A roleless row must not inherit the customer
    // display fallback and appear to be a usable account in the picker.
    //
    // Most per-vendor-owner seed rows are data-only and intentionally have no
    // password, so the Auth identity check remains necessary as well.
    const loginableIds = new Set((loginableData ?? []).map((row: { user_id: string }) => row.user_id));

    const users = ((data || []) as DemoUserRow[])
      .filter((row) => (
        loginableIds.has(row.id)
        && pickDemoAssignment(row.user_roles || []) !== undefined
      ))
      .map((row) => {
      const assignments = row.user_roles || [];
      const role = pickDemoRole(assignments);
      const assignment = pickDemoAssignment(assignments);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const assignmentRole = Array.isArray(assignment?.roles) ? assignment.roles[0] : assignment?.roles;
      const name = row.full_name || row.email;
      const vendor = Array.isArray(assignment?.vendors) ? assignment?.vendors[0] : assignment?.vendors;
      const outlet = Array.isArray(assignment?.outlets) ? assignment?.outlets[0] : assignment?.outlets;
      return {
        id: row.id,
        name,
        email: row.email,
        role,
        avatarInitial: name[0]?.toUpperCase() || '?',
        city: row.city || undefined,
        verificationTier: row.tier,
        vendorId: assignment?.vendor_id || undefined,
        outletId: assignment?.outlet_id || undefined,
        vendorName: vendor?.name || undefined,
        outletName: outlet?.name || undefined,
      };
    });

    return NextResponse.json(users);
  } catch {
    const requestId = randomUUID();
    const timedOut = signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError';
    const code = timedOut ? 'DEMO_ACCOUNTS_TIMEOUT' : 'DEMO_ACCOUNTS_UNAVAILABLE';
    console.error('Demo account lookup failed', { requestId, code });
    return NextResponse.json(
      { error: { code, requestId } },
      { status: timedOut ? 504 : 500 },
    );
  }
}
