// P2 — Member 2 owns B1 vendor onboarding (approval flow)
// P1 — Member 1 owns the audit trail written on approve/reject

import { createClient } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/ui/badge';
import { format } from 'date-fns';

export default async function AdminVendorsPage() {
  const supabase = await createClient();

  const { data: vendors } = await supabase
    .from('vendors')
    .select('*, users!vendors_owner_id_fkey(full_name, email), outlets(count)')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Vendor Management</h1>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {['all','pending','approved','rejected','suspended'].map(s => (
          <button key={s} className="px-3 py-1.5 text-sm rounded-full border border-gray-200 bg-white hover:bg-gray-50 capitalize">
            {s}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr className="text-gray-500 text-left">
              <th className="p-3">Vendor</th>
              <th className="p-3">Owner</th>
              <th className="p-3">Submitted</th>
              <th className="p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(vendors ?? []).map(v => (
              <tr key={v.id} className="hover:bg-gray-50">
                <td className="p-3">
                  <p className="font-medium">{v.name}</p>
                  <p className="text-xs text-gray-400">/{v.slug}</p>
                </td>
                <td className="p-3">
                  <p>{(v.users as Record<string, unknown>)?.full_name as string}</p>
                  <p className="text-xs text-gray-400">{(v.users as Record<string, unknown>)?.email as string}</p>
                </td>
                <td className="p-3 text-gray-500">{format(new Date(v.created_at), 'd MMM yyyy')}</td>
                <td className="p-3"><StatusBadge status={v.status} /></td>
                <td className="p-3">
                  {v.status === 'pending' && (
                    <div className="flex gap-2">
                      {/* TODO P2/B1 + P1/A4: POST /api/admin/vendors/[id]/approve */}
                      <button className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 transition-colors">
                        Approve
                      </button>
                      <button className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 transition-colors">
                        Reject
                      </button>
                    </div>
                  )}
                  {v.status === 'approved' && (
                    <button className="text-xs text-gray-500 hover:text-red-600 transition-colors">Suspend</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
