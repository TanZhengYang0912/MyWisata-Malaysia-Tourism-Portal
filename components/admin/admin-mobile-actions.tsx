"use client";

import Link from "next/link";
import { LifeBuoy, LogOut, MoreHorizontal, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AppearanceControl } from "@/components/shared/appearance-control";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AdminMobileActions({
  displayName,
  manageDevicesHref,
  onSignOut,
}: {
  displayName: string;
  manageDevicesHref: string;
  onSignOut: () => void;
}) {
  const { t: tAdmin } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={tAdmin("shell.mobileActions.open")}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreHorizontal size={20} aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-sm overflow-y-auto rounded-2xl p-5 text-left sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="break-words">{tAdmin("shell.mobileActions.title")}</DialogTitle>
        </DialogHeader>
        <div className="min-w-0 space-y-3">
          <div className="min-w-0 rounded-xl border border-border bg-card p-3">
            <p className="text-xs font-medium text-muted-foreground">{tAdmin("shell.mobileActions.account")}</p>
            <p className="mt-1 break-words text-sm font-semibold text-foreground">{displayName}</p>
          </div>

          <div className="space-y-2">
            <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2">
              <span className="text-sm font-medium text-foreground">{tCommon("language.label")}</span>
              <LanguageSwitcher compact className="max-w-36" />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2">
              <span className="text-sm font-medium text-foreground">{tCommon("appearance.settings")}</span>
              <AppearanceControl />
            </div>
          </div>

          <nav aria-label={tAdmin("shell.mobileActions.title")} className="space-y-1 rounded-xl border border-border bg-card p-1">
            <DialogClose asChild>
              <Link
                href="/admin/help"
                className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LifeBuoy size={18} aria-hidden="true" />
                {tAdmin("staffHelp.headerLink")}
              </Link>
            </DialogClose>
            {manageDevicesHref && (
              <DialogClose asChild>
                <Link
                  href={manageDevicesHref}
                  className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ShieldCheck size={18} aria-hidden="true" />
                  {tAdmin("shell.mobileActions.security")}
                </Link>
              </DialogClose>
            )}
          </nav>

          <DialogClose asChild>
            <button
              type="button"
              onClick={onSignOut}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-border bg-card px-3 text-left text-sm font-semibold text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut size={18} aria-hidden="true" />
              {tCommon("actions.signOut")}
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
