import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { RecommendationDetailView } from "@/components/admin/recommendation-detail-view";

export default async function AdminRecommendationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminPageShell>
      <RecommendationDetailView recommendationId={id} />
    </AdminPageShell>
  );
}
