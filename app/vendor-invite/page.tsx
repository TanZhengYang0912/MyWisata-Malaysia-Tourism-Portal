import VendorInviteClient from '@/components/vendor/vendor-invite-client';

export default async function VendorInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ recommendation?: string }>;
}) {
  const { recommendation = '' } = await searchParams;
  return <VendorInviteClient token={recommendation} />;
}
