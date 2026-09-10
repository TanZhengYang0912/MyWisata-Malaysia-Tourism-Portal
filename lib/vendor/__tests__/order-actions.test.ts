import { describe, expect, it } from 'vitest';
import {
  getBatchFulfilmentActions,
  getOrderFulfilmentAction,
  getItemFulfilmentAction,
} from '@/lib/vendor/order-actions';

describe('vendor order action rules', () => {
  it('shows mark ready only for a uniformly pending paid order', () => {
    expect(getOrderFulfilmentAction('paid', ['pending'])).toBe('ready');
    expect(getOrderFulfilmentAction('completed', ['pending'])).toBe('fulfilled');
    expect(getOrderFulfilmentAction('paid', ['pending', 'ready'])).toBe('review');
  });

  it('keeps item actions aligned with the fulfilment API transition rules', () => {
    expect(getItemFulfilmentAction('paid', 'pending')).toBe('ready');
    expect(getItemFulfilmentAction('completed', 'pending')).toBe('fulfilled');
    expect(getItemFulfilmentAction('paid', 'ready')).toBe('fulfilled');
    expect(getItemFulfilmentAction('paid', 'fulfilled')).toBeNull();
    expect(getItemFulfilmentAction('pending_payment', 'pending')).toBeNull();
  });

  it('returns only actions that can update selected order items', () => {
    expect(getBatchFulfilmentActions([
      { orderStatus: 'paid', fulfilStatus: 'pending' },
      { orderStatus: 'paid', fulfilStatus: 'ready' },
      { orderStatus: 'cancelled', fulfilStatus: 'pending' },
    ])).toEqual({ ready: 1, fulfilled: 1 });
  });
});
