'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Calendar } from 'lucide-react';

export default function DashboardFilter() {
  const searchParams = useSearchParams();
  const filter = searchParams.get('filter') || 'today';

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
      <button className="px-2 py-1.5 text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1 rounded-lg">
        <Calendar size={16} />
      </button>
    </div>
  );
}
