import type { Metadata } from "next";
import { getServerTranslation } from "@/lib/i18n/server";
import VoucherHubClient from "./voucher-hub-client";
import { BRAND_NAME } from "@/lib/i18n/invariant-tokens";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslation("customer");
  return {
    title: `${t("ui.cart.availableVouchers")} — ${BRAND_NAME}`,
    description: t("ui.cart.searchVouchers"),
  };
}

export default function CustomerVouchersPage() {
  return <VoucherHubClient />;
}
