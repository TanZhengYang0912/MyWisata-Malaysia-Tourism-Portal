// P4 — Member 4 owns this page
// Sub-module: D2 Order + Booking

import { createClient } from '@/lib/supabase/server';
import { toRM } from '@/lib/money';
import { StatusBadge } from '@/components/ui/badge';
import { format } from 'date-fns';

export default async function OrdersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: orders } = await supabase
    .from('orders')
    .select('*, order_items ( id, product_name, quantity, line_total, fulfil_status )')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">My Orders</h1>

      {(orders ?? []).length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📦</p>
          <p>No orders yet</p>
        </div>
      )}

      {(orders ?? []).map(order => (
        <div key={order.id} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-gray-400">Order ID</p>
              <p className="text-sm font-mono">{order.id.slice(0, 8).toUpperCase()}</p>
            </div>
            <StatusBadge status={order.status} />
          </div>
          <div className="space-y-1 mb-3">
            {(order.order_items as Record<string, unknown>[]).map(item => (
              <div key={String(item.id)} className="flex justify-between text-sm">
                <span className="text-gray-700">{String(item.product_name)} × {Number(item.quantity)}</span>
                <span>{toRM(Number(item.line_total))}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm text-gray-500">
              {format(new Date(order.created_at), 'd MMM yyyy')}
            </span>
            <span className="font-semibold text-primary-600">{toRM(order.total_amount)}</span>
          </div>
          {/* TODO P3/C3: "Write Review" button for completed orders */}
          {order.status === 'completed' && (
            <button className="mt-2 text-sm text-primary-600 hover:underline">Write a review</button>
          )}
        </div>
      ))}
    </div>
  );
}
