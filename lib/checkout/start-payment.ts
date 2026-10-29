import { scheduleReceiptDelivery } from '@/lib/email/events';
import { privateCheckoutJson } from '@/lib/checkout/guest-session';
import type { CheckoutBuyer } from './subject';
import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe';
import {
  createSimulatorPaymentSession,
  isSimulatorCheckoutProvider,
  resolveCheckoutProvider,
  type SimulatorCheckoutProvider,
} from '@/lib/payments/providers';
import { isPaymentSimulatorEnabled } from '@/lib/payments/simulator-config';
import { ToyyibPayProvider } from '@/lib/payments/toyyibpay';
import { resolvePaymentAppUrl, resolveToyyibPayActionUrl } from '@/lib/payments/app-url';

// Shared by the cart checkout (app/api/checkout/prepare) and the event
// reserve-now checkout (app/api/events/checkout): both create the order and
// checkout session in SQL, then start the same payment flows here.

export type CheckoutPaymentPlan = {
  paymentMethod: string;
  walletSplit: boolean;
  walletReservation: boolean;
  isToyyibPay: boolean;
  simulatorProvider: SimulatorCheckoutProvider | null;
};

export type PreparedCheckout = Record<string, unknown> & {
  checkout_session_id: string;
  order_id: string;
  status: string;
};

/** Validates the method/provider pair and its requirements before any order is created. */
export function planCheckoutPayment(
  paymentMethod: string,
  paymentProvider: string | undefined,
  user: User | CheckoutBuyer,
): { ok: true; plan: CheckoutPaymentPlan } | { ok: false; response: NextResponse } {
  const contact = 'subject' in user ? user.contact : { email: user.email ?? '', phone: user.phone ?? null };
  if ('subject' in user && user.subject.kind === 'guest' && ['wallet', 'wallet_split'].includes(paymentMethod)) return { ok: false, response: privateCheckoutJson({ error: { code: 'GUEST_ACCOUNT_FEATURE_DENIED', message: 'Sign in to use a wallet.' } }, { status: 403 }) };
  let checkoutProvider;
  try {
    checkoutProvider = resolveCheckoutProvider(paymentMethod, paymentProvider);
  } catch {
    return {
      ok: false,
      response: privateCheckoutJson({
        data: null,
        error: {
          code: 'PAYMENT_PROVIDER_MISMATCH',
          message: 'The selected payment provider does not support this payment method.',
        },
      }, { status: 422 }),
    };
  }
  const simulatorProvider = isSimulatorCheckoutProvider(checkoutProvider) ? checkoutProvider : null;
  const isToyyibPay = checkoutProvider === 'toyyibpay';
  if (simulatorProvider && !isPaymentSimulatorEnabled()) {
    return {
      ok: false,
      response: privateCheckoutJson({
        data: null,
        error: {
          code: 'PAYMENT_SIMULATOR_UNAVAILABLE',
          message: 'This simulated payment method is unavailable in the current environment.',
        },
      }, { status: 503 }),
    };
  }
  if (isToyyibPay && !contact.email?.trim()) {
    return {
      ok: false,
      response: privateCheckoutJson({
        data: null,
        error: { code: 'TOYYIBPAY_EMAIL_REQUIRED', message: 'An email address is required for this payment method.' },
      }, { status: 422 }),
    };
  }
  if (isToyyibPay && !contact.phone?.trim()) {
    return {
      ok: false,
      response: privateCheckoutJson({
        data: null,
        error: { code: 'TOYYIBPAY_PHONE_REQUIRED', message: 'A phone number is required for this payment method.' },
      }, { status: 422 }),
    };
  }
  const walletSplit = paymentMethod === 'wallet_split';
  return {
    ok: true,
    plan: {
      paymentMethod,
      walletSplit,
      walletReservation: walletSplit || paymentMethod === 'wallet',
      isToyyibPay,
      simulatorProvider,
    },
  };
}

/** Starts payment for a prepared checkout session: wallet, ToyyibPay, simulator or Stripe. */
export async function startCheckoutPayment({ db, user, prepared, total, plan }: {
  db: SupabaseClient;
  user: User | CheckoutBuyer;
  request: Request;
  prepared: PreparedCheckout;
  total: number;
  plan: CheckoutPaymentPlan;
}): Promise<NextResponse> {
  if (!['pending_payment', 'requires_action', 'paid'].includes(prepared.status)) return privateCheckoutJson({ error: { code: 'CHECKOUT_CLOSED', message: 'This checkout has closed. Check your order before paying again.' } }, { status: 409 });
  const buyer: CheckoutBuyer = 'subject' in user ? user : { subject: { kind: 'account', userId: user.id }, contact: { email: user.email ?? '', phone: user.phone ?? null, name: typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null } };
  const { paymentMethod, walletSplit, walletReservation, isToyyibPay, simulatorProvider } = plan;
  let response: Record<string, unknown> = { ...(prepared as Record<string, unknown>), total: total };
  if (walletReservation) {
    const { data: split, error: splitError } = await db.rpc('reserve_wallet_split_checkout', {
      p_checkout_session_id: prepared.checkout_session_id,
    });
    if (splitError || !split || typeof split !== 'object') {
      await createServiceClient().rpc('finalize_checkout', {
        p_checkout_session_id: prepared.checkout_session_id,
        p_outcome: 'failed',
        p_provider_payment_id: null,
        p_provider_event_id: null,
      });
      return privateCheckoutJson({ error: { code: 'WALLET_RESERVATION_FAILED', message: 'Your wallet reservation could not be completed. Please try again.' } }, { status: 409 });
    }
    const walletAmountSen = Number(split.wallet_amount_sen);
    const reservedExternalAmountSen = Number(split.external_amount_sen);
    const expectedReservationState = prepared.status === 'paid' ? 'committed' : 'reserved';
    const reservationIsValid = Number.isSafeInteger(walletAmountSen)
      && Number.isSafeInteger(reservedExternalAmountSen)
      && walletAmountSen >= 0
      && reservedExternalAmountSen >= 0
      && walletAmountSen + reservedExternalAmountSen === Math.round(total * 100)
      && split.status === expectedReservationState;
    if (!reservationIsValid) {
      if (prepared.status !== 'paid') {
        await createServiceClient().rpc('finalize_checkout', {
          p_checkout_session_id: prepared.checkout_session_id,
          p_outcome: 'failed',
          p_provider_payment_id: null,
          p_provider_event_id: null,
        });
      }
      return privateCheckoutJson({ error: { code: 'WALLET_RESERVATION_INVALID', message: 'The wallet reservation could not be verified. Please refresh checkout.' } }, { status: 409 });
    }
    if (!walletSplit && reservedExternalAmountSen !== 0) {
      await createServiceClient().rpc('finalize_checkout', {
        p_checkout_session_id: prepared.checkout_session_id,
        p_outcome: 'failed',
        p_provider_payment_id: null,
        p_provider_event_id: null,
      });
      return privateCheckoutJson({
        error: { code: 'WALLET_INSUFFICIENT', message: 'Your wallet balance is not enough for this order.' },
      }, { status: 409 });
    }
    response = { ...response, walletAmountSen, externalAmountSen: reservedExternalAmountSen };
  }
  const externalAmountSen = walletSplit ? Number(response.externalAmountSen) : Math.round(total * 100);
  if (isToyyibPay && prepared?.status !== 'paid') {
    const provider = new ToyyibPayProvider();
    if (!provider.isConfigured()) {
      return privateCheckoutJson({
        data: null,
        error: { code: 'TOYYIBPAY_UNAVAILABLE', message: 'ToyyibPay is not configured.' },
      }, { status: 503 });
    }

    let appUrl: string;
    try {
      appUrl = resolvePaymentAppUrl();
    } catch {
      return privateCheckoutJson({
        data: null,
        error: { code: 'PAYMENT_APP_URL_INVALID', message: 'The payment return URL is not configured safely.' },
      }, { status: 503 });
    }

    const checkoutSessionId = String(prepared.checkout_session_id);
    const orderId = String(prepared.order_id);
    const service = createServiceClient();
    const { data: beginData, error: beginError } = await service.rpc('begin_toyyibpay_checkout', {
      p_checkout_session_id: checkoutSessionId,
    });
    if (beginError || !beginData || typeof beginData !== 'object') {
      return privateCheckoutJson({
        data: null,
        error: { code: 'TOYYIBPAY_PREPARE_FAILED', message: 'The ToyyibPay checkout could not be prepared.' },
      }, { status: 503 });
    }

    const begin = beginData as Record<string, unknown>;
    if (begin.state === 'indeterminate') {
      return privateCheckoutJson({
        data: null,
        error: {
          code: 'TOYYIBPAY_CREATE_INDETERMINATE',
          message: 'A previous ToyyibPay bill attempt requires reconciliation before retrying.',
        },
      }, { status: 409 });
    }
    if (begin.state === 'created' && typeof begin.provider_payment_id === 'string') {
      if (
        begin.checkout_session_id !== checkoutSessionId
        || begin.order_id !== orderId
        || begin.currency !== 'MYR'
        || Number(begin.amount_sen) !== externalAmountSen
      ) {
        return privateCheckoutJson({
          data: null,
          error: { code: 'TOYYIBPAY_PREPARE_CONFLICT', message: 'The provider checkout does not match this order.' },
        }, { status: 409 });
      }
      try {
        return privateCheckoutJson({
          data: { ...response, toyyibpayUrl: resolveToyyibPayActionUrl(begin.provider_payment_id) },
          error: null,
        });
      } catch {
        return privateCheckoutJson({
          data: null,
          error: { code: 'TOYYIBPAY_UNAVAILABLE', message: 'ToyyibPay is not configured.' },
        }, { status: 503 });
      }
    }

    const amountSen = Number(begin.amount_sen);
    if (
      begin.state !== 'ready'
      || begin.checkout_session_id !== checkoutSessionId
      || begin.order_id !== orderId
      || begin.currency !== 'MYR'
      || amountSen !== externalAmountSen
      || !Number.isSafeInteger(amountSen)
      || amountSen <= 0
    ) {
      return privateCheckoutJson({
        data: null,
        error: { code: 'TOYYIBPAY_PREPARE_CONFLICT', message: 'The provider checkout does not match this order.' },
      }, { status: 409 });
    }

    let providerSession;
    try {
      providerSession = await provider.createPayment({
        checkoutSessionId,
        orderId,
        amountSen,
        currency: 'MYR',
        customer: {
          name: buyer.contact.name ?? buyer.contact.email.split('@')[0],
          email: buyer.contact.email,
          phone: buyer.contact.phone!,
        },
        returnUrl: `${appUrl}/customer/orders/${orderId}`,
        callbackUrl: `${appUrl}/api/payments/toyyibpay/callback`,
      });
    } catch {
      return privateCheckoutJson({
        data: null,
        error: { code: 'TOYYIBPAY_PREPARE_FAILED', message: 'ToyyibPay could not create the payment bill.' },
      }, { status: 503 });
    }

    const { data: completeData, error: completeError } = await service.rpc('complete_toyyibpay_checkout', {
      p_checkout_session_id: checkoutSessionId,
      p_provider_payment_id: providerSession.providerPaymentId,
    });
    if (
      completeError
      || !completeData
      || typeof completeData !== 'object'
      || (completeData as Record<string, unknown>).state !== 'created'
      || (completeData as Record<string, unknown>).provider_payment_id !== providerSession.providerPaymentId
    ) {
      return privateCheckoutJson({
        data: null,
        error: {
          code: 'TOYYIBPAY_CREATE_INDETERMINATE',
          message: 'The ToyyibPay bill was created but could not be attached automatically.',
        },
      }, { status: 503 });
    }

    return privateCheckoutJson({
      data: { ...response, toyyibpayUrl: providerSession.actionUrl },
      error: null,
    });
  }
  if (simulatorProvider && prepared?.status !== 'paid') {
    const checkoutSessionId = String(prepared.checkout_session_id);
    const simulatorSession = createSimulatorPaymentSession({
      checkoutSessionId,
      provider: simulatorProvider,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      secret: process.env.PAYMENT_SIMULATOR_WEBHOOK_SECRET ?? '',
    });
    const service = createServiceClient();
    const { error: paymentUpdateError } = await service.from('payments').update({
      provider: simulatorProvider,
      provider_payment_id: simulatorSession.providerPaymentId,
      status: 'requires_action',
      updated_at: new Date().toISOString(),
    }).eq('order_id', prepared.order_id);
    const { error: sessionUpdateError } = await service.from('checkout_sessions').update({
      status: 'requires_action',
      updated_at: new Date().toISOString(),
    }).eq('id', checkoutSessionId);
    if (paymentUpdateError || sessionUpdateError) {
      return privateCheckoutJson({
        data: null,
        error: {
          code: 'PAYMENT_SIMULATOR_PREPARE_FAILED',
          message: 'The simulated provider session could not be prepared.',
        },
      }, { status: 503 });
    }
    return privateCheckoutJson({
      data: { ...response, simulatorUrl: simulatorSession.actionUrl },
      error: null,
    });
  }
  if ((paymentMethod === 'stripe_card' || walletSplit) && prepared?.status !== 'paid' && externalAmountSen > 0) {
    let origin: string;
    try { origin = resolvePaymentAppUrl(); } catch { return privateCheckoutJson({error:{code:'PAYMENT_APP_URL_INVALID',message:'The payment return URL is not configured safely.'}},{status:503}); }
    const checkoutSessionId = String(prepared.checkout_session_id);
    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'myr',
          unit_amount: externalAmountSen,
          product_data: { name: `MYLawatan order ${String(prepared.order_id).slice(0, 8)}` },
        },
        quantity: 1,
      }],
      metadata: { ...(buyer.subject.kind === 'account' ? { user_id: buyer.subject.userId } : { guest_subject_id: buyer.subject.guestSubjectId }), subject_kind: buyer.subject.kind, checkout_session_id: checkoutSessionId, order_id: String(prepared.order_id), payment_kind: 'order' },
      success_url: `${origin}/customer/checkout?stripe_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/customer/checkout?stripe_cancelled=1`,
    });
    const service = createServiceClient();
    try {
      const { data: paymentLink, error: paymentUpdateError } = await service.from('payments')
        .update({ provider_payment_id: stripeSession.id, status: 'requires_action', updated_at: new Date().toISOString() })
        .eq('order_id', prepared.order_id)
        .select('id')
        .maybeSingle();
      if (paymentUpdateError || !paymentLink) {
        return privateCheckoutJson({
          data: null,
          error: {
            code: 'PAYMENT_SESSION_PERSIST_FAILED',
            message: 'The payment session could not be linked to this order. Please retry checkout.',
          },
        }, { status: 503 });
      }

      const { data: checkoutLink, error: checkoutUpdateError } = await service.from('checkout_sessions')
        .update({ status: 'requires_action', updated_at: new Date().toISOString() })
        .eq('id', checkoutSessionId)
        .select('id')
        .maybeSingle();
      if (checkoutUpdateError || !checkoutLink) {
        return privateCheckoutJson({
          data: null,
          error: {
            code: 'PAYMENT_SESSION_PERSIST_FAILED',
            message: 'The payment session could not be linked to this order. Please retry checkout.',
          },
        }, { status: 503 });
      }
    } catch {
      return privateCheckoutJson({
        data: null,
        error: {
          code: 'PAYMENT_SESSION_PERSIST_FAILED',
          message: 'The payment session could not be linked to this order. Please retry checkout.',
        },
      }, { status: 503 });
    }
    return privateCheckoutJson({ data: { ...response, stripeUrl: stripeSession.url }, error: null });
  }
  if (prepared.status === 'paid') scheduleReceiptDelivery();
  return privateCheckoutJson({ data: response, error: null });
}
