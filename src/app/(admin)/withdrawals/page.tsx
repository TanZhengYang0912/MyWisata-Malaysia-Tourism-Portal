// P4 — Member 4 owns D4 Withdrawal Approval
// P1 — Member 1 owns audit trail (auditAndNotify is called on every action)

import { createClient } from '@/lib/supabase/server';
import { toRM } from '@/lib/money';
import { StatusBadge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { HIGH_VALUE_WITHDRAWAL_RM } from '@/lib/constants';

export default async function AdminWithdrawalsPage() {
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from('withdrawal_requests')
    .select(`
      *,
      users ( full_name, email, kyc_status ),
      wallets ( available_balance ),
      withdrawal_approvals ( action, approver_id, note, actioned_at )
    `)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Withdrawal Requests</h1>
      <p className="text-sm text-gray-500">
        Requests above {toRM(HIGH_VALUE_WITHDRAWAL_RM)} require dual approval. All actions are audit-logged.
      </p>

      <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr className="text-gray-500 text-left">
              <th className="p-3">User</th>
              <th className="p-3">Amount</th>
              <th className="p-3">KYC</th>
              <th className="p-3">Dual Approval</th>
              <th className="p-3">Submitted</th>
              <th className="p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(requests ?? []).map(r => {
              const approvals = (r.withdrawal_approvals as Record<string, unknown>[]) ?? [];
              const approveCount = approvals.filter(a => a.action === 'approve').length;
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="p-3">
                    <p className="font-medium">{(r.users as Record<string, unknown>)?.full_name as string}</p>
                    <p className="text-xs text-gray-400">{(r.users as Record<string, unknown>)?.email as string}</p>
                  </td>
                  <td className="p-3 font-semibold">{toRM(r.amount)}</td>
                  <td className="p-3">
                    <StatusBadge status={(r.users as Record<string, unknown>)?.kyc_status as string ?? 'unverified'} />
                  </td>
                  <td className="p-3">
                    {r.requires_dual_approval ? (
                      <span className="text-xs text-amber-600">{approveCount}/2 approvals</span>
                    ) : (
                      <span className="text-xs text-gray-400">Single</span>
                    )}
                  </td>
                  <td className="p-3 text-gray-500">{format(new Date(r.created_at), 'd MMM yyyy')}</td>
                  <td className="p-3"><StatusBadge status={r.status} /></td>
                  <td className="p-3">
                    {r.status === 'pending' && (
                      <div className="flex gap-2">
                        {/* TODO P4/D4: POST /api/admin/withdrawals/[id]/approve */}
                        {/* Must: update request status + wallet_ledger + audit_log + notification */}
                        <button className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 transition-colors">
                          Approve
                        </button>
                        <button className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 transition-colors">
                          Reject
                        </button>
                        <button className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded hover:bg-yellow-200 transition-colors">
                          Hold
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {(requests ?? []).length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">No withdrawal requests</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
