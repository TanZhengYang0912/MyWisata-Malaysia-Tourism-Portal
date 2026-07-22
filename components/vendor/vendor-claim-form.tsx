'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type VendorClaimFormProps = { token: string };

export default function VendorClaimForm({ token }: VendorClaimFormProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    businessName: '',
    legalBusinessName: '',
    businessType: '',
    contactEmail: '',
    contactPhone: '',
    businessAddress: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/vendor/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...form }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (body?.error?.code === 'PHONE_VERIFICATION_REQUIRED') {
          setError('Verify your phone number first, then return to claim this vendor.');
        } else {
          setError(body?.error?.message ?? 'Unable to submit vendor onboarding.');
        }
        return;
      }
      setSubmitted(true);
      router.refresh();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-primary/20 bg-primary/[0.05] p-6">
        <h2 className="text-lg font-bold text-foreground">Vendor application submitted</h2>
        <p className="mt-2 text-sm text-muted-foreground">Your business setup is saved as a private Draft and is pending Admin review.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Recommendation invitation</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Set up your vendor profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">Complete the business draft. It stays private until Admin approves your Vendor application.</p>
      </div>

      <label className="block text-sm font-semibold text-foreground">Business name *<input required value={form.businessName} onChange={(e) => update('businessName', e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-normal" /></label>
      <label className="block text-sm font-semibold text-foreground">Legal business name *<input required value={form.legalBusinessName} onChange={(e) => update('legalBusinessName', e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-normal" /></label>
      <label className="block text-sm font-semibold text-foreground">Business type *<input required value={form.businessType} onChange={(e) => update('businessType', e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-normal" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-foreground">Contact email *<input required type="email" value={form.contactEmail} onChange={(e) => update('contactEmail', e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-normal" /></label>
        <label className="block text-sm font-semibold text-foreground">Contact phone *<input required value={form.contactPhone} onChange={(e) => update('contactPhone', e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-normal" /></label>
      </div>
      <label className="block text-sm font-semibold text-foreground">Business address *<textarea required value={form.businessAddress} onChange={(e) => update('businessAddress', e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-normal" /></label>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? 'Saving Draft…' : 'Submit vendor application'}
      </button>
    </form>
  );
}
