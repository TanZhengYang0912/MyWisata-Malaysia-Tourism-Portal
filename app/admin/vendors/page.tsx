'use client';
// P2 — Member 2 owns B1 vendor onboarding (approval flow)
// P1 — Member 1 owns the audit trail written on approve/reject

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface VendorData {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
  users: { full_name: string; email: string };
  outlets: { count: number }[];
}

interface ApprovedRec {
  id: string;
  vendor_name: string;
}

export default function AdminVendorsPage() {
  const supabase = createClient();
  const [vendors, setVendors] = useState<VendorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [approvedRecs, setApprovedRecs] = useState<ApprovedRec[]>([]);
  const [linkingVendor, setLinkingVendor] = useState<string | null>(null);
  const [selectedRec, setSelectedRec] = useState<Record<string, string>>({});

  const loadVendors = useCallback(async () => {
    let query = supabase
      .from('vendors')
      .select('*, users!vendors_owner_id_fkey(full_name, email), outlets(count)')
      .order('created_at', { ascending: false });

    if (filter !== 'all') {
      query = query.eq('status', filter);
    }

    const { data } = await query;
    setVendors(data as any ?? []);
    setLoading(false);
  }, [filter, supabase]);

  useEffect(() => { loadVendors(); }, [loadVendors]);

  useEffect(() => {
    supabase
      .from('vendor_recommendations')
      .select('id, vendor_name')
      .eq('status', 'approved')
      .then(({ data }) => setApprovedRecs(data as ApprovedRec[] ?? []));
  }, [supabase]);

  async function handleApprove(id: string) {
    if (!confirm('Approve this vendor?')) return;
    await fetch(`/api/admin/vendors/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });
    loadVendors();
  }

  async function handleReject(id: string) {
    const reason = prompt('Reason for rejection:');
    if (reason === null) return;
    await fetch(`/api/admin/vendors/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', reason }),
    });
    loadVendors();
  }

  async function handleSuspend(id: string) {
    const reason = prompt('Reason for suspension:');
    if (reason === null) return;
    await fetch(`/api/admin/vendors/${id}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'suspend', reason }),
    });
    loadVendors();
  }

  async function handleUnsuspend(id: string) {
    if (!confirm('Unsuspend this vendor?')) return;
    await fetch(`/api/admin/vendors/${id}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unsuspend' }),
    });
    loadVendors();
  }

  async function handleLinkRecommendation(vendorId: string) {
    const recId = selectedRec[vendorId];
    if (!recId) { alert('Select a recommendation first'); return; }
    if (!confirm('Link this recommendation to the vendor? This opens the 90-day commission window.')) return;
    setLinkingVendor(vendorId);
    try {
      const res = await fetch('/api/admin/vendors/link-recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId, recommendationId: recId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body?.error?.message ?? 'Link failed');
        return;
      }
      // Remove the newly converted recommendation from the dropdown
      setApprovedRecs((prev) => prev.filter((r) => r.id !== recId));
      setSelectedRec((prev) => { const next = { ...prev }; delete next[vendorId]; return next; });
      alert('Linked! Commission window is now open for 90 days.');
    } finally {
      setLinkingVendor(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Vendor Management</h1>

      <div className="flex gap-2">
        {['all', 'pending', 'approved', 'rejected', 'suspended'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors capitalize ${
              filter === s
                ? 'bg-gray-900 text-white border-gray-900'
                : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-600'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto bg-white rounded-xl border border-gray-200 shadow-sm">
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
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-400">Loading...</td>
              </tr>
            ) : vendors.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-400">No vendors found</td>
              </tr>
            ) : vendors.map((v) => (
              <tr key={v.id} className="hover:bg-gray-50">
                <td className="p-3">
                  <p className="font-medium text-gray-900">{v.name}</p>
                  <p className="text-xs text-gray-400">/{v.slug}</p>
                </td>
                <td className="p-3">
                  <p className="text-gray-900">{v.users?.full_name}</p>
                  <p className="text-xs text-gray-400">{v.users?.email}</p>
                </td>
                <td className="p-3 text-gray-500">{format(new Date(v.created_at), 'd MMM yyyy')}</td>
                <td className="p-3"><StatusBadge status={v.status} /></td>
                <td className="p-3">
                  {v.status === 'pending' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleApprove(v.id)} className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-200 font-medium transition-colors">
                        Approve
                      </button>
                      <button onClick={() => handleReject(v.id)} className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-200 font-medium transition-colors">
                        Reject
                      </button>
                    </div>
                  )}
                  {v.status === 'approved' && (
                    <div className="flex flex-col gap-1.5">
                      <button onClick={() => handleSuspend(v.id)} className="text-xs text-red-600 hover:underline self-start">Suspend</button>
                      {approvedRecs.length > 0 && (
                        <div className="flex items-center gap-1">
                          <select
                            value={selectedRec[v.id] ?? ''}
                            onChange={(e) => setSelectedRec((prev) => ({ ...prev, [v.id]: e.target.value }))}
                            className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white max-w-[130px]"
                          >
                            <option value="">Link rec…</option>
                            {approvedRecs.map((r) => (
                              <option key={r.id} value={r.id}>{r.vendor_name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleLinkRecommendation(v.id)}
                            disabled={linkingVendor === v.id || !selectedRec[v.id]}
                            className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded hover:bg-blue-100 disabled:opacity-40 font-medium transition-colors"
                          >
                            Link
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {v.status === 'suspended' && (
                    <button onClick={() => handleUnsuspend(v.id)} className="text-xs text-green-600 hover:underline">Unsuspend</button>
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
