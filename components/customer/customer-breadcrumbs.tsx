"use client";

import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { getCustomerBreadcrumbModel } from "@/lib/customer/breadcrumbs";

export function CustomerBreadcrumbs() {
  const pathname = usePathname();
  const { t } = useTranslation("customer");
  const model = getCustomerBreadcrumbModel(pathname);
  if (model.mode !== "automatic") return null;
  return <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
    <Breadcrumbs label={t("ui.place.breadcrumb")} items={model.items.map((item) => ({ ...item, label: t(item.labelKey) }))} />
  </div>;
}
