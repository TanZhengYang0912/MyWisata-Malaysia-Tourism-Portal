'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar } from 'lucide-react';
import { useState } from 'react';

export default function DashboardFilter() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const filter = searchParams.get('filter') || '30d';
  const [from, setFrom] = useState(searchParams.get('from') || '');
  const [to, setTo] = useState(searchParams.get('to') || '');

  const options = [
    { value: 'today', label: 'Today' },
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: '12m', label: '12 Months' },
  ];

  return (
    <div className="flex bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
      {options.map(opt => (
        <Link 
          key={opt.value}
          href={`?filter=${opt.value}`}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            filter === opt.value 
              ? 'bg-gray-100 font-semibold text-gray-900' 
              : 'font-medium text-gray-500 hover:text-gray-700'
          }`}
        >
          {opt.label}
        </Link>
      ))}
      <div className="w-[1px] bg-gray-200 my-1 mx-1"></div>
      <details className="relative">
        <summary className={`flex cursor-pointer list-none items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors ${filter === 'custom' ? 'bg-gray-100 font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}><Calendar size={16} /> Custom</summary>
        <form className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-xl" onSubmit={(event) => { event.preventDefault(); if (!from) return; const params = new URLSearchParams({ filter: 'custom', from, ...(to ? { to } : {}) }); router.push(`?${params.toString()}`); }}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Date range</p>
          <label className="mb-2 block text-xs text-gray-600">From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-gray-200 px-2 text-sm" required /></label>
          <label className="block text-xs text-gray-600">To<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-gray-200 px-2 text-sm" /></label>
          <button type="submit" className="mt-3 w-full rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white">Apply range</button>
        </form>
      </details>
    </div>
  );
}
