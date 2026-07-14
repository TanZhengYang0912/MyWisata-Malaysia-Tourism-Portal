'use client';

import { useEffect, useState } from 'react';
import { Building2, Save } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

type VendorProfile = { name: string; slug: string; description: string | null; business_type: string | null; logo_url: string | null; cover_url: string | null; status: string };

export default function VendorProfilePage() {
  const { user } = useAuth();
  const vendorId = user?.activeVendorId;
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '', businessType: '', logoUrl: '', coverUrl: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vendorId) return;
    fetch(`/api/vendors/${vendorId}`, { cache: 'no-store' }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'Unable to load vendor profile');
      const data = payload.data as VendorProfile;
      setProfile(data);
      setForm({ name: data.name, slug: data.slug, description: data.description || '', businessType: data.business_type || '', logoUrl: data.logo_url || '', coverUrl: data.cover_url || '' });
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load vendor profile')).finally(() => setLoading(false));
  }, [vendorId]);

  async function save() {
    if (!vendorId) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/vendors/${vendorId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'Unable to save vendor profile');
      setProfile(payload.data);
      setMessage('Business profile saved to Supabase.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save vendor profile');
    } finally { setSaving(false); }
  }

  if (loading) return <div className="rounded-2xl bg-white p-8 text-sm text-gray-500">Loading business profile…</div>;
  return <div className="mx-auto max-w-3xl space-y-5"><header><p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><Building2 size={15} /> Vendor identity</p><h1 className="mt-2 text-2xl font-bold tracking-tight text-gray-950">Business profile</h1><p className="mt-1 text-sm text-gray-500">Keep the business identity that customers and administrators see accurate.</p></header>{error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}{message && <div className="rounded-xl border border-primary/20 bg-secondary px-4 py-3 text-sm text-primary">{message}</div>}<section className="space-y-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-gray-950">Public business details</p><p className="mt-1 text-xs text-gray-500">Current vendor status: <span className="font-semibold capitalize">{profile?.status}</span></p></div><button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save size={16} /> {saving ? 'Saving…' : 'Save changes'}</button></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700">Business name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary" /></label><label className="text-sm font-medium text-gray-700">Slug<input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 font-mono text-sm outline-none focus:border-primary" /></label><label className="text-sm font-medium text-gray-700 sm:col-span-2">Business type<input value={form.businessType} onChange={(event) => setForm({ ...form, businessType: event.target.value })} placeholder="Food & dining, cultural experience…" className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary" /></label><label className="text-sm font-medium text-gray-700 sm:col-span-2">Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={5} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-primary" /></label><label className="text-sm font-medium text-gray-700">Logo URL<input value={form.logoUrl} onChange={(event) => setForm({ ...form, logoUrl: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary" /></label><label className="text-sm font-medium text-gray-700">Cover URL<input value={form.coverUrl} onChange={(event) => setForm({ ...form, coverUrl: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary" /></label></div></section></div>;
}
