// P1 — Member 1 owns A2 Mock Verification + KYC review

import { createClient } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/ui/badge';
import { format } from 'date-fns';

export default async function AdminKycPage() {
  const supabase = await createClient();

  const { data: submissions } = await supabase
    .from('kyc_submissions')
    .select('*, users(full_name, email)')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">KYC Reviews</h1>
      <p className="text-sm text-gray-500">
        Review submitted identity documents. Approval unlocks wallet withdrawals and affiliate earning.
      </p>

      <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr className="text-gray-500 text-left">
              <th className="p-3">User</th>
              <th className="p-3">Document Type</th>
              <th className="p-3">Submitted</th>
              <th className="p-3">Document</th>
              <th className="p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(submissions ?? []).map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="p-3">
                  <p className="font-medium">{(s.users as Record<string, unknown>)?.full_name as string}</p>
                  <p className="text-xs text-gray-400">{(s.users as Record<string, unknown>)?.email as string}</p>
                </td>
                <td className="p-3 capitalize">{s.document_type.replace(/_/g, ' ')}</td>
                <td className="p-3 text-gray-500">{format(new Date(s.created_at), 'd MMM yyyy')}</td>
                <td className="p-3">
                  {s.document_url ? (
                    <a href={s.document_url} target="_blank" rel="noopener noreferrer"
                       className="text-primary-600 hover:underline text-xs">
                      View Document
                    </a>
                  ) : (
                    <span className="text-gray-400 text-xs">Mock placeholder</span>
                  )}
                </td>
                <td className="p-3"><StatusBadge status={s.status} /></td>
                <td className="p-3">
                  {s.status === 'pending' && (
                    <div className="flex gap-2">
                      {/* TODO P1/A2: POST /api/admin/kyc/[id]/review { action: 'approve'|'reject' } */}
                      {/* Must write audit_log + notification + update users.kyc_status */}
                      <button className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 transition-colors">
                        Approve
                      </button>
                      <button className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 transition-colors">
                        Reject
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {(submissions ?? []).length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">No KYC submissions</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
