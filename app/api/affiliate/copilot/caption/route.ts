// P4 — Member 4: Affiliate Copilot (CLAUDE-AFFILIATE-COPILOT.md).
// POST /api/affiliate/copilot/caption — a ready-to-post caption for ONE
// real, active listing, in the requested language. Same capability gate
// as the signals route; body validated by copilotCaptionSchema.

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { copilotCaptionSchema } from '@/lib/validation/affiliate-schemas';
import { draftCopilotCaption } from '@/lib/affiliate/copilot';
import {
  customerCapabilityFailure,
  resolveServerCustomerCapability,
} from '@/lib/auth/customer-capabilities.server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const decision = await resolveServerCustomerCapability(user.id, 'affiliate.earn_commission');
  const failure = customerCapabilityFailure(
    'affiliate.earn_commission',
    decision,
    'Complete KYC verification to generate a caption',
  );
  if (failure) return failure;

  const parsed = copilotCaptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiFail('VALIDATION_ERROR', 'Invalid request body', 400);

  const result = await draftCopilotCaption(parsed.data.productId, parsed.data.lang);
  if (!result) return apiFail('NOT_FOUND', 'Listing not found or not currently active', 404);

  return apiOk(result);
}
