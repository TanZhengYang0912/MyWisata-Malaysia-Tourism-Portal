"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Building2, CheckCircle2, Globe, LockKeyhole, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

type Invitation = {
  email: string;
  status: string;
  expiresAt: string;
  vendorName: string;
  outletName: string;
  city: string | null;
  state: string | null;
};

export default function OutletManagerInvitationPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { t } = useTranslation("auth");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [sessionEmail, setSessionEmail] = useState("");
  const [mode, setMode] = useState<"sign_in" | "register">("sign_in");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/outlet-manager-invitations/${encodeURIComponent(params.token)}`).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || t("outletInvitation.notFound"));
        return body.data as Invitation;
      }),
      supabase.auth.getUser(),
    ]).then(([data, auth]) => {
      if (cancelled) return;
      setInvitation(data);
      setSessionEmail(auth.data.user?.email?.toLowerCase() ?? "");
      setLoading(false);
    }).catch((reason) => {
      if (cancelled) return;
      setError(reason instanceof Error ? reason.message : t("outletInvitation.notFound"));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [params.token, supabase, t]);

  async function accept() {
    setBusy(true); setError(""); setMessage("");
    const response = await fetch(`/api/outlet-manager-invitations/${encodeURIComponent(params.token)}`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(body.error?.message || t("outletInvitation.acceptError")); return; }
    setMessage(t("outletInvitation.accepted"));
    router.push("/vendor/dashboard");
    router.refresh();
  }

  async function authenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invitation) return;
    setBusy(true); setError(""); setMessage("");
    const result = mode === "sign_in"
      ? await supabase.auth.signInWithPassword({ email: invitation.email, password })
      : await supabase.auth.signUp({ email: invitation.email, password, options: { data: { full_name: fullName.trim() } } });
    if (result.error) {
      setBusy(false);
      setError(result.error.message);
      return;
    }
    if (!result.data.session) {
      setBusy(false);
      setMessage(t("outletInvitation.accountCreated"));
      return;
    }
    setSessionEmail(invitation.email.toLowerCase());
    await accept();
  }

  const isExpired = invitation?.status !== "pending";
  const isMatchingSession = !sessionEmail || sessionEmail === invitation?.email.toLowerCase();

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#f7f8fc] text-sm text-slate-500">{t("outletInvitation.loading")}</main>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fc] px-4 py-10">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_60px_rgba(1,0,102,0.12)]">
        <div className="bg-[#010066] px-6 py-8 text-white sm:px-9">
          <div className="flex items-center gap-2 text-sm font-bold"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15"><Globe size={16} /></span> MyWisata</div>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-[#FFCC00]">{t("outletInvitation.eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-black">{t("outletInvitation.title")}</h1>
          <p className="mt-3 text-sm leading-6 text-white/75">{t("outletInvitation.description")}</p>
        </div>

        <div className="space-y-5 p-6 sm:p-9">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}

          {invitation && (
            <div className="rounded-2xl border border-primary/10 bg-secondary/50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{t("outletInvitation.invitedTo")}</p>
              <div className="mt-3 flex items-start gap-3"><Building2 className="mt-0.5 shrink-0 text-primary" size={20} /><div><p className="font-bold text-slate-900">{invitation.outletName}</p><p className="mt-1 text-sm text-slate-600">{invitation.vendorName} · {[invitation.city, invitation.state].filter(Boolean).join(", ") || t("outletInvitation.malaysia")}</p></div></div>
              <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Mail size={14} /> {t("outletInvitation.emailLabel")} <strong className="text-slate-700">{invitation.email}</strong></p>
            </div>
          )}

          {isExpired ? (
            <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">{t("outletInvitation.inactive")}</div>
          ) : sessionEmail && isMatchingSession ? (
            <div>
              <p className="text-sm text-slate-600">{t("outletInvitation.signedInAs")} <strong className="text-slate-900">{sessionEmail}</strong>.</p>
              <Button type="button" onClick={accept} disabled={busy} className="mt-4 w-full gap-2"><CheckCircle2 size={16} /> {busy ? t("outletInvitation.accepting") : t("outletInvitation.accept")}</Button>
            </div>
          ) : (
            <form onSubmit={authenticate} className="space-y-3">
              <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-semibold"><button type="button" onClick={() => setMode("sign_in")} className={`flex-1 rounded-lg px-3 py-2 ${mode === "sign_in" ? "bg-white text-primary shadow-sm" : "text-slate-500"}`}>{t("outletInvitation.haveAccount")}</button><button type="button" onClick={() => setMode("register")} className={`flex-1 rounded-lg px-3 py-2 ${mode === "register" ? "bg-white text-primary shadow-sm" : "text-slate-500"}`}>{t("outletInvitation.createAccount")}</button></div>
              {mode === "register" && <input required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder={t("fields.fullName")} aria-label={t("fields.fullName")} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-primary" />}
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3"><Mail size={15} className="text-slate-400" /><input readOnly value={invitation?.email || ""} aria-label={t("outletInvitation.emailLabel")} className="h-11 min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none" /></div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3"><LockKeyhole size={15} className="text-slate-400" /><input required type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("outletInvitation.passwordHint")} aria-label={t("fields.password")} className="h-11 min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none" /></div>
              <Button type="submit" disabled={busy} className="w-full">{busy ? t("outletInvitation.waiting") : mode === "sign_in" ? t("outletInvitation.signInAndAccept") : t("outletInvitation.createAndAccept")}</Button>
            </form>
          )}

          <p className="text-center text-xs leading-5 text-slate-400">{t("outletInvitation.footer")}</p>
        </div>
      </div>
    </main>
  );
}
