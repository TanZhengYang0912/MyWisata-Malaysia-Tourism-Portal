import { redirect } from 'next/navigation';
import { KycMfa } from '@/components/admin/kyc-mfa';
import { requireStaffMfaSetup } from '@/lib/auth/staff-mfa';
import { safeStaffVerificationNext } from '@/lib/auth/staff-route-boundaries';

export const dynamic = 'force-dynamic';

export default async function StaffMfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { response } = await requireStaffMfaSetup();
  if (response?.status === 401) redirect('/login');
  const params = await searchParams;
  return <KycMfa next={safeStaffVerificationNext(params.next)} scope="staff" available={!response} unavailableReason={response?.status === 403 ? 'forbidden' : 'unavailable'} />;
}
