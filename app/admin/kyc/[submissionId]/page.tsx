import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { KycReviewDetail } from "@/components/admin/kyc-review-detail";

export default async function AdminKycDetailPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;

  return (
    <AdminPageShell>
      <KycReviewDetail submissionId={submissionId} />
    </AdminPageShell>
  );
}
