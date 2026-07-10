// P2 — Member 2 owns this page (vendor view of orders + stats)
// Sub-module: B4 Vendor dashboard

import { createClient } from '@/lib/supabase/server';
import { toRM } from '@/lib/money';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';

export default async function VendorDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Get vendor for this owner
  const { data: vendor } = await supabase
    .from('vendors')
    .select('*, outlets(*)')
    .eq('owner_id', user!.id)
    .eq('status', 'approved')
    .single();

  if (!vendor) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">🏪</p>
        <p className="font-medium">No approved vendor account</p>
        <p className="text-sm mt-1">Register as a vendor or wait for admin approval.</p>
        {/* TODO P2/B1: Register vendor form */}
        <button className="mt-4 bg-primary-600 text-white px-5 py-2 rounded-lg text-sm hover:bg-primary-700 transition-colors">
          Register as Vendor
        </button>
      </div>
    );
  }

  // Recent orders for this vendor
  const outletIds = (vendor.outlets as Record<string, unknown>[]).map(o => String(o.id));
  const { data: recentItems } = await supabase
    .from('order_items')
    .select('*, orders ( status, paid_at )')
    .in('outlet_id', outletIds.length ? outletIds : ['none'])
    .order('created_at', { ascending: false })
    .limit(10);

  // Simple stats
  const totalRevenue = (recentItems ?? [])
    .filter(i => (i.orders as Record<string, unknown>)?.status === 'paid' || (i.orders as Record<string, unknown>)?.status === 'completed')
    .reduce((s, i) => s + Number(i.line_total), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{vendor.name}</h1>
          <p className="text-sm text-gray-500">{(vendor.outlets as Record<string, unknown>[]).length} outlet(s)</p>
        </div>
        <StatusBadge status={vendor.status} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader><CardTitle>Total Revenue</CardTitle></CardHeader>
          <p className="text-2xl font-bold text-primary-600">{toRM(totalRevenue)}</p>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent Orders</CardTitle></CardHeader>
          <p className="text-2xl font-bold">{(recentItems ?? []).length}</p>
        </Card>
        <Card>
          <CardHeader><CardTitle>Outlets</CardTitle></CardHeader>
          <p className="text-2xl font-bold">{(vendor.outlets as Record<string, unknown>[]).length}</p>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pending Items</CardTitle></CardHeader>
          <p className="text-2xl font-bold text-yellow-600">
            {(recentItems ?? []).filter(i => i.fulfil_status === 'pending').length}
          </p>
        </Card>
      </div>

      {/* Recent order items */}
      <Card>
        <CardHeader><CardTitle>Recent Orders</CardTitle></CardHeader>
        {(recentItems ?? []).length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">No orders yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-gray-500 text-left">
                  <th className="pb-2 pr-4">Product</th>
                  <th className="pb-2 pr-4">Qty</th>
                  <th className="pb-2 pr-4">Total</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(recentItems ?? []).map(item => (
                  <tr key={item.id}>
                    <td className="py-2 pr-4 font-medium">{item.product_name}</td>
                    <td className="py-2 pr-4">{item.quantity}</td>
                    <td className="py-2 pr-4">{toRM(Number(item.line_total))}</td>
                    <td className="py-2 pr-4"><StatusBadge status={item.fulfil_status} /></td>
                    <td className="py-2">
                      {/* TODO P2/B4: Mark as fulfilled button */}
                      {item.fulfil_status === 'pending' && (
                        <button className="text-xs text-primary-600 hover:underline">Mark Ready</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
