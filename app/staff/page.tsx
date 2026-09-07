"use client";

import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, LogOut, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useRequireRole } from "@/components/providers/auth";
import { staffDestinations } from "@/lib/staff-permissions/navigation";
import { createClient } from "@/lib/supabase/client";

export default function StaffHomePage() {
  const { t } = useTranslation("auth");
  const { currentUser, staffRoleNames, staffPermissionKeys, loading } = useRequireRole(["staff"]);
  const destinations = staffDestinations(staffPermissionKeys);

  async function signOut() {
    await createClient().auth.signOut();
    window.location.assign("/login");
  }

  if (loading || !currentUser) return <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">{t("staffHome.loading")}</main>;

  return <main className="min-h-screen bg-background px-5 py-10 sm:px-8">
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary"><ShieldCheck size={16} />{t("staffHome.eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-black text-foreground">{t("staffHome.title", { name: currentUser.name })}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{staffRoleNames.length ? staffRoleNames.join(" · ") : t("staffHome.noRole")}</p>
        </div>
        <Button type="button" variant="outline" onClick={signOut} className="gap-2"><LogOut size={16} />{t("staffHome.signOut")}</Button>
      </header>

      <section className="mt-7">
        <h2 className="text-lg font-bold text-foreground">{t("staffHome.assignedWork")}</h2>
        {destinations.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-8 text-center"><BriefcaseBusiness className="mx-auto text-muted-foreground" /><p className="mt-3 font-semibold text-foreground">{t("staffHome.empty")}</p><p className="mt-1 text-sm text-muted-foreground">{t("staffHome.emptyDescription")}</p></div>
          : <div className="mt-4 grid gap-4 sm:grid-cols-2">{destinations.map((destination) => <Link key={destination.permission} href={destination.href} className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-primary/40 hover:shadow-md"><div className="flex items-start justify-between gap-4"><div><h3 className="font-bold text-foreground">{t(destination.labelKey)}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{t(destination.descriptionKey)}</p></div><ArrowRight className="shrink-0 text-primary transition-transform group-hover:translate-x-1" size={18} /></div></Link>)}</div>}
      </section>
    </div>
  </main>;
}
