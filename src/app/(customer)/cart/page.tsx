'use client';
// P4 — Member 4 owns this page
// Sub-module: D1 Cart + Voucher + Mock Checkout

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toRM, lineTotal } from '@/lib/money';

export default function CartPage() {
  const [items, setItems]   = useState<Record<string, unknown>[]>([]);
  const [voucher, setVoucher] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO P4/D1: Fetch cart items via /api/cart GET
    setLoading(false);
  }, []);

  const subtotal = items.reduce((s, i) => s + lineTotal(Number(i.unit_price), Number(i.quantity)), 0);

  async function handleCheckout(method: 'mock_card' | 'wallet') {
    // TODO P4/D1: POST /api/orders { paymentMethod, voucherCode }
    //   → creates order + order_items + payments(mock) + triggers onOrderPaid()
    alert(`[DEMO] Mock ${method} payment — connect to /api/orders in D1`);
  }

  if (loading) return <div className="text-center py-16 text-gray-400">Loading cart…</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Your Cart</h1>

      {items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🛒</p>
          <p>Your cart is empty</p>
          <a href="/discovery" className="text-primary-600 hover:underline text-sm mt-2 inline-block">Browse activities</a>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Item list */}
          <div className="lg:col-span-2 space-y-3">
            {items.map(item => (
              <div key={String(item.id)} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4">
                <div className="w-20 h-16 bg-gray-100 rounded-lg flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{String(item.product_name ?? '')}</p>
                  <p className="text-xs text-gray-400">{String(item.variant_name ?? '')}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-primary-600 font-semibold text-sm">
                      {toRM(lineTotal(Number(item.unit_price), Number(item.quantity)))}
                    </p>
                    {/* TODO P4/D1: Qty stepper + remove button */}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Order summary */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <h2 className="font-semibold">Order Summary</h2>
              {/* Voucher */}
              <div className="flex gap-2">
                <input
                  value={voucher} onChange={e => setVoucher(e.target.value)}
                  placeholder="Voucher code"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                />
                <button className="bg-gray-100 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-200 transition-colors">
                  Apply
                </button>
              </div>
              <div className="border-t pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span><span>{toRM(subtotal)}</span>
                </div>
                <div className="flex justify-between font-semibold text-base mt-2">
                  <span>Total</span><span className="text-primary-600">{toRM(subtotal)}</span>
                </div>
              </div>
              {/* Mock payment buttons */}
              <button
                onClick={() => handleCheckout('mock_card')}
                className="w-full bg-primary-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
              >
                Pay with Card (Demo)
              </button>
              <button
                onClick={() => handleCheckout('wallet')}
                className="w-full border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Pay with Wallet Balance
              </button>
              <p className="text-xs text-center text-amber-600">
                ⚠️ Demo mode — no real payment processed
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
