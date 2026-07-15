import type { ProductReview } from "@/backend/core/types";

type ReviewRow = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  created_at: string;
  users: { full_name: string | null } | null;
};

export function formatReviewAuthor(fullName: string | null | undefined): string {
  const parts = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return "Verified visitor";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export function toProductReview(row: ReviewRow): ProductReview {
  return {
    id: row.id,
    rating: Number(row.rating),
    title: row.title ?? undefined,
    body: row.body ?? undefined,
    createdAt: row.created_at,
    authorName: formatReviewAuthor(row.users?.full_name),
    verifiedPurchase: true,
  };
}
