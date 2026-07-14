import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { pickDemoAssignment, pickDemoRole } from '@/lib/auth/demo-user-role';
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
 */
export async function GET() {
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from('users')
      .select('id,email,full_name,city,tier,user_roles(vendor_id,outlet_id,roles(name),vendors(name),outlets(name))')
      .like('email', '%@demo.local')
      .order('email');

    if (error) throw error;

    const users = ((data || []) as DemoUserRow[]).map((row) => {
      const assignments = row.user_roles || [];
      const role = pickDemoRole(assignments);
      const assignment = pickDemoAssignment(assignments);
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
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load demo accounts' },
      { status: 500 },
    );
  }
}
