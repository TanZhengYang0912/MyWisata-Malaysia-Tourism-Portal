"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";

type Notification = { id: string; title: string; body: string; link: string | null; category: string; readAt: string | null; createdAt: string };
type ApiBody = { data?: { items: Notification[]; total: number }; error?: { message?: string } };

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    const response = await fetch('/api/notifications?page=1&pageSize=15');
    const body = await response.json() as ApiBody;
    if (!response.ok || !body.data) return;
    setItems(body.data.items);
    setUnread(body.data.items.filter((item) => !item.readAt).length);
  }
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 30_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  async function markRead(id: string) { await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' }); setItems((current) => current.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item)); setUnread((current) => Math.max(0, current - 1)); }
  async function markAll() { await fetch('/api/notifications/read-all', { method: 'POST' }); setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() }))); setUnread(0); }
  return <div ref={ref} className="relative shrink-0">
    <button type="button" aria-label="Notifications" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="relative rounded-lg p-1.5 text-foreground hover:bg-secondary">
      <Bell size={18} />{unread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-center text-[9px] font-bold leading-4 text-white">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-white shadow-[0_18px_45px_rgba(1,0,102,0.16)]">
      <div className="flex items-center justify-between border-b border-border px-4 py-3"><p className="font-semibold">Notifications</p><button type="button" onClick={() => void markAll()} className="flex items-center gap-1 text-xs text-primary"><CheckCheck size={14} /> Mark all as read</button></div>
      <div className="max-h-96 overflow-y-auto">{items.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No notifications yet.</p> : items.map((item) => <div key={item.id} className={`border-b border-border px-4 py-3 ${item.readAt ? '' : 'bg-primary/5'}`}><button type="button" onClick={() => void markRead(item.id)} className="w-full text-left"><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.body}</p><p className="mt-1 text-[11px] text-muted-foreground">{new Date(item.createdAt).toLocaleString('en-MY')}</p></button>{item.link && <Link href={item.link} onClick={() => { if (!item.readAt) void markRead(item.id); setOpen(false); }} className="mt-1 inline-block text-xs font-semibold text-primary">Open</Link>}</div>)}</div>
      <div className="border-t border-border px-4 py-3 text-center"><Link href="/customer/notifications" onClick={() => setOpen(false)} className="text-sm font-semibold text-primary">View all notifications</Link></div>
    </div>}
  </div>;
}
