"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  const { t } = useTranslation("common");
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
      <h3 className="font-bold text-foreground mb-1">{t(title, { defaultValue: title })}</h3>
      {description && <p className="text-sm text-muted-foreground max-w-sm mb-4">{t(description, { defaultValue: description })}</p>}
      {action}
    </div>
  );
}
