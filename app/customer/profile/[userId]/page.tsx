import { notFound } from "next/navigation";
import { getServerTranslation } from "@/lib/i18n/server";
import { MapPin, UserCircle } from "lucide-react";
import { getPublicUsers } from "@/backend/domains/identity";
import { VerifiedContributorBadge } from "@/components/shared/verified-contributor-badge";

export default async function PublicCustomerProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { t } = await getServerTranslation("customer");
  const { userId } = await params;
  const [profile] = await getPublicUsers([userId]);
  if (!profile) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary text-primary"><UserCircle size={38} /></div>}
          <div className="min-w-0 pt-1"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold text-foreground">{profile.name}</h1><VerifiedContributorBadge verified={profile.isKycVerified} /></div><p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground"><MapPin size={14} /> {[profile.city, profile.country].filter(Boolean).join(", ") || t("ui.labels.malaysia")}</p></div>
        </div>
        <p className="mt-6 text-sm text-foreground">{profile.bio || t("ui.profile.publicBioEmpty")}</p>
        <p className="mt-4 text-xs text-muted-foreground">{t("ui.profile.contributorProfile")}</p>
      </section>
    </main>
  );
}
