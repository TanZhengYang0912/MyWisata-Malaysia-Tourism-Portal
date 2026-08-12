// Owner: Member 3 (Discovery/Recommendation/Growth)
import { supabase } from "@/backend/supabase";
import type { VendorRecommendation } from "@/backend/core/types";
import { getPublicUsers } from "@/backend/domains/identity";

type RecRow = {
  id: string;
  recommender_id: string;
  vendor_name: string;
  status: string;
  state: string | null;
  categories: { name: string } | null;
};

const REC_SELECT = "id,recommender_id,vendor_name,status,state,categories(name)";

function mapRecommendation(row: RecRow, authors: Map<string, VendorRecommendation["author"]> = new Map()): VendorRecommendation {
  return {
    id: row.id,
    submittedBy: row.recommender_id,
    name: row.vendor_name,
    category: row.categories?.name ?? "",
    state: row.state ?? "",
    status: row.status as VendorRecommendation["status"],
    qualityScore: 0,
    duplicate: false,
    author: authors.get(row.recommender_id),
  };
}

export async function getVendorRecommendations(): Promise<VendorRecommendation[]> {
  const { data, error } = await supabase
    .from("vendor_recommendations")
    .select(REC_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data as unknown as RecRow[];
  const authors = await getPublicUsers([...new Set(rows.map((row) => row.recommender_id))]);
  const authorMap = new Map(authors.map((author) => [author.id, author]));
  return rows.map((row) => mapRecommendation(row, authorMap));
}

export async function getMyRecommendations(userId: string): Promise<VendorRecommendation[]> {
  const { data, error } = await supabase.from("vendor_recommendations").select(REC_SELECT).eq("recommender_id", userId);
  if (error) throw error;
  const rows = data as unknown as RecRow[];
  const authors = await getPublicUsers([...new Set(rows.map((row) => row.recommender_id))]);
  const authorMap = new Map(authors.map((author) => [author.id, author]));
  return rows.map((row) => mapRecommendation(row, authorMap));
}

export async function submitRecommendation(userId: string, name: string, categoryId: string, state: string): Promise<VendorRecommendation> {
  const { data, error } = await supabase
    .from("vendor_recommendations")
    .insert({ recommender_id: userId, vendor_name: name, category_id: categoryId, state, status: "pending" })
    .select(REC_SELECT)
    .single();
  if (error) throw error;
  const authors = await getPublicUsers([userId]);
  return mapRecommendation(data as unknown as RecRow, new Map(authors.map((author) => [author.id, author])));
}

export async function reviewRecommendation(id: string, status: "approved" | "rejected"): Promise<void> {
  const { error } = await supabase.rpc("review_vendor_recommendation", { p_recommendation_id: id, p_action: status, p_admin_id: (await supabase.auth.getUser()).data.user?.id });
  if (error) throw error;
}
