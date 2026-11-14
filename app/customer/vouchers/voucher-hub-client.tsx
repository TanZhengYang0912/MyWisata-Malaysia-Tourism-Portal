"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMYRNumber } from "@/lib/i18n/format";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Gift, MessageCircle, QrCode, SlidersHorizontal, Sparkles } from "lucide-react";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { useSupportChat } from "@/components/providers/support-chat";
import { Button } from "@/components/ui/button";
import { CustomerPageHeader, CustomerPageShell } from "@/components/customer/customer-page-shell";
import { DiscoverySearchField } from "@/components/customer/discovery-filters";
import { VoucherTicket } from "@/components/vouchers/voucher-ticket";
import { VoucherRedeemDialog } from "@/components/customer/voucher-redeem-dialog";
import { Pagination } from "@/components/shared/pagination";
import { buildVoucherUseHref, isClaimUsable, type CustomerVoucher, type CustomerVoucherTab } from "@/lib/customer/voucher-claims";
import { outletShortName } from "@/lib/outlet-display";

const VOUCHER_PAGE_SIZE = 8;

type VoucherFilter = "all" | CustomerVoucher["voucherType"];

const FILTERS: Array<{ value: VoucherFilter; labelKey: string }> = [
  { value: "all", labelKey: "ui.voucherHub.filters.all" },
  { value: "percent", labelKey: "ui.voucherHub.filters.percent" },
  { value: "fixed", labelKey: "ui.voucherHub.filters.fixed" },
  { value: "bogo", labelKey: "ui.voucherHub.filters.bogo" },
];

function VoucherCard({
  voucher,
  onClaim,
  claiming,
  onShowInStore,
}: {
  voucher: CustomerVoucher;
  onClaim: (voucher: CustomerVoucher) => void;
  claiming: boolean;
  onShowInStore: (voucher: CustomerVoucher) => void;
}) {
  const { t: tCustomer, i18n } = useTranslation("customer");
  const [expandedProducts, setExpandedProducts] = useState(false);
  const actionKey = !voucher.claim ? "claim" : voucher.claim.status === "redeemed" ? "redeemed" : !isClaimUsable(voucher.claim) ? "expired" : "claimed";
  const canUse = Boolean(voucher.claim && isClaimUsable(voucher.claim) && ["online", "both"].includes(voucher.redemptionMode));
  const canShowInStore = Boolean(voucher.claim?.storeToken && isClaimUsable(voucher.claim) && ["in_store", "both"].includes(voucher.redemptionMode));
  const isOutletVoucher = Boolean(voucher.outletId && !voucher.productId);
  const branchName = voucher.outletName ? outletShortName(voucher.outletName, voucher.vendorName) : null;
  const branchBadge = isOutletVoucher && branchName
    ? tCustomer("ui.voucherHub.branchBadge", { branch: branchName })
    : null;
  const visibleProductNames = voucher.eligibleProductNames.slice(0, 3);
  const remainingProductCount = Math.max(0, voucher.eligibleProductCount - visibleProductNames.length);
  const imageAlt = tCustomer("ui.voucherHub.outletImageAlt", { name: voucher.outletName ?? voucher.vendorName });
  const discountLabel = voucher.voucherType === "percent"
    ? tCustomer("ui.voucherHub.percentOff", { value: voucher.discountValue })
    : voucher.voucherType === "fixed"
      ? tCustomer("ui.voucherHub.fixedOff", { value: formatMYRNumber(voucher.discountValue) })
      : tCustomer("ui.voucherHub.filters.bogo");
  const expiryLabel = voucher.validUntil
    ? tCustomer("ui.voucherHub.ends", { date: new Date(voucher.validUntil).toLocaleDateString(i18n.resolvedLanguage ?? "en-MY", { day: "numeric", month: "short", year: "numeric" }) })
    : tCustomer("ui.voucherHub.noExpiry");
  const remainingLabel = voucher.maxUses === null
    ? tCustomer("ui.voucherHub.limitedTime")
    : tCustomer("ui.voucherHub.remaining", { count: Math.max(0, voucher.maxUses - voucher.usesCount) });
  const redemptionLabel = tCustomer(`ui.voucherHub.redemption.${voucher.redemptionMode}`);
  return (
    <VoucherTicket
      offer={{
        brandName: voucher.vendorName,
        name: voucher.vendorName,
        outletBadge: branchBadge,
        code: voucher.claim?.status === "claimed" ? voucher.code : null,
        codeLabel: tCustomer("ui.voucherHub.voucherCode"),
        codeCopyLabels: { copy: tCustomer("ui.voucherHub.copyCode"), copied: tCustomer("ui.voucherHub.copied") },
        barcodeValue: voucher.claim?.status === "claimed" && ["in_store", "both"].includes(voucher.redemptionMode) ? voucher.claim.storeToken : null,
        barcodeLabel: tCustomer("ui.voucherHub.barcode"),
        onBarcodeClick: canShowInStore ? () => onShowInStore(voucher) : undefined,
        discountLabel,
        minSpendLabel: voucher.minSpend > 0 ? tCustomer("ui.voucherHub.minSpend", { value: formatMYRNumber(voucher.minSpend) }) : null,
        expiryLabel,
        availabilityLabel: remainingLabel,
        scopeLabel: isOutletVoucher ? tCustomer("ui.voucherHub.outletVoucher") : voucher.voucherType === "bogo" ? tCustomer("ui.voucherHub.freebie") : tCustomer("ui.voucherHub.partnerVoucher"),
        scopeDetail: isOutletVoucher ? (
          <div className="rounded-2xl bg-secondary/55 p-3 max-sm:p-2.5">
            <p className="text-xs font-semibold text-primary">{tCustomer("ui.voucherHub.allEligibleProducts")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{tCustomer("ui.voucherHub.productsAvailable", { count: voucher.eligibleProductCount })}</p>
            {visibleProductNames.length > 0 && (
              <>
                <div className="mt-2 hidden flex-wrap gap-1.5 sm:flex">
                {(expandedProducts ? voucher.eligibleProductNames : visibleProductNames).map((productName) => (
                  <span key={productName} className="max-w-full break-words whitespace-normal rounded-xl border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground">
                    {productName}
                  </span>
                ))}
                {remainingProductCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpandedProducts((prev) => !prev)}
                    aria-expanded={expandedProducts}
                    className="rounded-full border border-primary/30 bg-card px-2.5 py-1 text-[11px] font-semibold text-primary transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  >
                    {expandedProducts ? tCustomer("ui.voucherHub.showLess", "Show less") : tCustomer("ui.voucherHub.moreProducts", { count: remainingProductCount })}
                  </button>
                )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 sm:hidden">
                  {expandedProducts && voucher.eligibleProductNames.map((productName) => (
                    <span key={productName} className="max-w-full break-words whitespace-normal rounded-xl border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground">
                      {productName}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setExpandedProducts((prev) => !prev)}
                    aria-expanded={expandedProducts}
                    className="min-h-9 rounded-full border border-primary/30 bg-card px-3 py-1 text-[11px] font-semibold text-primary transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  >
                    {expandedProducts ? tCustomer("ui.voucherHub.showLess", "Show less") : tCustomer("ui.voucherHub.moreProducts", { count: voucher.eligibleProductCount })}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : voucher.productName ? (
          <p className="text-xs font-semibold text-primary">{tCustomer("ui.voucherHub.eligibleProduct", { name: voucher.productName })}</p>
        ) : undefined,
        locationLabel: voucher.locationLabel ?? tCustomer("ui.voucherHub.malaysia"),
        identityLabel: <><Sparkles size={12} aria-hidden="true" className="text-[#FFCC00]" /> {tCustomer("ui.labels.verified")}</>,
        image: voucher.outletImageUrl
          ? { src: voucher.outletImageUrl, alt: imageAlt }
          : voucher.vendorCoverUrl
            ? { src: voucher.vendorCoverUrl, alt: voucher.vendorName }
            : null,
        fallback: { logoUrl: voucher.vendorLogoUrl, logoAlt: tCustomer("ui.voucherHub.vendorLogoAlt", { name: voucher.vendorName }), initials: voucher.vendorName.slice(0, 2).toUpperCase() },
      }}
    >
      {voucher.claim?.status === "claimed" && canUse ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
          <Check size={14} aria-hidden="true" /> {tCustomer("ui.voucherHub.saved")}
        </span>
      ) : (
        <span className="text-xs font-semibold text-muted-foreground">{redemptionLabel}</span>
      )}
      {canUse && (
        <Button asChild size="sm" className="max-sm:min-h-11 w-full rounded-full px-4">
          <Link href={buildVoucherUseHref(voucher.code, voucher.claim!.id)}>
            {tCustomer("ui.voucherHub.useNow")} <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </Button>
      )}
      {canShowInStore && (
        <Button
          type="button"
          size="sm"
          variant={canUse ? "outline" : "default"}
          onClick={() => onShowInStore(voucher)}
          className="max-sm:min-h-11 w-full rounded-full border-primary/30 px-4 text-xs font-bold text-primary hover:bg-secondary"
        >
          <QrCode size={13} aria-hidden="true" className="mr-1" />
          {tCustomer("ui.voucherHub.showAtOutlet")}
        </Button>
      )}
      {!canUse && !canShowInStore && (
        <Button
          type="button"
          size="sm"
          variant={actionKey === "claim" ? "default" : "outline"}
          className="max-sm:min-h-11 w-full rounded-full px-4"
          disabled={claiming || actionKey !== "claim"}
          onClick={() => onClaim(voucher)}
        >
          {tCustomer(`ui.voucherHub.actions.${actionKey}`)}
        </Button>
      )}
    </VoucherTicket>
  );
}

export default function VoucherHubClient() {
  const { t: tCustomer } = useTranslation("customer");
  const { t: tCommon } = useTranslation("common");
  const { showFeedback } = useActionFeedback();
  const { selectChat, unreadChatCount } = useSupportChat();
  const [tab, setTab] = useState<CustomerVoucherTab>("deals");
  const [vouchers, setVouchers] = useState<CustomerVoucher[]>([]);
  const [filter, setFilter] = useState<VoucherFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [redeemVoucher, setRedeemVoucher] = useState<CustomerVoucher | null>(null);

  useEffect(() => {
    const initialTab = new URLSearchParams(window.location.search).get("tab");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialTab === "mine" || initialTab === "deals") setTab(initialTab);
  }, []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetch(`/api/customer/vouchers?tab=${tab}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { data?: { vouchers?: CustomerVoucher[] }; error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message ?? tCustomer("ui.voucherHub.loadFailed"));
        if (active) setVouchers(payload.data?.vouchers ?? []);
      })
      .catch((requestError) => { if (active) setError(requestError instanceof Error ? requestError.message : tCustomer("ui.voucherHub.loadFailed")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tCustomer, tab]);

  async function claim(voucher: CustomerVoucher) {
    setClaimingId(voucher.id);
    try {
      const response = await fetch("/api/customer/vouchers/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voucherId: voucher.id }) });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? tCustomer("ui.voucherHub.claimFailed"));
      showFeedback("success", tCustomer("ui.voucherHub.claimSuccess"));
      const refresh = await fetch(`/api/customer/vouchers?tab=${tab}`, { cache: "no-store" });
      const refreshed = await refresh.json() as { data?: { vouchers?: CustomerVoucher[] } };
      setVouchers(refreshed.data?.vouchers ?? []);
    } catch (claimError) {
      showFeedback("error", claimError instanceof Error ? claimError.message : tCustomer("ui.voucherHub.claimFailed"));
    } finally {
      setClaimingId(null);
    }
  }

  const visibleVouchers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return vouchers.filter((voucher) => {
      const typeMatch = filter === "all" || voucher.voucherType === filter;
      const searchMatch = !needle || `${voucher.name} ${voucher.vendorName} ${voucher.outletName ?? ""} ${voucher.code} ${voucher.eligibleProductNames.join(" ")}`.toLowerCase().includes(needle);
      return typeMatch && searchMatch;
    });
  }, [filter, search, vouchers]);

  // A new tab, filter or search starts at page 1; a claim refresh keeps the page (clamped below).
  const listKey = `${tab}|${filter}|${search}`;
  const [pageState, setPageState] = useState({ key: listKey, page: 1 });
  const page = pageState.key === listKey ? pageState.page : 1;
  const totalPages = Math.max(1, Math.ceil(visibleVouchers.length / VOUCHER_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * VOUCHER_PAGE_SIZE;

  const activeFilterLabel = tCustomer(FILTERS.find((item) => item.value === filter)?.labelKey ?? FILTERS[0].labelKey);
  const renderFilterButtons = (mobile: boolean) => FILTERS.map((item) => (
    <button
      key={item.value}
      type="button"
      aria-pressed={filter === item.value}
      onClick={() => {
        setFilter(item.value);
        setFilterOpen(false);
      }}
      className={mobile
        ? `inline-flex min-h-11 items-center justify-center rounded-full border px-3 py-2 text-center text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${filter === item.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-primary"}`
        : `inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border px-4 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${filter === item.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted/40 hover:text-primary"}`}
    >
      {tCustomer(item.labelKey)}
    </button>
  ));

  return (
    <CustomerPageShell wide className="min-h-full">
      <CustomerPageHeader
        eyebrow={tCustomer("ui.voucherHub.eyebrow")}
        title={tCustomer(tab === "deals" ? "ui.voucherHub.dealsTitle" : "ui.voucherHub.mineTitle")}
        className="mb-8 gap-4"
        actions={(
          <div className="flex w-full flex-col gap-2 lg:w-auto lg:items-end">
            <div className="inline-flex w-full rounded-full border border-border bg-card p-1 lg:w-auto" role="tablist" aria-label={tCustomer("ui.voucherHub.viewsLabel")}>
              <button type="button" role="tab" aria-selected={tab === "deals"} onClick={() => setTab("deals")} className={`min-h-11 flex-1 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 lg:flex-none ${tab === "deals" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>{tCustomer("ui.voucherHub.browseDeals")}</button>
              <button type="button" role="tab" aria-selected={tab === "mine"} onClick={() => setTab("mine")} className={`min-h-11 flex-1 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 lg:flex-none ${tab === "mine" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>{tCustomer("ui.voucherHub.myVouchers")}</button>
            </div>
            <Button type="button" variant="outline" onClick={() => selectChat({ kind: "support" })} aria-label={tCommon("accessibility.openChat")} title={tCommon("chatbot.openChat")} className="relative min-h-11 self-end rounded-full px-3 text-sm font-semibold text-primary md:hidden sm:px-4">
              <MessageCircle size={16} aria-hidden="true" /> <span className="max-sm:sr-only">{tCommon("chatbot.openChat")}</span>
              {unreadChatCount > 0 && (
                <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-center text-[0.5625rem] font-bold leading-4 text-white">
                  {unreadChatCount > 99 ? "99+" : unreadChatCount}
                </span>
              )}
            </Button>
          </div>
        )}
      />

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full items-center gap-2 lg:order-2 lg:w-auto">
          <div className="min-w-0 flex-1 lg:w-80 lg:flex-initial">
            <DiscoverySearchField
              value={search}
              onChange={setSearch}
              placeholder={tCustomer("ui.voucherHub.searchPlaceholder")}
              ariaLabel={tCustomer("ui.voucherHub.searchLabel")}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            aria-label={tCustomer("ui.voucherHub.filterLabel")}
            aria-expanded={filterOpen}
            aria-controls="voucher-type-filter-panel"
            onClick={() => setFilterOpen((open) => !open)}
            className="min-h-11 shrink-0 rounded-full border-border bg-card px-3 text-xs font-semibold text-foreground hover:border-primary/30 lg:hidden"
          >
            <SlidersHorizontal size={15} aria-hidden="true" />
            <span className="max-w-24 truncate">{activeFilterLabel}</span>
            <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${filterOpen ? "rotate-180" : ""}`} />
          </Button>
        </div>
        <div className="hidden gap-2 overflow-x-auto pb-1 lg:order-1 lg:flex" role="group" aria-label={tCustomer("ui.voucherHub.filterLabel")}>
          {renderFilterButtons(false)}
        </div>
        <div id="voucher-type-filter-panel" role="group" aria-label={tCustomer("ui.voucherHub.filterLabel")} className={`${filterOpen ? "grid" : "hidden"} grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm lg:hidden`}>
          {renderFilterButtons(true)}
        </div>
      </div>

        {loading ? <div className="space-y-5">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-64 animate-pulse rounded-[1.75rem] bg-secondary/50" />)}</div> : error ? <div className="rounded-3xl border border-destructive/20 bg-card p-8 text-center"><Gift className="mx-auto text-destructive" /><p className="mt-3 text-sm font-semibold text-destructive">{error}</p><button type="button" onClick={() => window.location.reload()} className="mt-4 text-sm font-bold text-primary hover:underline">{tCustomer("ui.voucherHub.tryAgain")}</button></div> : visibleVouchers.length === 0 ? <div className="rounded-3xl border border-border bg-card p-10 text-center"><Gift className="mx-auto text-primary" /><h2 className="mt-3 text-lg font-bold text-foreground">{tCustomer(tab === "mine" ? "ui.voucherHub.emptyMineTitle" : "ui.voucherHub.emptyDealsTitle")}</h2><p className="mt-2 text-sm text-muted-foreground">{tCustomer(tab === "mine" ? "ui.voucherHub.emptyMineDescription" : "ui.voucherHub.emptyDealsDescription")}</p>{tab === "mine" && <button type="button" onClick={() => setTab("deals")} className="mt-4 text-sm font-bold text-primary hover:underline">{tCustomer("ui.voucherHub.browseDeals")}</button>}</div> : <><div className="space-y-5">{visibleVouchers.slice(pageStart, pageStart + VOUCHER_PAGE_SIZE).map((voucher) => <VoucherCard key={voucher.id} voucher={voucher} onClaim={claim} claiming={claimingId === voucher.id} onShowInStore={setRedeemVoucher} />)}</div><Pagination currentPage={safePage} onPageChange={(next) => setPageState({ key: listKey, page: next })} pageSize={VOUCHER_PAGE_SIZE} totalItems={visibleVouchers.length} totalPages={totalPages} /></>}
        <VoucherRedeemDialog open={Boolean(redeemVoucher)} onOpenChange={(open) => { if (!open) setRedeemVoucher(null); }} voucher={redeemVoucher} />
    </CustomerPageShell>
  );
}
