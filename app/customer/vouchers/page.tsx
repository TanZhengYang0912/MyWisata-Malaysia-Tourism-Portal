import type { Metadata } from "next";
import { getServerTranslation } from "@/lib/i18n/server";
import VoucherHubClient from "./voucher-hub-client";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslation("customer");
  return {
    title: `${t("ui.cart.availableVouchers")} — MyWisata`,
    description: t("ui.cart.searchVouchers"),
  };
}

export default function CustomerVouchersPage() {
  return <VoucherHubClient />;
}
