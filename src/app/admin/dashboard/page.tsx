// P1 — Member 1 owns admin shell
// All module owners add their own approval sections here

import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export default async function AdminDashboard() {
  const supabase = await createClient();

  const [{ count: pendingVendors }, { count: pendingKyc }, { count: pendingWithdrawals }, { count: openTickets }] =
    await Promise.all([
      supabase.from('vendors').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('kyc_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('withdrawal_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    ]);

  const stats = [
    { label: 'Pending Vendors',     count: pendingVendors ?? 0,     href: '/admin/vendors',         colour: 'text-yellow-600' },
    { label: 'KYC Reviews',         count: pendingKyc ?? 0,         href: '/admin/kyc',             colour: 'text-blue-600' },
    { label: 'Withdrawal Requests', count: pendingWithdrawals ?? 0, href: '/admin/withdrawals',     colour: 'text-purple-600' },
    { label: 'Open Support Tickets',count: openTickets ?? 0,        href: '/admin/support',         colour: 'text-red-600' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Admin Dashboard</h1>

      {/* Pending action counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <a key={s.href} href={s.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader><CardTitle>{s.label}</CardTitle></CardHeader>
              <p className={`text-3xl font-bold ${s.colour}`}>{s.count}</p>
            </Card>
          </a>
        ))}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Vendor Approval Queue</CardTitle></CardHeader>
          <p className="text-sm text-gray-500">
            Review new vendor registrations and recommended vendors.
          </p>
          <a href="/admin/vendors" className="mt-3 inline-block text-sm text-primary-600 hover:underline">
            Go to Vendor Approval →
          </a>
        </Card>
        <Card>
          <CardHeader><CardTitle>Withdrawal Approvals</CardTitle></CardHeader>
          <p className="text-sm text-gray-500">
            Review and approve/reject customer withdrawal requests. Requests above RM500 require dual approval.
          </p>
          <a href="/admin/withdrawals" className="mt-3 inline-block text-sm text-primary-600 hover:underline">
            Go to Withdrawals →
          </a>
        </Card>
      </div>
    </div>
  );
}
