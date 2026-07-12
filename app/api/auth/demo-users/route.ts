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
      .select('id,email,full_name,city,kyc_status,user_roles(vendor_id,outlet_id,roles(name))')
      .like('email', '%@demo.local')
      .order('email');

    if (error) throw error;

    const users = ((data || []) as DemoUserRow[]).map((row) => {
      const assignment = row.user_roles?.[0];
      const assignmentRole = Array.isArray(assignment?.roles) ? assignment.roles[0] : assignment?.roles;
      const role = assignmentRole?.name || 'customer';
      const name = row.full_name || row.email;
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
