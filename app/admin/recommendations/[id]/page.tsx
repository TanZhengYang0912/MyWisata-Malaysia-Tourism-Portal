import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { RecommendationDetailView } from "@/components/admin/recommendation-detail-view";

export default async function AdminRecommendationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminPageShell className="p-0 sm:p-0 xl:p-0 [&>div]:space-y-0">
      <RecommendationDetailView recommendationId={id} />
    </AdminPageShell>
  );
}
