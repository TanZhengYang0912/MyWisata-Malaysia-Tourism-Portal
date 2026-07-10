'use client';
// P1 — Member 1 owns chat (A3)
// Vendor uses this to reply to customer threads

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { format } from 'date-fns';

export default function VendorInboxPage() {
  const supabase = createClient();
  const [threads, setThreads] = useState<Record<string, unknown>[]>([]);
  const [active,  setActive]  = useState<string | null>(null);
  const [messages,setMessages]= useState<Record<string, unknown>[]>([]);
  const [draft,   setDraft]   = useState('');

  useEffect(() => {
    // TODO P1/A3: Fetch chat threads for vendor's outlets
    // supabase.from('chat_threads').select('*, customer:users(full_name), chat_messages(*)')
    //   .in('outlet_id', vendorOutletIds)
    //   .order('last_message_at', { ascending: false })
  }, []);

  useEffect(() => {
    if (!active) return;
    // TODO P1/A3: Fetch + subscribe to messages for active thread
    // Supabase Realtime or 3-5s polling fallback
  }, [active]);

  async function sendMessage() {
    if (!draft.trim() || !active) return;
    // TODO P1/A3: supabase.from('chat_messages').insert({ thread_id: active, body: draft })
    setDraft('');
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex rounded-xl border border-gray-200 overflow-hidden bg-white">
      {/* Thread list */}
      <div className="w-72 border-r border-gray-200 flex flex-col">
        <div className="px-4 py-3 border-b font-semibold text-sm">Messages</div>
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">
              No messages yet<br/>
              <span className="text-[10px]">Implement in A3</span>
            </p>
          )}
          {threads.map(t => (
            <button
              key={String(t.id)}
              onClick={() => setActive(String(t.id))}
              className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors
                ${active === String(t.id) ? 'bg-primary-50' : ''}`}
            >
              <p className="text-sm font-medium">{String((t.customer as Record<string, unknown>)?.full_name ?? 'Customer')}</p>
              <p className="text-xs text-gray-400 truncate">{String(t.last_message_at ? format(new Date(String(t.last_message_at)), 'd MMM HH:mm') : '')}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Message pane */}
      <div className="flex-1 flex flex-col">
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.map(m => (
                <div key={String(m.id)} className="text-sm bg-gray-100 rounded-lg px-3 py-2 max-w-xs">
                  {String(m.body)}
                </div>
              ))}
            </div>
            <div className="border-t p-3 flex gap-2">
              <input
                value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message…"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={sendMessage}
                className="bg-primary-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-primary-700 transition-colors"
              >
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
