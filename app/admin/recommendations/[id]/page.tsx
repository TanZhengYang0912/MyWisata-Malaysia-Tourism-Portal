import { RecommendationDetailView } from "@/components/admin/recommendation-detail-view";

export default async function AdminRecommendationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RecommendationDetailView recommendationId={id} />;
}
