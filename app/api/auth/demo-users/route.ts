import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Role, User } from '@/backend/core/types';

export const dynamic = 'force-dynamic';

type DemoUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  city: string | null;
  kyc_status: User['verificationTier'];
  user_roles?: Array<{
    vendor_id: string | null;
    outlet_id: string | null;
    roles?: { name: Role } | { name: Role }[] | null;
    vendors?: { name: string } | { name: string }[] | null;
    outlets?: { name: string } | { name: string }[] | null;
  }>;
};

/**
 * Demo-only account picker. Uses the anon client — relies on the
 * allow_anon_select_users RLS policy to enumerate @demo.local accounts.
 */
export async function GET() {
  try {
    const db = await createClient();
    const { data, error } = await db
      .from('users')
      .select('id,email,full_name,city,kyc_status,user_roles(vendor_id,outlet_id,roles(name),vendors(name),outlets(name))')
      .like('email', '%@demo.local')
      .order('email');

    if (error) throw error;

    const users = ((data || []) as DemoUserRow[]).map((row) => {
      const assignment = [...(row.user_roles || [])].sort((left, right) => {
        const roleName = (value: typeof left) => {
          const role = Array.isArray(value.roles) ? value.roles[0] : value.roles;
          return role?.name || 'customer';
        };
        const priority = (name: string) => name === 'vendor_owner' ? 0 : name === 'outlet_manager' ? 1 : 2;
        return priority(roleName(left)) - priority(roleName(right));
      })[0];
      const assignmentRole = Array.isArray(assignment?.roles) ? assignment.roles[0] : assignment?.roles;
      const role = assignmentRole?.name || 'customer';
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
        verificationTier: row.kyc_status,
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
