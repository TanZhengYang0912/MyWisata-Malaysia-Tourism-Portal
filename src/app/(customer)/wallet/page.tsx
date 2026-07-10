// Member 3 (Trust & Money Flow) — TMF-3 Wallet Ledger + TMF-4 Withdrawal Governance

import { createClient } from '@/lib/supabase/server';
import { toRM } from '@/lib/money';
import { StatusBadge } from '@/components/ui/badge';
import { WithdrawFormButton } from '@/components/wallet/withdraw-form';

export default async function WalletPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: wallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', user!.id)
    .single();

  const { data: ledger } = await supabase
    .from('wallet_ledger')
    .select('*')
    .eq('wallet_id', wallet?.id ?? '')
    .order('created_at', { ascending: false })
    .limit(20);

  const { data: withdrawals } = await supabase
    .from('withdrawal_requests')
    .select('*, withdrawal_approvals(*)')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">My Wallet</h1>

      {/* Balance cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-primary-600 text-white rounded-xl p-5">
          <p className="text-xs text-primary-200 mb-1">Available Balance</p>
          <p className="text-2xl font-bold">{toRM(wallet?.available_balance ?? 0)}</p>
        </div>
        <div className="bg-amber-500 text-white rounded-xl p-5">
          <p className="text-xs text-amber-100 mb-1">Pending (clearing)</p>
          <p className="text-2xl font-bold">{toRM(wallet?.pending_balance ?? 0)}</p>
        </div>
      </div>

      {/* Withdraw button — opens modal, POSTs /api/wallet/withdraw with idempotency */}
      <WithdrawFormButton available={Number(wallet?.available_balance ?? 0)} />

      {/* Affiliate link */}
      {/* TODO P3/C4: show user's affiliate code + one-click copy */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-green-800 mb-1">Your Affiliate Link</p>
        <p className="text-xs text-green-600">Complete KYC to generate your affiliate link and start earning.</p>
      </div>

      {/* Ledger */}
      <section>
        <h2 className="font-semibold text-sm mb-2">Transaction History</h2>
        {(ledger ?? []).length === 0 && (
          <p className="text-center text-gray-400 py-8 text-sm">No transactions yet</p>
        )}
        <div className="space-y-2">
          {(ledger ?? []).map(entry => (
            <div key={entry.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm">{entry.entry_type.replace(/_/g, ' ')}</p>
                {entry.note && <p className="text-xs text-gray-400">{entry.note}</p>}
              </div>
              <div className="text-right">
                <p className={`font-semibold text-sm ${Number(entry.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {Number(entry.amount) >= 0 ? '+' : ''}{toRM(Number(entry.amount))}
                </p>
                <StatusBadge status={entry.balance_type} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Withdrawal history */}
      {(withdrawals ?? []).length > 0 && (
        <section>
          <h2 className="font-semibold text-sm mb-2">Withdrawal Requests</h2>
          <div className="space-y-2">
            {(withdrawals ?? []).map(w => (
              <div key={w.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{toRM(w.amount)}</p>
                  <p className="text-xs text-gray-400">{new Date(w.created_at).toLocaleDateString()}</p>
                </div>
                <StatusBadge status={w.status} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
