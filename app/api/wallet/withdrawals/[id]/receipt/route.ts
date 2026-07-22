import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { apiFail, apiOk } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

type WithdrawalRow = {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  created_at: string;
  updated_at: string;
  destination_label: string | null;
  stripe_payout_id: string | null;
  customer_reason: string | null;
};

function maskPayoutReference(value: string | null): string | null {
  return value ? `••••••••${value.slice(-4)}` : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  // The ownership predicate is part of the database query. Never fetch a
  // receipt by id first and perform an ownership check in JavaScript.
  const { data, error } = await createServiceClient()
    .from("withdrawal_requests")
    .select("id, user_id, amount, status, created_at, updated_at, destination_label, stripe_payout_id, customer_reason")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) return apiFail("NOT_FOUND", "Withdrawal receipt not found", 404);
  const withdrawal = data as WithdrawalRow;

  return apiOk({
    id: withdrawal.id,
    reference: `WD-${withdrawal.id.slice(-8).toUpperCase()}`,
    amountRm: Number(withdrawal.amount),
    status: withdrawal.status,
    createdAt: withdrawal.created_at,
    updatedAt: withdrawal.updated_at,
    destinationLabel: withdrawal.destination_label ?? "Stripe Connect payout",
    payoutReference: maskPayoutReference(withdrawal.stripe_payout_id),
    customerReason: withdrawal.customer_reason,
  });
}
