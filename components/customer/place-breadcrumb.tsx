import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import type { Place } from "@/backend/core/types";
import { getServerTranslation } from "@/lib/i18n/server";

/** Root-first trail from getPlaceAncestors(): [state, region, poi]. */
export async function PlaceBreadcrumb({ trail }: { trail: Place[] }) {
  const { t } = await getServerTranslation("customer");
  return <Breadcrumbs label={t("ui.place.breadcrumb")} items={[
    { label: t("navigation.home"), href: "/customer" },
    { label: t("navigation.explore"), href: "/customer/explore?tab=destinations" },
    ...trail.map((step) => ({ label: step.name, href: `/customer/place/${step.slug}` })),
  ]} />;
}
