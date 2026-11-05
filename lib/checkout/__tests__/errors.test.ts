import { describe, expect, it } from "vitest";
import { activeCheckoutOrderId, getCheckoutErrorCode, getCheckoutErrorMessage, getCheckoutErrorRecovery, getCheckoutErrorTranslationKey } from "../errors";
import { checkoutContactSchema } from "../contact";

describe("checkout error handling", () => {
  it.each([
    [{ email: '' }, 'CONTACT_EMAIL_REQUIRED'],
    [{ email: 'not-an-email' }, 'CONTACT_EMAIL_INVALID'],
    [{ email: 'a@example.com', phone: '123' }, 'CONTACT_PHONE_INVALID'],
  ])('maps actual contact schema failures to the field that needs correction', (contact, expected) => {
    const result = checkoutContactSchema.safeParse(contact);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getCheckoutErrorCode({ code: 'VALIDATION_FAILED', details: result.error.flatten() })).toBe(expected);
      expect(getCheckoutErrorCode({ code: 'VALIDATION_FAILED', details: { fieldErrors: { contact: result.error.issues.map(issue => issue.message) } } })).toBe(expected);
    }
  });

  it.each(['TOYYIBPAY_UNAVAILABLE', 'PAYMENT_SIMULATOR_UNAVAILABLE', 'PAYMENT_SIMULATOR_PREPARE_FAILED', 'PAYMENT_APP_URL_INVALID'])('provides a safe payment-service explanation for %s', code => {
    expect(getCheckoutErrorCode({ code, message: 'secret provider configuration' })).toBe('PAYMENT_SERVICE_UNAVAILABLE');
    expect(getCheckoutErrorMessage({ code })).toContain('Payment service is temporarily unavailable');
  });

  it.each(['TOYYIBPAY_CREATE_INDETERMINATE', 'TOYYIBPAY_PREPARE_FAILED', 'PAYMENT_SESSION_PERSIST_FAILED'])('does not recommend blindly retrying an uncertain payment setup: %s', code => {
    expect(getCheckoutErrorCode({ code })).toBe('PAYMENT_STATUS_UNCERTAIN');
    expect(getCheckoutErrorRecovery('PAYMENT_STATUS_UNCERTAIN')).toBe('orders');
    expect(getCheckoutErrorMessage('PAYMENT_STATUS_UNCERTAIN')).not.toContain('try again');
  });

  it('keeps translated recovery driven by codes instead of English text', () => {
    expect(getCheckoutErrorTranslationKey('INVENTORY_UNAVAILABLE')).toBe('checkoutErrors.INVENTORY_UNAVAILABLE');
    expect(getCheckoutErrorRecovery('CONTACT_EMAIL_REQUIRED')).toBe('email');
    expect(getCheckoutErrorRecovery('INVENTORY_UNAVAILABLE')).toBe('cart');
    expect(getCheckoutErrorRecovery('PAYMENT_SERVICE_UNAVAILABLE')).toBe('retry');
    expect(getCheckoutErrorCode({ code: 'CONTACT_REQUIRED' })).toBe('CONTACT_EMAIL_REQUIRED');
    expect(getCheckoutErrorCode({ code: 'VALIDATION_FAILED', details: 'private data' })).toBe('CHECKOUT_DETAILS_INVALID');
  });
  it('provides pending-order recovery without exposing arbitrary SQL detail', () => {
    expect(getCheckoutErrorCode('active_checkout_exists')).toBe('ACTIVE_CHECKOUT_EXISTS');
    expect(getCheckoutErrorMessage('ACTIVE_CHECKOUT_EXISTS')).toContain('cancel');
    expect(getCheckoutErrorCode('checkout_commitment_unavailable')).toBe('CHECKOUT_COMMITMENT_UNAVAILABLE');
    const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(activeCheckoutOrderId(JSON.stringify({order_id:id}))).toBe(id);
    expect(activeCheckoutOrderId('{"order_id":"javascript:alert(1)"}')).toBeUndefined();
    expect(activeCheckoutOrderId('private database details')).toBeUndefined();
  });
  it("maps a platform order pause to a temporary checkout response", () => {
    expect(getCheckoutErrorCode("new_orders_paused")).toBe("NEW_ORDERS_PAUSED");
    expect(getCheckoutErrorMessage("new_orders_paused")).toContain("temporarily unavailable");
  });
  it("maps the atomic booking capacity error to an actionable message", () => {
    expect(getCheckoutErrorCode("booking_capacity_unavailable")).toBe("BOOKING_CAPACITY_UNAVAILABLE");
    expect(getCheckoutErrorMessage("booking_capacity_unavailable")).toContain("choose another available slot");
  });

  it("maps structured API errors as well as raw database messages", () => {
    expect(getCheckoutErrorCode({ code: "BOOKING_SLOT_INVALID", message: "booking_slot_invalid" })).toBe("BOOKING_SLOT_INVALID");
    expect(getCheckoutErrorMessage({ code: "INVENTORY_UNAVAILABLE" })).toContain("requested quantity");
  });

  it("explains how to recover when a cart item is no longer available", () => {
    expect(getCheckoutErrorCode({ code: "CART_ITEM_UNAVAILABLE" })).toBe("CART_ITEM_UNAVAILABLE");
    expect(getCheckoutErrorMessage({ code: "CART_ITEM_UNAVAILABLE" })).toContain("Refresh your cart");
  });

  it("does not expose database error text for unknown failures", () => {
    expect(getCheckoutErrorMessage("some_internal_postgres_error")).toBe("We could not start checkout right now. Please try again.");
  });

  it("maps voucher validation failures to actionable customer messages", () => {
    expect(getCheckoutErrorCode("voucher_minimum_spend")).toBe("VOUCHER_MINIMUM_SPEND");
    expect(getCheckoutErrorMessage("voucher_minimum_spend")).toContain("minimum spend");
    expect(getCheckoutErrorMessage("voucher_discount_mismatch")).toContain("discount could not be verified");
  });

  it("maps claimed voucher checkout failures without exposing database text", () => {
    expect(getCheckoutErrorCode("voucher_claim_expired")).toBe("VOUCHER_CLAIM_EXPIRED");
    expect(getCheckoutErrorMessage("voucher_claim_mismatch")).toContain("does not match");
    expect(getCheckoutErrorMessage("voucher_claim_hold_missing")).toContain("no longer available");
  });
});
