// P3 — Member 3 owns C4 Vendor Recommendations
// P1 — Member 1 owns audit trail

import { createClient } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/ui/badge';
import { format } from 'date-fns';

export default async function AdminRecommendationsPage() {
  const supabase = await createClient();

  const { data: recs } = await supabase
    .from('vendor_recommendations')
    .select('*, users!vendor_recommendations_recommender_id_fkey(full_name, email), categories(name)')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Vendor Recommendations</h1>
      <p className="text-sm text-gray-500">
        Community-submitted vendor recommendations. Approve to invite vendor; converting a first sale credits the recommender.
      </p>

      <div className="space-y-3">
        {(recs ?? []).map(r => (
          <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-medium">{r.vendor_name}</h3>
                {r.vendor_address && <p className="text-xs text-gray-400">{r.vendor_address}</p>}
                {r.description && <p className="text-sm text-gray-600 mt-1">{r.description}</p>}
                <div className="flex gap-3 mt-2 text-xs text-gray-400">
                  <span>By: {(r.users as Record<string, unknown>)?.full_name as string}</span>
                  <span>{format(new Date(r.created_at), 'd MMM yyyy')}</span>
                  {(r.categories as Record<string, unknown>)?.name && (
                    <span>Category: {(r.categories as Record<string, unknown>).name as string}</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 ml-4">
                <StatusBadge status={r.status} />
                {r.status === 'pending' && (
                  <div className="flex gap-2">
                    {/* TODO P3/C4: POST /api/admin/recommendations/[id]/review */}
                    {/* On approve: notify recommender, update status */}
                    {/* On 'convert' (mock): create recommendation_conversion, credit wallet via D3 */}
                    <button className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 transition-colors">
                      Approve
                    </button>
                    <button className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition-colors">
                      Mock Convert
                    </button>
                    <button className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 transition-colors">
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {(recs ?? []).length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p>No recommendations yet</p>
            <p className="text-xs mt-1">Customers can submit from the Discovery page</p>
          </div>
        )}
      </div>
    </div>
  );
}
