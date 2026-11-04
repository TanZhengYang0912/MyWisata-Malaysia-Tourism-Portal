import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { CUSTOMER_CAPABILITY, resolveCustomerCapability } from '@/lib/auth/customer-capabilities';
import { customerCapabilityFailure, resolveServerCustomerCapability } from '@/lib/auth/customer-capabilities.server';
import { STRIPE_TOP_UP_MAXIMUM_RM, STRIPE_TOP_UP_MAXIMUM_SEN, STRIPE_TOP_UP_MINIMUM_RM } from '@/lib/stripe/top-up-limits';
import { formatMYR } from '@/lib/i18n/format';
import { databaseUuidSchema, parseBody } from '@/lib/validation/schemas';
import { getActiveWalletTopUp, startOrResumeWalletTopUp } from '@/lib/wallet/topup-operations';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  amount_rm: z.number().finite(),
  operation_id: databaseUuidSchema.optional(),
}).strict();

function privateJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export async function POST(req: Request) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user || user.is_anonymous) {
    const denied = customerCapabilityFailure(
      CUSTOMER_CAPABILITY.WALLET_TOP_UP,
      resolveCustomerCapability(null, CUSTOMER_CAPABILITY.WALLET_TOP_UP),
      'Sign in before topping up your wallet',
    )!;
    denied.headers.set('Cache-Control', 'private, no-store, max-age=0');
    denied.headers.set('Referrer-Policy', 'no-referrer');
    return denied;
  }

  const decision = await resolveServerCustomerCapability(user.id, CUSTOMER_CAPABILITY.WALLET_TOP_UP);
  const denied = customerCapabilityFailure(
    CUSTOMER_CAPABILITY.WALLET_TOP_UP,
    decision,
    'Phone verification is required before wallet top-up',
  );
  if (denied) {
    denied.headers.set('Cache-Control', 'private, no-store, max-age=0');
    denied.headers.set('Referrer-Policy', 'no-referrer');
    return denied;
  }

  const parsed = await parseBody(req, createSchema, { maxBytes: 2048 });
  if (!parsed.ok) return privateJson(await parsed.response.json(), parsed.response.status);
  const amountRM = parsed.data.amount_rm;
  if (amountRM < STRIPE_TOP_UP_MINIMUM_RM) {
    return privateJson({ error: `Minimum top-up is ${formatMYR(STRIPE_TOP_UP_MINIMUM_RM)}` }, 400);
  }
  if (amountRM > STRIPE_TOP_UP_MAXIMUM_RM) {
    return privateJson({ error: `Maximum top-up is ${formatMYR(STRIPE_TOP_UP_MAXIMUM_RM)}` }, 400);
  }
  if (!Number.isSafeInteger(amountRM * 100)) {
    return privateJson({ error: 'Enter an amount with no more than two decimal places' }, 400);
  }
  const amountSen = Math.round(amountRM * 100);
  if (!Number.isSafeInteger(amountSen) || amountSen > STRIPE_TOP_UP_MAXIMUM_SEN) {
    return privateJson({ error: `Maximum top-up is ${formatMYR(STRIPE_TOP_UP_MAXIMUM_RM)}` }, 400);
  }

  const { data: profile, error: profileError } = await db.from('users')
    .select('email,full_name').eq('id', user.id).maybeSingle();
  if (profileError || !profile) return privateJson({ error: 'User not found' }, 404);

  try {
    const result = await startOrResumeWalletTopUp({
      ownerUserId: user.id,
      email: profile.email ?? user.email ?? null,
      fullName: profile.full_name ?? null,
      amountSen,
      operationId: parsed.data.operation_id ?? randomUUID(),
    });
    return privateJson(result, result.state === 'checking' || result.state === 'paid_pending_credit' ? 202 : 200);
  } catch (error) {
    if (error instanceof Error && error.message === 'wallet_topup_active_amount_conflict') {
      let activeOperation = null;
      try { activeOperation = await getActiveWalletTopUp(user.id); } catch { /* Keep the actionable conflict response safe. */ }
      return privateJson({ error: 'A top-up is already in progress. Check its status before starting another.', activeOperation }, 409);
    }
    return privateJson({ error: 'Unable to start this top-up. Check its status before retrying.' }, 503);
  }
}
