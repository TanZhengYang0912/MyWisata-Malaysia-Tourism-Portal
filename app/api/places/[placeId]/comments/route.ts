import { getPlaceCommentsPage, toPlaceComment } from "@/backend/domains/place-comments";
import { cleanUserContent } from "@/lib/moderation/clean";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { apiFail, apiOk, parseBody, placeCommentCreateSchema, placeCommentDeleteSchema } from "@/lib/validation/schemas";

interface Props {
  params: Promise<{ placeId: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function queryInteger(value: string | null, fallback: number): number {
  return value === null || value.trim() === "" ? fallback : Number(value);
}

async function activePlace(placeId: string) {
  const service = createServiceClient();
  const { data, error } = await service
    .from("places")
    .select("id")
    .eq("id", placeId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function currentUser() {
  const auth = await createClient();
  const { data: { user }, error } = await auth.auth.getUser();
  return error ? null : user;
}

export async function GET(request: Request, { params }: Props) {
  const { placeId } = await params;
  if (!UUID.test(placeId)) return apiFail("INVALID_PLACE", "placeId must be a valid UUID", 400);

  const query = new URL(request.url).searchParams;
  const page = queryInteger(query.get("page"), 1);
  const pageSize = queryInteger(query.get("pageSize"), 6);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 20) {
    return apiFail("INVALID_QUERY", "page must be positive and pageSize must be between 1 and 20", 400);
  }

  try {
    if (!await activePlace(placeId)) return apiFail("NOT_FOUND", "Place not found", 404);
    const user = await currentUser();
    return apiOk(await getPlaceCommentsPage(placeId, { page, pageSize, viewerId: user?.id }, createServiceClient()));
  } catch (error) {
    return apiFail("DB_ERROR", error instanceof Error ? error.message : "Could not load local notes", 500);
  }
}

export async function POST(request: Request, { params }: Props) {
  const { placeId } = await params;
  if (!UUID.test(placeId)) return apiFail("INVALID_PLACE", "placeId must be a valid UUID", 400);
  const user = await currentUser();
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const parsed = await parseBody(request, placeCommentCreateSchema);
  if (!parsed.ok) return parsed.response;
  const cleaned = cleanUserContent(parsed.data.body);
  if (cleaned.hadSlur) return apiFail("CONTENT_REJECTED", "This note cannot be published", 422);
  const safeBody = cleaned.display.trim();
  if (safeBody.length < 8 || safeBody.length > 600) {
    return apiFail("VALIDATION_FAILED", "The cleaned note must be between 8 and 600 characters", 422);
  }

  try {
    if (!await activePlace(placeId)) return apiFail("NOT_FOUND", "Place not found", 404);
    const service = createServiceClient();
    const { data: profile, error: profileError } = await service
      .from("users")
      .select("full_name,display_name,avatar_url,city")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) return apiFail("DB_ERROR", profileError.message, 500);

    const { data, error } = await service
      .from("place_comments")
      .insert({
        place_id: placeId,
        user_id: user.id,
        body: safeBody,
        is_anonymous: parsed.data.isAnonymous,
      })
      .select("id,place_id,user_id,body,is_anonymous,created_at")
      .single();
    if (error) return apiFail("DB_ERROR", error.message, 500);

    return apiOk(toPlaceComment({ ...data, users: profile }, user.id), { status: 201 });
  } catch (error) {
    return apiFail("DB_ERROR", error instanceof Error ? error.message : "Could not publish local note", 500);
  }
}

export async function DELETE(request: Request, { params }: Props) {
  const { placeId } = await params;
  if (!UUID.test(placeId)) return apiFail("INVALID_PLACE", "placeId must be a valid UUID", 400);
  const user = await currentUser();
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const parsed = await parseBody(request, placeCommentDeleteSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const { data, error } = await createServiceClient()
      .from("place_comments")
      .delete()
      .eq("id", parsed.data.commentId)
      .eq("place_id", placeId)
      .eq("user_id", user.id)
      .select("id");
    if (error) return apiFail("DB_ERROR", error.message, 500);
    if (!data || data.length === 0) return apiFail("NOT_FOUND", "Local note not found", 404);
    return apiOk({ id: parsed.data.commentId });
  } catch (error) {
    return apiFail("DB_ERROR", error instanceof Error ? error.message : "Could not delete local note", 500);
  }
}
