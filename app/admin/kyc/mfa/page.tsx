import { redirect } from 'next/navigation';
import { KycMfa } from '@/components/admin/kyc-mfa';
import { requireStaffMfaSetup } from '@/lib/auth/staff-mfa';
import { safeKycReviewNext } from '@/lib/auth/safe-next';

export const dynamic = 'force-dynamic';

export default async function KycMfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { response } = await requireStaffMfaSetup();
  if (response?.status === 401) redirect('/login?next=%2Fadmin%2Fkyc');
  const params = await searchParams;
  return <KycMfa next={safeKycReviewNext(params.next)} available={!response} unavailableReason={response?.status === 403 ? 'forbidden' : 'unavailable'} />;
}
