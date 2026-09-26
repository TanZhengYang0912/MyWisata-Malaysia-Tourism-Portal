import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, checkoutPrepareSchema } from '@/lib/validation/schemas';
import { buildCheckoutRequestHash, normalizeCheckoutRequest } from '@/lib/checkout/idempotency';
import { getCachedActivities } from '@/lib/cache/catalogue-cache';
import { cartTotals, unitPrice } from '@/backend/core/helpers';
import type { CartItem, Voucher } from '@/backend/core/types';
import { stripe } from '@/lib/stripe';
import { getCheckoutErrorCode, getCheckoutErrorMessage } from '@/lib/checkout/errors';
import {
  createSimulatorPaymentSession,
  isSimulatorCheckoutProvider,
  resolveCheckoutProvider,
} from '@/lib/payments/providers';
import { isPaymentSimulatorEnabled } from '@/lib/payments/simulator-config';
import { CUSTOMER_CAPABILITY, resolveCustomerCapability } from '@/lib/auth/customer-capabilities';
import { customerCapabilityFailure, resolveServerCustomerCapability } from '@/lib/auth/customer-capabilities.server';
import { ToyyibPayProvider } from '@/lib/payments/toyyibpay';
import { resolvePaymentAppUrl, resolveToyyibPayActionUrl } from '@/lib/payments/app-url';

type Relation<T> = T | T[] | null;
type CartRow = {
  id: string;
  variant_id: string | null;
  slot_id: string | null;
  outlet_id: string | null;
  quantity: number;
  product_variants: Relation<{ id: string; product_id: string; name: string }>;
  booking_slots: Relation<{ id: string; product_id: string; outlet_id: string; starts_at: string; price_override: number | null }>;
};

function relation<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return customerCapabilityFailure(
    CUSTOMER_CAPABILITY.CHECKOUT,
    resolveCustomerCapability(null, CUSTOMER_CAPABILITY.CHECKOUT),
    'Sign in before checkout',
  )!;

  const checkoutDecision = await resolveServerCustomerCapability(user.id, CUSTOMER_CAPABILITY.CHECKOUT);
  const checkoutFailure = customerCapabilityFailure(
    CUSTOMER_CAPABILITY.CHECKOUT,
    checkoutDecision,
    'Phone verification is required before checkout',
  );
  if (checkoutFailure) return checkoutFailure;

  const parsed = await parseBody(request, checkoutPrepareSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const normalized = normalizeCheckoutRequest(body);
  let checkoutProvider;
  try {
    checkoutProvider = resolveCheckoutProvider(normalized.paymentMethod, normalized.paymentProvider ?? undefined);
  } catch {
    return NextResponse.json({
      data: null,
      error: {
        code: 'PAYMENT_PROVIDER_MISMATCH',
        message: 'The selected payment provider does not support this payment method.',
      },
    }, { status: 422 });
  }
  const simulatorProvider = isSimulatorCheckoutProvider(checkoutProvider) ? checkoutProvider : null;
  const isToyyibPay = checkoutProvider === 'toyyibpay';
  if (simulatorProvider && !isPaymentSimulatorEnabled()) {
    return NextResponse.json({
      data: null,
      error: {
        code: 'PAYMENT_SIMULATOR_UNAVAILABLE',
        message: 'This simulated payment method is unavailable in the current environment.',
      },
    }, { status: 503 });
  }
  if (isToyyibPay && !user.email?.trim()) {
    return NextResponse.json({
      data: null,
      error: { code: 'TOYYIBPAY_EMAIL_REQUIRED', message: 'An email address is required for this payment method.' },
    }, { status: 422 });
  }
  if (isToyyibPay && !user.phone?.trim()) {
    return NextResponse.json({
      data: null,
      error: { code: 'TOYYIBPAY_PHONE_REQUIRED', message: 'A phone number is required for this payment method.' },
    }, { status: 422 });
  }
  const walletSplit = normalized.paymentMethod === 'wallet_split';
  const walletReservation = walletSplit || normalized.paymentMethod === 'wallet';
  const requestHash = buildCheckoutRequestHash(normalized);

  const { data: cart, error: cartError } = await db.from('carts').select('id').eq('user_id', user.id).maybeSingle();
  if (cartError) return NextResponse.json({ error: cartError.message }, { status: 500 });
  if (!cart) return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });

  const { data: rows, error: rowsError } = await db
    .from('cart_items')
    .select('id,variant_id,slot_id,outlet_id,quantity,product_variants(id,product_id,name),booking_slots(id,product_id,outlet_id,starts_at,price_override)')
    .eq('cart_id', cart.id)
    .order('created_at');
  if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });

  let activities;
  try {
    activities = await getCachedActivities();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load catalogue' }, { status: 503 });
  }
  const activityMap = new Map(activities.map((activity) => [activity.id, activity]));
  const typedRows = (rows ?? []) as unknown as CartRow[];
  const selectedRows = typedRows.filter((row) => {
    const variant = relation(row.product_variants);
    const slot = relation(row.booking_slots);
    const productId = variant?.product_id ?? slot?.product_id;
    // Must stay byte-identical to cartItemKey() in components/providers/cart.tsx —
    // the client sends those keys and a mismatch silently selects nothing.
    const key = `${productId}|${row.variant_id ?? ''}|${row.slot_id ?? ''}|${row.outlet_id ?? ''}`;
    return !body.selectedKeys?.length || body.selectedKeys.includes(key);
  });
  if (!selectedRows.length) return NextResponse.json({ error: 'Select at least one cart item' }, { status: 400 });

  let voucher: Voucher | undefined;
  if (body.voucherCode) {
    const { data: voucherRow, error: voucherError } = await db.from('vouchers')
      .select('id,code,name,voucher_type,discount_value,min_spend,max_uses,uses_count,valid_until,vendor_id,outlet_id,product_id,buy_quantity,free_quantity')
      .ilike('code', body.voucherCode)
      .eq('is_active', true)
      .eq('review_status', 'approved')
      .in('redemption_mode', ['online', 'both'])
      .maybeSingle();
    if (voucherError) return NextResponse.json({ error: voucherError.message }, { status: 500 });
    if (!voucherRow) return NextResponse.json({ error: 'Voucher is not available' }, { status: 422 });
    voucher = {
      id: voucherRow.id,
      code: voucherRow.code,
      name: voucherRow.name ?? undefined,
      type: voucherRow.voucher_type,
      value: Number(voucherRow.discount_value),
      minSpend: Number(voucherRow.min_spend ?? 0),
      usageCap: voucherRow.max_uses ?? Infinity,
      usageCount: Number(voucherRow.uses_count ?? 0),
      expiresAt: voucherRow.valid_until ?? '',
      vendorId: voucherRow.vendor_id ?? undefined,
      outletId: voucherRow.outlet_id ?? undefined,
      productId: voucherRow.product_id ?? undefined,
      buyQuantity: voucherRow.buy_quantity ?? undefined,
      freeQuantity: voucherRow.free_quantity ?? undefined,
    };
  }

  const productIds = [...new Set(selectedRows.flatMap((row) => {
    const variant = relation(row.product_variants);
    const slot = relation(row.booking_slots);
    const productId = variant?.product_id ?? slot?.product_id ?? '';
    return productId ? [productId] : [];
  }))];
  const { data: productRows, error: productRowsError } = await db.from('products')
    .select('id,outlet_id,vendor_id,name,cover_url,base_price,requires_booking,categories(slug)')
    .in('id', productIds);
  if (productRowsError) return NextResponse.json({
    error: {
      code: 'PRODUCT_LOOKUP_FAILED',
      message: 'We could not verify cart items right now. Please try again shortly.',
    },
  }, { status: 503 });
  const productMap = new Map((productRows ?? []).map((row) => [row.id, row]));

  const sharedOutletProductIds = [...new Set(selectedRows.flatMap((row) => {
    const variant = relation(row.product_variants);
    const slot = relation(row.booking_slots);
    const productId = variant?.product_id ?? slot?.product_id ?? '';
    const product = productMap.get(productId);
    return product?.outlet_id === null && row.outlet_id ? [productId] : [];
  }))];
  const sharedOutletIds = [...new Set(selectedRows.flatMap((row) => {
    const variant = relation(row.product_variants);
    const slot = relation(row.booking_slots);
    const productId = variant?.product_id ?? slot?.product_id ?? '';
    return sharedOutletProductIds.includes(productId) && row.outlet_id ? [row.outlet_id] : [];
  }))];
  let outletOffers: { product_id: string; outlet_id: string; price: number | string }[] = [];
  if (sharedOutletProductIds.length > 0 && sharedOutletIds.length > 0) {
    const { data, error } = await db.from('outlet_offers')
      .select('product_id,outlet_id,price')
      .in('product_id', sharedOutletProductIds)
      .in('outlet_id', sharedOutletIds)
      .eq('status', 'active');
    if (error) return NextResponse.json({
      error: {
        code: 'PRODUCT_LOOKUP_FAILED',
        message: 'We could not verify cart items right now. Please try again shortly.',
      },
    }, { status: 503 });
    outletOffers = data ?? [];
  }
  const outletOfferMap = new Map(outletOffers.map((offer) => [`${offer.product_id}|${offer.outlet_id}`, Number(offer.price)]));

  const candidateLines = selectedRows.map((row) => {
    const variant = relation(row.product_variants);
    const slot = relation(row.booking_slots);
    const productId = variant?.product_id ?? slot?.product_id ?? '';
    const activity = activityMap.get(productId);
    const product = productMap.get(productId);
    if (
      !activity
      || !product
      || (!variant && (!product.requires_booking || row.variant_id !== null))
      || (product.requires_booking && !slot)
    ) return null;
    const isSharedProduct = product.outlet_id === null;
    if (!isSharedProduct && product.outlet_id !== row.outlet_id) return null;
    const offerPrice = isSharedProduct && row.outlet_id
      ? outletOfferMap.get(`${productId}|${row.outlet_id}`)
      : undefined;
    if (isSharedProduct && row.outlet_id && offerPrice === undefined) return null;
    const basePrice = offerPrice ?? Number(product.base_price);
    if (!Number.isFinite(basePrice) || basePrice < 0) return null;
    const linePrice = slot?.price_override !== null && slot?.price_override !== undefined
      ? Number(slot.price_override)
      : unitPrice({ ...activity, price: basePrice }, variant?.id ?? '', row.quantity, new Date(), productIds);
    if (!Number.isFinite(linePrice) || linePrice < 0) return null;
    return {
      cartItem: {
        activityId: productId,
        variantId: row.variant_id ?? '',
        slotId: row.slot_id ?? undefined,
        qty: row.quantity,
        outletId: row.outlet_id ?? undefined,
        // cartTotals must use the same outlet-resolved price sent to the DB RPC.
        priceOverride: linePrice,
      } satisfies CartItem,
      line: {
        cart_item_id: row.id,
        product_id: productId,
        variant_id: variant?.id ?? null,
        slot_id: row.slot_id,
        vendor_id: product.vendor_id,
        outlet_id: row.outlet_id,
        product_name: product.name,
        image_url: product.cover_url,
        variant_name: variant?.name ?? null,
        slot_starts_at: slot?.starts_at ?? null,
        unit_price: linePrice,
        quantity: row.quantity,
        line_total: Number((linePrice * row.quantity).toFixed(2)),
        requires_booking: product.requires_booking,
      },
    };
  });
  if (candidateLines.some((line) => line === null)) return NextResponse.json({
    error: {
      code: 'CART_ITEM_UNAVAILABLE',
      message: 'One or more cart items are no longer available. Refresh your cart and try again.',
    },
  }, { status: 409 });
  const pricedLines = candidateLines.filter((line) => line !== null);
  const lines = pricedLines.map(({ line }) => line);
  const totals = cartTotals(pricedLines.map(({ cartItem }) => cartItem), activities, voucher);
  if (voucher && totals.voucherError) return NextResponse.json({ error: totals.voucherError }, { status: 422 });

  const selectedFoodOutlets = [...new Set(lines.flatMap((line) => {
    const product = productMap.get(line.product_id) as { categories?: { slug?: string } | { slug?: string }[] | null } | undefined;
    const category = Array.isArray(product?.categories) ? product.categories[0] : product?.categories;
    return category?.slug === 'food' ? [line.outlet_id] : [];
  }))];
  const selectedModes = normalized.foodServiceModes;
  if (selectedModes.length !== selectedFoodOutlets.length || new Set(selectedModes.map((selection) => selection.outletId)).size !== selectedModes.length) {
    return NextResponse.json({
      data: null,
      error: { code: 'FOOD_SERVICE_MODE_REQUIRED', message: 'Choose dine-in or takeaway for every food outlet in checkout.' },
    }, { status: 422 });
  }
  if (selectedFoodOutlets.length > 0) {
    const { data: foodOutlets, error: outletModesError } = await db.from('outlets')
      .select('id,food_service_modes')
      .in('id', selectedFoodOutlets);
    if (outletModesError) return NextResponse.json({ error: 'Food service options could not be verified. Please try again.' }, { status: 503 });
    const allowedModes = new Map((foodOutlets ?? []).map((outlet: { id: string; food_service_modes: string[] }) => [outlet.id, outlet.food_service_modes]));
    if (selectedModes.some((selection) => !selectedFoodOutlets.includes(selection.outletId) || !allowedModes.get(selection.outletId)?.includes(selection.mode))) {
      return NextResponse.json({
        data: null,
        error: { code: 'FOOD_SERVICE_MODE_UNAVAILABLE', message: 'The selected food service option is unavailable at this outlet. Refresh checkout and try again.' },
      }, { status: 422 });
    }
  }

  const checkoutArgs = {
    p_cart_id: cart.id,
    p_selected_item_ids: selectedRows.map((row) => row.id),
    p_idempotency_key: body.idempotencyKey,
    p_request_hash: requestHash,
    p_payment_method: walletSplit ? 'stripe_card' : normalized.paymentMethod,
    p_subtotal: totals.subtotal,
    p_discount: totals.discount,
    p_total: totals.total,
    p_voucher_code: normalized.voucherCode,
    p_lines: lines,
    ...(normalized.claimId ? { p_claim_id: normalized.claimId } : {}),
  };
  const checkoutFunction = selectedFoodOutlets.length > 0 ? 'prepare_checkout_with_food_service_modes' : 'prepare_checkout';
  const rpcArgs = selectedFoodOutlets.length > 0
    ? { ...checkoutArgs, p_claim_id: normalized.claimId, p_food_service_modes: selectedModes.map(({ outletId, mode }) => ({ outlet_id: outletId, mode })) }
    : checkoutArgs;
  const { data: prepared, error: prepareError } = await db.rpc(checkoutFunction, rpcArgs);
  if (prepareError) {
    const rawMessage = prepareError.message ?? "checkout_failed";
    const code = getCheckoutErrorCode(rawMessage);
    return NextResponse.json(
      { error: { code, message: getCheckoutErrorMessage(code) } },
      { status: 409 },
    );
  }

  let response: Record<string, unknown> = { ...(prepared as Record<string, unknown>), total: totals.total };
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
      return NextResponse.json({ error: { code: 'WALLET_RESERVATION_FAILED', message: 'Your wallet reservation could not be completed. Please try again.' } }, { status: 409 });
    }
    const walletAmountSen = Number(split.wallet_amount_sen);
    const reservedExternalAmountSen = Number(split.external_amount_sen);
    const expectedReservationState = prepared.status === 'paid' ? 'committed' : 'reserved';
    const reservationIsValid = Number.isSafeInteger(walletAmountSen)
      && Number.isSafeInteger(reservedExternalAmountSen)
      && walletAmountSen >= 0
      && reservedExternalAmountSen >= 0
      && walletAmountSen + reservedExternalAmountSen === Math.round(totals.total * 100)
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
      return NextResponse.json({ error: { code: 'WALLET_RESERVATION_INVALID', message: 'The wallet reservation could not be verified. Please refresh checkout.' } }, { status: 409 });
    }
    if (!walletSplit && reservedExternalAmountSen !== 0) {
      await createServiceClient().rpc('finalize_checkout', {
        p_checkout_session_id: prepared.checkout_session_id,
        p_outcome: 'failed',
        p_provider_payment_id: null,
        p_provider_event_id: null,
      });
      return NextResponse.json({
        error: { code: 'WALLET_INSUFFICIENT', message: 'Your wallet balance is not enough for this order.' },
      }, { status: 409 });
    }
    response = { ...response, walletAmountSen, externalAmountSen: reservedExternalAmountSen };
  }
  const externalAmountSen = walletSplit ? Number(response.externalAmountSen) : Math.round(totals.total * 100);
  if (isToyyibPay && prepared?.status !== 'paid') {
    const provider = new ToyyibPayProvider();
    if (!provider.isConfigured()) {
      return NextResponse.json({
        data: null,
        error: { code: 'TOYYIBPAY_UNAVAILABLE', message: 'ToyyibPay is not configured.' },
      }, { status: 503 });
    }

    let appUrl: string;
    try {
      appUrl = resolvePaymentAppUrl();
    } catch {
      return NextResponse.json({
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
      return NextResponse.json({
        data: null,
        error: { code: 'TOYYIBPAY_PREPARE_FAILED', message: 'The ToyyibPay checkout could not be prepared.' },
      }, { status: 503 });
    }

    const begin = beginData as Record<string, unknown>;
    if (begin.state === 'indeterminate') {
      return NextResponse.json({
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
        return NextResponse.json({
          data: null,
          error: { code: 'TOYYIBPAY_PREPARE_CONFLICT', message: 'The provider checkout does not match this order.' },
        }, { status: 409 });
      }
      try {
        return NextResponse.json({
          data: { ...response, toyyibpayUrl: resolveToyyibPayActionUrl(begin.provider_payment_id) },
          error: null,
        });
      } catch {
        return NextResponse.json({
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
      return NextResponse.json({
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
          name: typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()
            ? user.user_metadata.full_name.trim()
            : user.email!.split('@')[0],
          email: user.email!.trim(),
          phone: user.phone!.trim(),
        },
        returnUrl: `${appUrl}/customer/checkout?toyyibpay_return=1`,
        callbackUrl: `${appUrl}/api/payments/toyyibpay/callback`,
      });
    } catch {
      return NextResponse.json({
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
      return NextResponse.json({
        data: null,
        error: {
          code: 'TOYYIBPAY_CREATE_INDETERMINATE',
          message: 'The ToyyibPay bill was created but could not be attached automatically.',
        },
      }, { status: 503 });
    }

    return NextResponse.json({
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
      return NextResponse.json({
        data: null,
        error: {
          code: 'PAYMENT_SIMULATOR_PREPARE_FAILED',
          message: 'The simulated provider session could not be prepared.',
        },
      }, { status: 503 });
    }
    return NextResponse.json({
      data: { ...response, simulatorUrl: simulatorSession.actionUrl },
      error: null,
    });
  }
  if ((normalized.paymentMethod === 'stripe_card' || walletSplit) && prepared?.status !== 'paid' && externalAmountSen > 0) {
    const origin = request.headers.get('origin') ?? 'http://localhost:3000';
    const checkoutSessionId = String(prepared.checkout_session_id);
    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'myr',
          unit_amount: externalAmountSen,
          product_data: { name: `MyLawatan order ${String(prepared.order_id).slice(0, 8)}` },
        },
        quantity: 1,
      }],
      metadata: { user_id: user.id, checkout_session_id: checkoutSessionId, order_id: String(prepared.order_id), payment_kind: 'order' },
      success_url: `${origin}/customer/checkout?stripe_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/customer/checkout?stripe_cancelled=1`,
    });
    const service = createServiceClient();
    await service.from('payments').update({ provider_payment_id: stripeSession.id, status: 'requires_action', updated_at: new Date().toISOString() }).eq('order_id', prepared.order_id);
    await service.from('checkout_sessions').update({ status: 'requires_action', updated_at: new Date().toISOString() }).eq('id', checkoutSessionId);
    return NextResponse.json({ data: { ...response, stripeUrl: stripeSession.url }, error: null });
  }
  return NextResponse.json({ data: response, error: null });
}
