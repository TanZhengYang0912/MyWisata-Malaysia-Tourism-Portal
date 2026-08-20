"use client";

import { useTranslation } from "react-i18next";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { guestLoginHref } from "@/lib/auth/guest-mode";

export function GuestAccountEmptyState({
  title,
  description,
  nextPath,
  value,
}: {
  title: string;
  description: string;
  nextPath: string;
  value?: string;
}) {
  const { t } = useTranslation("customer");
  const signInHref = guestLoginHref(nextPath);
  const createHref = `${signInHref}&mode=signup`;

  return (
    <section className="rounded-3xl border border-border bg-card shadow-sm">
      {value && (
        <p className="border-b border-border px-6 py-5 text-center font-[family-name:var(--font-mono)] text-2xl font-bold text-primary">
          {value}
        </p>
      )}
      <EmptyState
        icon={<UserRound size={32} aria-hidden="true" />}
        title={title}
        description={description}
        action={(
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild><Link href={signInHref}>{t("ui.guest.signIn")}</Link></Button>
            <Button asChild variant="outline"><Link href={createHref}>{t("ui.guest.createAccount")}</Link></Button>
          </div>
        )}
      />
    </section>
  );
}
