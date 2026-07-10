// P2 — Member 2 owns this page
// Sub-module: B2 Outlet & Product catalogue CRUD

import { createClient } from '@/lib/supabase/server';
import { toRM } from '@/lib/money';
import { StatusBadge } from '@/components/ui/badge';

export default async function VendorProductsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: vendor } = await supabase
    .from('vendors')
    .select('id')
    .eq('owner_id', user!.id)
    .eq('status', 'approved')
    .single();

  const { data: products } = await supabase
    .from('products')
    .select('*, outlets(name), product_variants(*), categories(name)')
    .eq('vendor_id', vendor?.id ?? '')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Products & Activities</h1>
        {/* TODO P2/B2: Add Product modal/form */}
        <button className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 transition-colors">
          + Add Product
        </button>
      </div>

      {(products ?? []).length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📦</p>
          <p>No products yet — add your first listing</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-gray-500 text-left">
                <th className="p-3">Product</th>
                <th className="p-3">Outlet</th>
                <th className="p-3">Type</th>
                <th className="p-3">Price</th>
                <th className="p-3">Variants</th>
                <th className="p-3">Status</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(products ?? []).map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3 text-gray-500">{(p.outlets as Record<string, unknown>)?.name as string}</td>
                  <td className="p-3 capitalize">{p.product_type}</td>
                  <td className="p-3">{toRM(p.base_price)}</td>
                  <td className="p-3">{(p.product_variants as unknown[]).length}</td>
                  <td className="p-3"><StatusBadge status={p.status} /></td>
                  <td className="p-3">
                    {/* TODO P2/B2: Edit, archive actions */}
                    <button className="text-xs text-primary-600 hover:underline mr-3">Edit</button>
                    <button className="text-xs text-red-500 hover:underline">Archive</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
