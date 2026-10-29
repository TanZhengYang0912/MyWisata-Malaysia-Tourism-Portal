"use client";
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
export default function GuestOrderAccessPage() {
  const router = useRouter();
  const {t} = useTranslation("customer");
  const [failed,setFailed] = useState(false);
  const [orderId,setOrderId] = useState('');
  const [email,setEmail] = useState('');
  const [message,setMessage] = useState('');
  const [sending,setSending] = useState(false);
  const accessAttemptRef = useRef<Promise<string> | null>(null);
  useEffect(() => {
    let active = true;
    let attempt = accessAttemptRef.current;
    if (!attempt) {
      const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
      window.history.replaceState(null,'',window.location.pathname);
      // A missing one-time URL token immediately switches to the recovery form.
      if (!token) {
        queueMicrotask(() => { if (active) setFailed(true); });
        return () => { active = false; };
      }
      attempt = fetch('/api/guest/orders/access',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}) })
        .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
        .then(body => String(body.data.orderId));
      accessAttemptRef.current = attempt;
    }
    void attempt.then(orderId => { if (active) router.replace(`/customer/orders/${orderId}`); }).catch(()=>{ if (active) setFailed(true); });
    return () => { active = false; };
  },[router]);
  async function recover(event:React.FormEvent) {
    event.preventDefault();setSending(true);
    try {
      const response=await fetch('/api/guest/orders/recover',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...(orderId.trim() ? { orderReference: orderId.trim() } : {}),email})});
      setMessage(response.ok ? t("guestCheckout.requested") : t("guestCheckout.requestFailed"));
    } catch {setMessage(t("guestCheckout.requestFailed"));}
    finally {setSending(false);}
  }
  return <div className="mx-auto max-w-lg px-4 py-16 text-foreground">
    {!failed ? <p>{t("guestCheckout.opening")}</p> : <form onSubmit={recover} className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <h1 className="text-xl font-semibold">{t("guestCheckout.accessTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("guestCheckout.recoveryHint")}</p>
      <label className="block text-sm">{t("guestCheckout.orderNumber")}<Input value={orderId} onChange={event=>setOrderId(event.target.value)} /></label>
      <label className="block text-sm">{t("guestCheckout.email")}<Input required type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} /></label>
      <Button type="submit" disabled={sending}>{t("guestCheckout.emailLink")}</Button>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </form>}
  </div>;
}
