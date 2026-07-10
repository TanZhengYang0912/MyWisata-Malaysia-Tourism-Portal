'use client';
// P1 — Member 1 owns this page
// Sub-module: A1 App shell + Auth/RBAC

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const DEMO_ACCOUNTS = [
  { label: 'Super Admin',     email: 'admin@demo.local',          password: 'demo123456' },
  { label: 'Wallet Approver', email: 'approver@demo.local',       password: 'demo123456' },
  { label: 'Vendor Owner',    email: 'vendor.owner@demo.local',   password: 'demo123456' },
  { label: 'Outlet Manager',  email: 'outlet.manager@demo.local', password: 'demo123456' },
  { label: 'Customer Alice',  email: 'customer1@demo.local',      password: 'demo123456' },
];

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setError(error?.message ?? 'Login failed');
      setLoading(false);
      return;
    }

    // Role-based landing page
    const { data: roleRows } = await supabase
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', data.user.id);

    const roles = (roleRows ?? [])
      .map((r) => (r.roles as { name: string } | null)?.name)
      .filter(Boolean) as string[];

    let landing = '/discovery';
    if (roles.includes('super_admin') || roles.includes('approver')) {
      landing = '/admin/dashboard';
    } else if (roles.includes('vendor_owner') || roles.includes('outlet_manager')) {
      landing = '/vendor/dashboard';
    }

    router.push(landing);
    router.refresh();
  }

  function fillDemo(acc: typeof DEMO_ACCOUNTS[0]) {
    setEmail(acc.email);
    setPassword(acc.password);
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8">
      <h2 className="text-xl font-semibold text-gray-800 mb-6">Sign in</h2>

      {/* Demo account switcher */}
      <div className="mb-6 p-3 bg-amber-50 rounded-lg border border-amber-200">
        <p className="text-xs font-semibold text-amber-700 mb-2">Quick login (Demo)</p>
        <div className="flex flex-wrap gap-2">
          {DEMO_ACCOUNTS.map(acc => (
            <button
              key={acc.email}
              onClick={() => fillDemo(acc)}
              className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 px-2 py-1 rounded transition-colors"
            >
              {acc.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email" required value={email} onChange={e => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="you@email.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password" required value={password} onChange={e => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="••••••••"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit" disabled={loading}
          className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-4">
        No account?{' '}
        <Link href="/register" className="text-primary-600 hover:underline">Register</Link>
      </p>
    </div>
  );
}
