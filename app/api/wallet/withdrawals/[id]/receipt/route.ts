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
  payout_provider: string | null;
  stripe_payout_id: string | null;
  payout_provider_event_id: string | null;
  customer_reason: string | null;
  payout_failure_category: string | null;
  payout_failure_retryable: boolean | null;
};

function maskPayoutReference(value: string | null): string | null {
  return value ? `••••••••${value.slice(-4)}` : null;
}

function getStatusGuidanceCode(withdrawal: WithdrawalRow) {
  if (withdrawal.status === 'failed') {
    return 'failed';
  }
  if (withdrawal.status === 'processing') {
    return 'processing';
  }
  if (withdrawal.status === 'approved' && withdrawal.payout_failure_retryable === false) {
    return 'approvedReconciliation';
  }
  if (withdrawal.status === 'approved') {
    return 'approved';
  }
  if (withdrawal.status === 'paid' || withdrawal.status === 'completed') {
    return 'completed';
  }
  return null;
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
    .select("id, user_id, amount, status, created_at, updated_at, destination_label, payout_provider, stripe_payout_id, payout_provider_event_id, customer_reason, payout_failure_category, payout_failure_retryable")
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
    destinationLabel: withdrawal.destination_label,
    payoutProvider: withdrawal.payout_provider ?? "stripe_connect",
    payoutReference: maskPayoutReference(
      withdrawal.payout_provider === "tng_direct_credit"
        ? withdrawal.payout_provider_event_id
        : withdrawal.stripe_payout_id,
    ),
    customerReason: withdrawal.customer_reason,
    statusGuidanceCode: getStatusGuidanceCode(withdrawal),
  });
}
