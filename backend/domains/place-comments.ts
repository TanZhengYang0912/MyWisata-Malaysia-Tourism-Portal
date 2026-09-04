import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlaceComment, PlaceCommentsPage } from "@/backend/core/types";

export type PlaceCommentRow = {
  id: string;
  place_id: string;
  user_id: string;
  body: string;
  is_anonymous?: boolean | null;
  created_at: string;
  users: {
    full_name: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
    city?: string | null;
  } | null;
};

export function formatPlaceCommentAuthor(fullName: string | null | undefined, displayName?: string | null): string {
  if (displayName?.trim()) return displayName.trim();
  return fullName?.trim() ? fullName.trim() : "Local visitor";
}

export function toPlaceComment(row: PlaceCommentRow, viewerId?: string | null): PlaceComment {
  const isAnonymous = Boolean(row.is_anonymous);
  if (isAnonymous) {
    return {
      id: row.id,
      placeId: row.place_id,
      body: row.body,
      createdAt: row.created_at,
      authorName: "Anonymous Visitor",
      authorAvatarUrl: null,
      authorInitial: "A",
      authorCity: null,
      isAnonymous: true,
      canDelete: viewerId === row.user_id,
    };
  }

  const authorName = formatPlaceCommentAuthor(row.users?.full_name, row.users?.display_name);
  const authorInitial = (authorName[0] || "L").toUpperCase();

  return {
    id: row.id,
    placeId: row.place_id,
    body: row.body,
    createdAt: row.created_at,
    authorName,
    authorAvatarUrl: row.users?.avatar_url ?? null,
    authorInitial,
    authorCity: row.users?.city?.trim() || null,
    isAnonymous: false,
    canDelete: viewerId === row.user_id,
  };
}

export async function getPlaceCommentsPage(
  placeId: string,
  options: { page: number; pageSize: number; viewerId?: string | null },
  db: SupabaseClient,
): Promise<PlaceCommentsPage> {
  const from = (options.page - 1) * options.pageSize;
  const { data, error, count } = await db
    .from("place_comments")
    .select("id,place_id,user_id,body,is_anonymous,created_at,users(full_name,display_name,avatar_url,city)", { count: "exact" })
    .eq("place_id", placeId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .range(from, from + options.pageSize - 1);

  if (error) throw error;
  return {
    items: ((data ?? []) as unknown as PlaceCommentRow[]).map((row) => toPlaceComment(row, options.viewerId)),
    total: count ?? 0,
  };
}
