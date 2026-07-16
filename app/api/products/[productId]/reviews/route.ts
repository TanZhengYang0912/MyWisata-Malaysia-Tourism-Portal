import { createClient } from "@/lib/supabase/server";
import { getProductReviewsPage } from "@/backend/domains/catalogue";
import { apiFail, apiOk } from "@/lib/validation/schemas";

interface Props {
  params: Promise<{ productId: string }>;
}

function queryInteger(value: string | null, fallback: number): number {
  if (value === null || value.trim() === "") return fallback;
  return Number(value);
}

export async function GET(request: Request, { params }: Props) {
  const { productId } = await params;
  const query = new URL(request.url).searchParams;
  const page = queryInteger(query.get("page"), 1);
  const pageSize = queryInteger(query.get("pageSize"), 5);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 10) {
    return apiFail("INVALID_QUERY", "page must be positive and pageSize must be between 1 and 10", 400);
  }

  try {
    const data = await getProductReviewsPage(productId, { page, pageSize }, await createClient());
    return apiOk(data);
  } catch (error) {
    return apiFail("DB_ERROR", error instanceof Error ? error.message : "Could not load reviews", 500);
  }
}
