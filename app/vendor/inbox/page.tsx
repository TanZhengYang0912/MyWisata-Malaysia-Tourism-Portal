'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, Send, UserRound } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';

interface Thread { id: string; status: string; last_message_at: string | null; customer?: { full_name?: string; email?: string }; outlets?: { id?: string; name?: string; city?: string; state?: string }; chat_messages?: Message[] }
interface Message { id: string; sender_id: string; body: string; created_at: string }

export default function VendorInboxPage() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);

  const loadThreads = useCallback(async () => {
    if (!user?.activeVendorId) return;
    const response = await fetch(`/api/vendors/${user.activeVendorId}/inbox`, { cache: 'no-store' });
    const payload = await response.json();
    setThreads(payload.data || []);
    setLoading(false);
  }, [user?.activeVendorId]);

  useEffect(() => { loadThreads(); const timer = setInterval(loadThreads, 30000); return () => clearInterval(timer); }, [loadThreads]);

  const selected = useMemo(() => threads.find((thread) => thread.id === active) || null, [active, threads]);

  async function sendMessage() {
    if (!draft.trim() || !active || !user?.activeVendorId) return;
    await fetch(`/api/vendors/${user.activeVendorId}/inbox`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ threadId: active, body: draft }) });
    setDraft('');
    loadThreads();
  }

  return (
    <div className="space-y-4">
      <div><div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700"><MessageCircle size={15} /> Traveller conversations</div><h1 className="text-2xl font-bold text-gray-950">Inbox</h1><p className="mt-1 text-sm text-gray-500">Reply to customer questions from your Malaysia outlets.</p></div>
      <div className="flex h-[calc(100vh-15rem)] min-h-[480px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="w-80 shrink-0 border-r border-gray-200"><div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">Messages <span className="ml-1 text-xs font-normal text-gray-400">{threads.length}</span></div><div className="overflow-y-auto">
          {loading ? <p className="px-4 py-10 text-center text-xs text-gray-400">Loading conversations…</p> : threads.length === 0 ? <p className="px-4 py-10 text-center text-xs text-gray-400">No conversations yet.</p> : threads.map((thread) => <button key={thread.id} type="button" onClick={() => setActive(thread.id)} className={`w-full border-b border-gray-100 px-4 py-4 text-left transition hover:bg-emerald-50 ${active === thread.id ? 'bg-emerald-50' : ''}`}><div className="flex items-start gap-3"><span className="rounded-full bg-emerald-100 p-2 text-emerald-700"><UserRound size={16} /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-gray-900">{thread.customer?.full_name || 'Traveller'}</span><span className="mt-1 block truncate text-xs text-gray-500">{thread.outlets?.name || 'Malaysia outlet'}</span><span className="mt-1 block text-[11px] text-gray-400">{thread.last_message_at ? format(new Date(thread.last_message_at), 'd MMM, HH:mm') : 'New conversation'}</span></span></div></button>)}</div></div>
        <div className="flex min-w-0 flex-1 flex-col">{!selected ? <div className="flex flex-1 flex-col items-center justify-center text-gray-400"><MessageCircle size={34} className="mb-3 opacity-30" /><p className="text-sm">Select a conversation</p></div> : <><div className="border-b border-gray-100 px-5 py-4"><p className="font-semibold text-gray-900">{selected.customer?.full_name || 'Traveller'}</p><p className="mt-1 text-xs text-gray-500">{selected.customer?.email} · {selected.outlets?.name}</p></div><div className="flex-1 space-y-3 overflow-y-auto bg-gray-50/50 p-5">{(selected.chat_messages || []).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((message) => <div key={message.id} className={`flex ${message.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${message.sender_id === user?.id ? 'rounded-br-md bg-emerald-700 text-white' : 'rounded-bl-md bg-white text-gray-700 shadow-sm'}`}><p>{message.body}</p><p className={`mt-1 text-[10px] ${message.sender_id === user?.id ? 'text-emerald-100' : 'text-gray-400'}`}>{format(new Date(message.created_at), 'd MMM, HH:mm')}</p></div></div>)}</div><div className="flex gap-2 border-t border-gray-100 p-4"><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') sendMessage(); }} placeholder="Write a reply…" className="min-w-0 flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /><button type="button" onClick={sendMessage} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"><Send size={15} /> Send</button></div></>}</div>
      </div>
    </div>
  );
}
