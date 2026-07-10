// P1 — Member 1 owns A4 FAQ Bot + Support/Admin Shell

import { createClient } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/ui/badge';
import { format } from 'date-fns';

export default async function AdminSupportPage() {
  const supabase = await createClient();

  const { data: tickets } = await supabase
    .from('support_tickets')
    .select('*, users(full_name, email)')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Support Tickets</h1>
      <p className="text-sm text-gray-500">
        Tickets created when the chatbot couldn't answer a customer query.
      </p>

      <div className="space-y-3">
        {(tickets ?? []).map(t => (
          <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-medium">{t.subject}</h3>
                <p className="text-sm text-gray-600 mt-1 line-clamp-2">{t.body}</p>
                <div className="flex gap-3 mt-2 text-xs text-gray-400">
                  <span>{(t.users as Record<string, unknown>)?.full_name as string ?? 'Guest'}</span>
                  <span>{format(new Date(t.created_at), 'd MMM yyyy, HH:mm')}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 ml-4">
                <StatusBadge status={t.status} />
                {/* TODO P1/A4: Update ticket status buttons */}
                {(t.status === 'open' || t.status === 'in_progress') && (
                  <div className="flex gap-2">
                    <button className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition-colors">
                      In Progress
                    </button>
                    <button className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 transition-colors">
                      Resolve
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {(tickets ?? []).length === 0 && (
          <div className="text-center py-16 text-gray-400">No support tickets</div>
        )}
      </div>
    </div>
  );
}
