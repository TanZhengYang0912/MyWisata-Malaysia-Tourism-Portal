import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { recordInteraction } from "@/lib/interactions";

const wishlistSchema = z.object({
  productId: z.string().uuid(),
}).strict();

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const { data, error } = await supabase
    .from("customer_wishlists")
    .select("product_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return apiFail("DB_ERROR", error.message, 500);
  return apiOk({ productIds: (data ?? []).map((row) => row.product_id) });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const parsed = await parseBody(request, wishlistSchema);
  if (!parsed.ok) return parsed.response;

  const { productId } = parsed.data;
  const { error } = await supabase
    .from("customer_wishlists")
    .upsert({ user_id: user.id, product_id: productId }, { onConflict: "user_id,product_id", ignoreDuplicates: true });

  if (error) return apiFail("DB_ERROR", error.message, 500);
  await recordInteraction(supabase, user.id, "save", "product", productId);
  return apiOk({ productId, saved: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const parsed = await parseBody(request, wishlistSchema);
  if (!parsed.ok) return parsed.response;

  const { productId } = parsed.data;
  const { error } = await supabase
    .from("customer_wishlists")
    .delete()
    .eq("user_id", user.id)
    .eq("product_id", productId);

  if (error) return apiFail("DB_ERROR", error.message, 500);
  return apiOk({ productId, saved: false });
}
