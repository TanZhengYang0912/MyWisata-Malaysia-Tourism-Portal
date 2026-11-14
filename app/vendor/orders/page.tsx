"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  Check,
  Copy,
  Download,
  Eye,
  MoreHorizontal,
  PackageCheck,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { StatusBadge } from "@/components/ui/badge";
import CompactThumbnail from "@/components/vendor/compact-thumbnail";
import { Pagination as SharedPagination } from "@/components/shared/pagination";
import BatchActionBar from "@/components/vendor/batch-action-bar";
import ActionConfirmationDialog from "@/components/vendor/action-confirmation-dialog";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { useDebounce } from "@/hooks/use-debounce";
import { exportToCsv, generateCsvContent, downloadCsvFile, type CsvColumn } from "@/lib/export-csv";
import { productImageUrl } from "@/lib/storage/product-image";
import { formatMYR } from "@/lib/i18n/format";
import { formatDateTime } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import type { StayBookingDetails } from "@/backend/core/types";
import CenteredDetailModal from "@/components/ui/centered-detail-modal";
import { VendorPageHeader } from "@/components/vendor/vendor-page-header";
import { VendorMetricCard } from "@/components/vendor/vendor-metric-card";
import { FilterDateRange, FilterSegmented, isInvalidDateRange } from "@/components/vendor/compact-filter-bar";
import { VendorListFilters } from "@/components/vendor/vendor-list-filters";
import { SelectPageBar } from "@/components/vendor/select-page-bar";
import { VendorMobileRecordCard } from "@/components/vendor/mobile-record-card";
import {
  getBatchFulfilmentActions,
  getItemFulfilmentAction,
  getOrderFulfilmentAction,
  type FulfilmentAction,
} from "@/lib/vendor/order-actions";

interface OrderItemData {
  id: string;
  order_id: string;
  product_name: string;
  variant_name: string | null;
  slot_starts_at: string | null;
  quantity: number;
  line_total: number;
  fulfil_status: string;
  food_fulfilment_mode?: "dine_in" | "takeaway" | null;
  food_qr_scanned_at?: string | null;
  stay_details?: StayBookingDetails | null;
  nights?: number | null;
  created_at: string;
  outlets?: { id?: string; name?: string; city?: string; state?: string };
  products?:
    | { cover_url?: string | null; categories?: { slug?: string } | { slug?: string }[] | null }
    | Array<{ cover_url?: string | null; categories?: { slug?: string } | { slug?: string }[] | null }>;
}
interface VendorOrderData {
  id: string;
  display_id?: string;
  status: string;
  paid_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  users?:
    | { full_name?: string; email?: string }
    | Array<{ full_name?: string; email?: string }>;
  vendor_total: number;
  vendor_items: OrderItemData[];
  outlets_summary: string;
  vendor_fulfil_status: string;
  product_summary: string;
}
interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface OrderFilters {
  q: string;
  fulfilStatus: string;
  orderStatus: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: OrderFilters = {
  q: "",
  fulfilStatus: "",
  orderStatus: "",
  from: "",
  to: "",
};

const ORDER_STATUS_OPTIONS = [
  "paid",
  "completed",
  "pending_payment",
  "cancelled",
  "refunded",
] as const;

const FULFILMENT_STATUS_OPTIONS = [
  "pending",
  "ready",
  "fulfilled",
  "cancelled",
] as const;

type ConfirmationTarget =
  | {
      kind: "order";
      order: VendorOrderData;
      action: FulfilmentAction;
      itemIds: string[];
      skippedCount: number;
    }
  | {
      kind: "item";
      orderId: string;
      item: OrderItemData;
      action: FulfilmentAction;
    }
  | {
      kind: "batch";
      action: FulfilmentAction;
      selectedOrderCount: number;
      eligibleCount: number;
      allFilteredSelected: boolean;
    };

function customerFor(order: VendorOrderData) {
  const customer = Array.isArray(order.users) ? order.users[0] : order.users;
  return customer || {};
}
function imageFor(item: OrderItemData) {
  const product = Array.isArray(item.products)
    ? item.products[0]
    : item.products;
  return productImageUrl(product?.cover_url) || undefined;
}
function categorySlugFor(item: OrderItemData) {
  const product = Array.isArray(item.products) ? item.products[0] : item.products;
  const category = Array.isArray(product?.categories) ? product.categories[0] : product?.categories;
  return category?.slug;
}

export default function VendorOrdersPage() {
  const { t, i18n } = useTranslation("vendor");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkedOrderId = searchParams.get("orderId") ?? "";
  const { user } = useAuth();
  const { showFeedback } = useActionFeedback();

  async function copyOrderId(orderId: string) {
    try {
      await navigator.clipboard.writeText(orderId);
      showFeedback("success", t("ui.orders.orderIdCopied", { id: orderId }));
    } catch {
      showFeedback("error", t("ui.orders.orderIdCopyFailed", { id: orderId }));
    }
  }
  const vendorId = user?.activeVendorId;
  const [items, setItems] = useState<VendorOrderData[]>([]);
  const [selectedItem, setSelectedItem] = useState<VendorOrderData | null>(
    null,
  );
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
  });
  const [filters, setFilters] = useState<OrderFilters>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] =
    useState<OrderFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);
  const [batchMessage, setBatchMessage] = useState("");
  const [pendingConfirmation, setPendingConfirmation] =
    useState<ConfirmationTarget | null>(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);

  const debouncedQ = useDebounce(filters.q, 300);

  const loadOrders = useCallback(
    async (page = 1) => {
      if (!vendorId) return;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: "10",
          q: debouncedQ,
          fulfil_status: filters.fulfilStatus,
          order_status: filters.orderStatus,
          from: filters.from,
          to: filters.to,
        });
        if (linkedOrderId) params.set("orderId", linkedOrderId);
        const response = await fetch(
          `/api/vendors/${vendorId}/orders?${params}`,
          { cache: "no-store" },
        );
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error?.message || t("ui.orders.loadFailed"));
        setItems(payload.data?.items || []);
        setPagination(
          payload.data?.pagination || {
            page,
            pageSize: 10,
            total: 0,
            totalPages: 1,
          },
        );
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : t("ui.orders.loadFailed"),
        );
      } finally {
        setLoading(false);
      }
    },
    [
      debouncedQ,
      filters.fulfilStatus,
      filters.orderStatus,
      filters.from,
      filters.to,
      linkedOrderId,
      t,
      vendorId,
    ],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOrders(1);
  }, [loadOrders]);

  useEffect(() => {
    if (!linkedOrderId || loading) return;
    const linkedOrder = items.find((order) => order.id === linkedOrderId);
    if (!linkedOrder) return;
    // Apply the order deep link after the list arrives, then remove its one-time query parameter.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedItem(linkedOrder);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("orderId");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `/vendor/orders?${nextQuery}` : "/vendor/orders", { scroll: false });
  }, [items, linkedOrderId, loading, router, searchParams]);

  function clearSelectionAfterFilterChange() {
    setSelectedIds([]);
    setAllFilteredSelected(false);
  }

  function applyQuickFilter(value: string) {
    const nextFilters = { ...filters, fulfilStatus: value };
    setFilters(nextFilters);
    setDraftFilters(nextFilters);
    clearSelectionAfterFilterChange();
  }

  function applyAdvancedFilters() {
    if (isInvalidDateRange(draftFilters)) return;
    setFilters(draftFilters);
    setFiltersOpen(false);
    clearSelectionAfterFilterChange();
  }

  const stats = useMemo(() => {
    let attention = 0;
    let ready = 0;
    let fulfilled = 0;
    let totalSales = 0;
    for (const order of items) {
      if (order.vendor_fulfil_status === 'pending' || order.status === 'pending_payment') attention++;
      else if (order.vendor_fulfil_status === 'ready') ready++;
      else if (order.vendor_fulfil_status === 'fulfilled') fulfilled++;
      totalSales += Number(order.vendor_total) || 0;
    }
    return { attention, ready, fulfilled, totalSales };
  }, [items]);

  const selectedOrders = useMemo(
    () => items.filter((order) => selectedIds.includes(order.id)),
    [items, selectedIds],
  );
  const selectedEntries = useMemo(
    () =>
      selectedOrders.flatMap((order) =>
        order.vendor_items.map((item) => ({
          orderStatus: order.status,
          fulfilStatus: item.fulfil_status,
        })),
      ),
    [selectedOrders],
  );
  const batchCounts = useMemo(
    () => getBatchFulfilmentActions(selectedEntries),
    [selectedEntries],
  );
  const batchActions = useMemo(() => {
    if (allFilteredSelected)
      return [
        {
          value: "ready",
          label: t("ui.orders.batchActionCount", {
            action: t("ui.orders.markReady"),
            count: batchCounts.ready,
          }),
        },
        {
          value: "fulfilled",
          label: t("ui.orders.batchActionCount", {
            action: t("ui.orders.fulfilSelected"),
            count: batchCounts.fulfilled,
          }),
        },
      ];
    return [
      batchCounts.ready > 0
        ? {
            value: "ready",
            label: t("ui.orders.batchActionCount", {
              action: t("ui.orders.markReady"),
              count: batchCounts.ready,
            }),
          }
        : null,
      batchCounts.fulfilled > 0
        ? {
            value: "fulfilled",
            label: t("ui.orders.batchActionCount", {
              action: t("ui.orders.fulfilSelected"),
              count: batchCounts.fulfilled,
            }),
          }
        : null,
    ].filter((action): action is { value: string; label: string } =>
      Boolean(action),
    );
  }, [allFilteredSelected, batchCounts.fulfilled, batchCounts.ready, t]);

  function handleExportOrders() {
    if (!items.length) return;
    const columns: CsvColumn<VendorOrderData>[] = [
      { header: "Order ID", accessor: (o) => o.display_id || o.id },
      {
        header: "Customer",
        accessor: (o) => customerFor(o).full_name || "Guest",
      },
      { header: "Email", accessor: (o) => customerFor(o).email || "" },
      { header: "Products", accessor: (o) => o.product_summary },
      { header: "Outlets", accessor: (o) => o.outlets_summary },
      {
        header: "Total (MYR)",
        accessor: (o) => formatMYR(Number(o.vendor_total)),
      },
      { header: "Fulfilment Status", accessor: (o) => o.vendor_fulfil_status },
      { header: "Order Status", accessor: (o) => o.status },
      {
        header: "Date",
        accessor: (o) => new Date(o.created_at).toLocaleString(),
      },
    ];
    exportToCsv(
      `orders-${new Date().toISOString().split("T")[0]}`,
      columns,
      items,
    );
  }

  function handleExportReadableOrders() {
    if (!items.length) return;
    const columns: CsvColumn<VendorOrderData>[] = [
      { header: t("ui.orders.csv.orderId"), accessor: (o) => o.display_id || o.id },
      { header: t("ui.orders.csv.customer"), accessor: (o) => customerFor(o).full_name || t("ui.bookings.guest") },
      { header: t("ui.orders.csv.email"), accessor: (o) => customerFor(o).email || "" },
      { header: t("ui.orders.csv.products"), accessor: (o) => o.product_summary },
      { header: t("ui.orders.csv.outlets"), accessor: (o) => o.outlets_summary },
      { header: t("ui.orders.csv.total"), accessor: (o) => formatMYR(Number(o.vendor_total)) },
      { header: t("ui.orders.csv.fulfilmentStatus"), accessor: (o) => i18n.exists(`ui.status.${o.vendor_fulfil_status}`) ? t(`ui.status.${o.vendor_fulfil_status}`) : o.vendor_fulfil_status },
      { header: t("ui.orders.csv.orderStatus"), accessor: (o) => i18n.exists(`ui.status.${o.status}`) ? t(`ui.status.${o.status}`) : o.status },
      { header: t("ui.orders.csv.date"), accessor: (o) => formatDateTime(o.created_at, locale, { timeZone: "Asia/Kuala_Lumpur" }) },
    ];
    downloadCsvFile(`orders-${new Date().toISOString().slice(0, 10)}-${locale}`, generateCsvContent(columns, items));
  }

  function eligibleItemsFor(order: VendorOrderData, action: FulfilmentAction) {
    return order.vendor_items.filter(
      (item) =>
        getItemFulfilmentAction(order.status, item.fulfil_status) === action,
    );
  }

  function requestOrderAction(
    order: VendorOrderData,
    action: FulfilmentAction,
  ) {
    const eligibleItems = eligibleItemsFor(order, action);
    if (!eligibleItems.length) {
      showFeedback("error", t("ui.orders.noEligibleAction"));
      return;
    }
    setPendingConfirmation({
      kind: "order",
      order,
      action,
      itemIds: eligibleItems.map((item) => item.id),
      skippedCount: order.vendor_items.length - eligibleItems.length,
    });
  }

  function requestItemAction(
    order: VendorOrderData,
    item: OrderItemData,
    action: FulfilmentAction,
  ) {
    if (getItemFulfilmentAction(order.status, item.fulfil_status) !== action) {
      showFeedback("error", t("ui.orders.noEligibleAction"));
      return;
    }
    setPendingConfirmation({ kind: "item", orderId: order.id, item, action });
  }

  function requestBatchAction(action: string) {
    if (action !== "ready" && action !== "fulfilled") return;
    const eligibleCount = selectedEntries.filter(
      (item) =>
        getItemFulfilmentAction(item.orderStatus, item.fulfilStatus) === action,
    ).length;
    if (!eligibleCount && !allFilteredSelected) {
      showFeedback("error", t("ui.orders.noEligibleAction"));
      return;
    }
    setPendingConfirmation({
      kind: "batch",
      action,
      selectedOrderCount: allFilteredSelected
        ? pagination.total
        : selectedIds.length,
      eligibleCount,
      allFilteredSelected,
    });
  }

  async function confirmRequestedAction() {
    if (!vendorId || !pendingConfirmation) return;
    const target = pendingConfirmation;
    setConfirmationBusy(true);
    try {
      let response: Response;
      if (target.kind === "item") {
        response = await fetch(
          `/api/vendors/${vendorId}/orders/${target.item.id}/fulfil`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: target.action }),
          },
        );
      } else {
        const ids =
          target.kind === "order"
            ? target.itemIds
            : selectedOrders.flatMap((order) =>
                order.vendor_items.map((item) => item.id),
              );
        response = await fetch(`/api/vendors/${vendorId}/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity: "orders",
            action: target.action,
            ids,
            selectAllFiltered:
              target.kind === "batch" && target.allFilteredSelected,
            filters: target.kind === "batch" ? filters : {},
          }),
        });
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload.error?.message || t("ui.orders.updateFailed");
        setError(message);
        showFeedback("error", message);
        return;
      }
      const updated = Number(payload.data?.updated || 0);
      const skipped = Number(
        payload.data?.skipped ||
          (target.kind === "order" ? target.skippedCount : 0),
      );
      if (target.kind === "item") {
        showFeedback(
          "success",
          target.action === "ready"
            ? t("ui.orders.itemMarkedReady")
            : t("ui.orders.itemFulfilled"),
        );
        setSelectedItem((current) =>
          current && current.id === target.orderId
            ? {
                ...current,
                vendor_items: current.vendor_items.map((item) =>
                  item.id === target.item.id
                    ? { ...item, fulfil_status: target.action }
                    : item,
                ),
              }
            : current,
        );
      } else if (skipped) {
        const summary = t("ui.orders.skippedActionSummary", {
          updated,
          skipped,
        });
        showFeedback("success", summary);
        if (target.kind === "batch") setBatchMessage(summary);
        setSelectedItem(null);
      } else {
        const summary =
          target.kind === "batch"
            ? t("ui.orders.batchSummary", { count: updated })
            : target.action === "ready"
              ? t("ui.orders.orderMarkedReady")
              : t("ui.orders.orderFulfilled");
        showFeedback("success", summary);
        if (target.kind === "batch") setBatchMessage(summary);
        if (target.kind === "order") setSelectedItem(null);
      }
      setPendingConfirmation(null);
      if (target.kind === "batch") {
        setSelectedIds([]);
        setAllFilteredSelected(false);
      }
      void loadOrders(target.kind === "batch" ? 1 : pagination.page);
    } catch {
      const message = t("ui.orders.updateTryAgain");
      setError(message);
      showFeedback("error", message);
    } finally {
      setConfirmationBusy(false);
    }
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setDraftFilters(EMPTY_FILTERS);
    setFiltersOpen(false);
    clearSelectionAfterFilterChange();
  }
  function toggleSelected(orderId: string) {
    setAllFilteredSelected(false);
    setSelectedIds((current) =>
      current.includes(orderId)
        ? current.filter((id) => id !== orderId)
        : [...current, orderId],
    );
  }

  const selectedOrderAction = selectedItem
    ? getOrderFulfilmentAction(
        selectedItem.status,
        selectedItem.vendor_items.map((item) => item.fulfil_status),
      )
    : null;
  const confirmationTitle =
    pendingConfirmation?.kind === "batch"
      ? pendingConfirmation.action === "ready"
        ? t("ui.orders.confirmBatchMarkReadyTitle")
        : t("ui.orders.confirmBatchFulfilTitle")
      : pendingConfirmation?.action === "ready"
        ? t("ui.orders.confirmMarkReadyTitle")
        : t("ui.orders.confirmFulfilTitle");
  const confirmationDescription =
    pendingConfirmation?.kind === "batch"
      ? pendingConfirmation.allFilteredSelected
        ? t("ui.orders.confirmBatchAllDescription", {
            eligible: pendingConfirmation.eligibleCount,
          })
        : t("ui.orders.confirmBatchDescription", {
            selected: pendingConfirmation.selectedOrderCount,
            eligible: pendingConfirmation.eligibleCount,
          })
      : pendingConfirmation?.kind === "item"
        ? pendingConfirmation.action === "ready"
          ? t("ui.orders.confirmItemMarkReadyDescription")
          : t("ui.orders.confirmItemFulfilDescription")
        : pendingConfirmation?.action === "ready"
          ? t("ui.orders.confirmMarkReadyDescription")
          : t("ui.orders.confirmFulfilDescription");
  const confirmationLabel =
    pendingConfirmation?.action === "ready"
      ? t("ui.orders.markReady")
      : t("ui.orders.fulfil");

  return (
    <div className="space-y-5 pb-0 lg:pb-24">
      <VendorPageHeader
        eyebrow={<><ShoppingBag size={15} aria-hidden="true" /> {t("ui.orders.fulfilmentDesk")}</>}
        title={t("ui.orders.title")}
        actions={<div className="hidden w-full flex-col gap-2 md:flex md:w-auto md:flex-row">
        <button
          type="button"
          onClick={handleExportOrders}
          disabled={loading || items.length === 0}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card px-3.5 py-2.5 text-sm font-semibold text-gray-700 dark:text-foreground shadow-sm hover:bg-gray-50 dark:hover:bg-muted/50 disabled:opacity-40"
        >
          <Download size={16} aria-hidden="true" /> {t("actions.exportCsv")}
        </button>
        <button type="button" onClick={handleExportReadableOrders} disabled={loading || items.length === 0} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card px-3.5 py-2.5 text-sm font-semibold text-gray-700 dark:text-foreground shadow-sm hover:bg-gray-50 dark:hover:bg-muted/50 disabled:opacity-40">
          <Download size={16} aria-hidden="true" /> {t("actions.exportReadableCsv")}
        </button>
        </div>}
      />

      {/* Same card for every figure; only work that is waiting gets a colour. */}
      <section aria-label={t("ui.orders.title")} className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <VendorMetricCard label={t("ui.orders.needsAttention")} value={stats.attention} tone={stats.attention > 0 ? "attention" : "default"} note={t("ui.products.currentPage")} />
        <VendorMetricCard label={t("ui.orders.readyCount")} value={stats.ready} note={t("ui.products.currentPage")} />
        <VendorMetricCard label={t("ui.orders.completed")} value={stats.fulfilled} note={t("ui.products.currentPage")} />
        <VendorMetricCard label={t("ui.orders.pageOrderTotal")} value={formatMYR(stats.totalSales)} note={t("ui.products.currentPage")} />
      </section>

      <div className="flex justify-end md:hidden">
        <details className="group relative">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card px-3.5 text-sm font-semibold text-gray-700 dark:text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 [&::-webkit-details-marker]:hidden">
            <MoreHorizontal size={17} aria-hidden="true" /> {t("actions.moreActions")}
          </summary>
          <div className="absolute right-0 z-20 mt-2 flex w-60 flex-col gap-1 rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-2 shadow-xl">
            <button type="button" onClick={handleExportOrders} disabled={loading || items.length === 0} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-muted/50 disabled:opacity-40">
              <Download size={16} aria-hidden="true" /> {t("actions.exportCsv")}
            </button>
            <button type="button" onClick={handleExportReadableOrders} disabled={loading || items.length === 0} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-muted/50 disabled:opacity-40">
              <Download size={16} aria-hidden="true" /> {t("actions.exportReadableCsv")}
            </button>
          </div>
        </details>
      </div>

      <VendorListFilters
        query={filters.q}
        onQueryChange={(q) => {
          setFilters((current) => ({ ...current, q }));
          setDraftFilters((current) => ({ ...current, q }));
        }}
        placeholder={t("ui.orders.searchPlaceholder")}
        chips={[
          ...(filters.fulfilStatus ? [{
            key: "fulfilStatus",
            label: filters.fulfilStatus === "attention" ? t("ui.orders.needsAttention") : filters.fulfilStatus === "fulfilled" ? t("ui.orders.completed") : t(`ui.status.${filters.fulfilStatus}`),
            onRemove: () => applyQuickFilter(""),
          }] : []),
          ...(filters.orderStatus ? [{
            key: "orderStatus",
            label: t(`ui.status.${filters.orderStatus}`),
            onRemove: () => {
              const nextFilters = { ...filters, orderStatus: "" };
              setFilters(nextFilters);
              setDraftFilters(nextFilters);
              clearSelectionAfterFilterChange();
            },
          }] : []),
          ...(filters.from || filters.to ? [{
            key: "dateRange",
            label: `${t("ui.orders.dateRange")}: ${filters.from || "…"} – ${filters.to || "…"}`,
            onRemove: () => {
              const nextFilters = { ...filters, from: "", to: "" };
              setFilters(nextFilters);
              setDraftFilters(nextFilters);
              clearSelectionAfterFilterChange();
            },
          }] : []),
        ]}
        onClearAll={clearFilters}
        drawerTitle={t("ui.orders.advancedFilters")}
        open={filtersOpen}
        onOpenChange={(open) => {
          if (open) setDraftFilters(filters);
          setFiltersOpen(open);
        }}
        onApply={applyAdvancedFilters}
        applyDisabled={isInvalidDateRange(draftFilters)}
        resultCountLabel={t("ui.orders.applyFilters")}
      >
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">{t("ui.listFilters.quickStatus")}</p>
          <FilterSegmented
            layout="grid"
            ariaLabel={t("ui.listFilters.quickStatus")}
            options={[
              { value: "", label: t("ui.orders.allOrders") },
              { value: "attention", label: t("ui.orders.needsAttention") },
              { value: "fulfilled", label: t("ui.orders.completed") },
              { value: "cancelled", label: t("ui.status.cancelled") },
            ]}
            value={draftFilters.fulfilStatus === "pending" || draftFilters.fulfilStatus === "ready" ? "attention" : draftFilters.fulfilStatus}
            onChange={(fulfilStatus) => setDraftFilters((current) => ({ ...current, fulfilStatus }))}
          />
        </div>
        <label className="block space-y-2 text-sm font-semibold text-foreground">
          <span>{t("ui.orders.fulfilmentStatus")}</span>
          <select
            value={draftFilters.fulfilStatus}
            onChange={(event) => setDraftFilters((current) => ({ ...current, fulfilStatus: event.target.value }))}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          >
            <option value="">{t("ui.orders.allItems")}</option>
            <option value="attention">{t("ui.orders.needsAttention")}</option>
            {FULFILMENT_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{t(`ui.status.${status}`)}</option>)}
          </select>
        </label>
        <label className="block space-y-2 text-sm font-semibold text-foreground">
          <span>{t("ui.orders.orderStatusFilter")}</span>
          <select
            value={draftFilters.orderStatus}
            onChange={(event) => setDraftFilters((current) => ({ ...current, orderStatus: event.target.value }))}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          >
            <option value="">{t("ui.orders.allOrderStates")}</option>
            {ORDER_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{t(`ui.status.${status}`)}</option>)}
          </select>
        </label>
        <FilterDateRange
          legend={t("ui.orders.dateRange")}
          value={{ from: draftFilters.from, to: draftFilters.to }}
          onChange={(range) => setDraftFilters((current) => ({ ...current, ...range }))}
        />
      </VendorListFilters>

      <BatchActionBar
        selectedCount={selectedIds.length}
        total={pagination.total}
        allFilteredSelected={allFilteredSelected}
        onSelectAllFiltered={() => {
          setAllFilteredSelected(true);
          setSelectedIds(items.map((item) => item.id));
        }}
        onClear={() => {
          setSelectedIds([]);
          setAllFilteredSelected(false);
          setBatchMessage("");
        }}
        onApply={requestBatchAction}
        actions={batchActions}
        busy={confirmationBusy}
        noActionsLabel={t("ui.orders.batchNoEligibleActions")}
        message={batchMessage}
      />

      {error && (
        <div
          className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200"
          role="alert"
        >
          {error}
        </div>
      )}
      <section className="overflow-hidden rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card shadow-sm">
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-muted"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-gray-400 dark:text-muted-foreground">
            <PackageCheck
              className="mx-auto mb-3 opacity-30"
              size={34}
              aria-hidden="true"
            />
            <p>{t("ui.orders.noMatches")}</p>
          </div>
        ) : (
          <>
            <SelectPageBar
              pageIds={items.map((order) => order.id)}
              selectedIds={selectedIds}
              onChange={setSelectedIds}
              label={t('ui.orders.selectCurrentPage')}
              summary={t("ui.orders.pageSummary", {
                count: pagination.total.toLocaleString(),
                perPage: 10,
              })}
            />
            <div data-mobile-order-list className="space-y-3 p-3 xl:hidden">
              {items.map((order) => {
                const customer = customerFor(order);
                const displayOrderId = order.display_id || `#${order.id.slice(0, 8)}`;
                const orderAction = getOrderFulfilmentAction(
                  order.status,
                  order.vendor_items.map((item) => item.fulfil_status),
                );
                const actionLabel =
                  orderAction === "review"
                    ? t("ui.orders.reviewItems")
                    : orderAction === "ready"
                      ? t("ui.orders.markReady")
                      : orderAction === "fulfilled"
                        ? t("ui.orders.fulfil")
                        : "";

                return (
                  <VendorMobileRecordCard
                    key={order.id}
                    header={
                      <>
                        <div className="flex min-w-0 flex-1 items-start gap-2">
                          <label className="flex size-11 shrink-0 items-center justify-center">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(order.id)}
                              onChange={() => toggleSelected(order.id)}
                              aria-label={t("ui.orders.selectOrder", {
                                id: order.id,
                              })}
                              className="size-5"
                            />
                          </label>
                          <div className="min-w-0 flex-1 pt-1">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {customer.full_name || t("ui.orders.guest")}
                            </p>
                            <div className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                              <span className="truncate font-mono">{displayOrderId}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={t("ui.orders.copyOrderId", { id: displayOrderId })}
                                title={t("ui.orders.copyOrderId", { id: displayOrderId })}
                                onClick={() => void copyOrderId(displayOrderId)}
                                className="size-9 shrink-0 rounded-md text-muted-foreground hover:bg-secondary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40"
                              >
                                <Copy size={13} aria-hidden="true" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        <StatusBadge status={order.vendor_fulfil_status} />
                      </>
                    }
                    footer={
                      // Same rule as the desktop row: one primary next step, details as a
                      // square icon. "Review items" already opens the details, so it stands alone.
                      <div className="flex items-center gap-2">
                        {orderAction ? (
                          <Button
                            type="button"
                            onClick={() =>
                              orderAction === "review"
                                ? setSelectedItem(order)
                                : requestOrderAction(order, orderAction)
                            }
                            aria-label={`${actionLabel} ${displayOrderId}`}
                            className="min-h-11 min-w-0 flex-1 gap-1.5 whitespace-nowrap px-3 text-xs"
                          >
                            {orderAction === "ready" ? (
                              <Check size={15} aria-hidden="true" />
                            ) : orderAction === "review" ? (
                              <Eye size={15} aria-hidden="true" />
                            ) : (
                              <PackageCheck size={15} aria-hidden="true" />
                            )}
                            <span className="truncate">{actionLabel}</span>
                          </Button>
                        ) : null}
                        {orderAction !== "review" && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setSelectedItem(order)}
                            aria-label={`${t("ui.orders.viewDetails")} ${displayOrderId}`}
                            title={t("ui.orders.viewDetails")}
                            className={orderAction ? "size-11 shrink-0 p-0" : "min-h-11 w-full gap-1.5 px-3 text-xs"}
                          >
                            <Eye size={15} aria-hidden="true" />
                            {!orderAction && <span className="truncate">{t("ui.orders.viewDetails")}</span>}
                          </Button>
                        )}
                      </div>
                    }
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex shrink-0 items-center gap-1">
                        {order.vendor_items.slice(0, 2).map((item, index) => (
                          <CompactThumbnail
                            key={index}
                            src={imageFor(item)}
                            alt={item.product_name}
                            kind="product"
                          />
                        ))}
                        {order.vendor_items.length > 2 && (
                          <span className="ml-1 text-xs font-medium text-muted-foreground">
                            +{order.vendor_items.length - 2}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setSelectedItem(order)}
                          className="block max-w-full text-left text-xs font-semibold text-primary hover:underline"
                        >
                          {t("ui.orders.itemCount", {
                            count: order.vendor_items.length,
                          })}
                        </button>
                        <p className="mt-0.5 line-clamp-2 text-sm font-medium text-foreground">
                          {order.product_summary}
                        </p>
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center justify-between gap-3 border-t border-border pt-3">
                      <p className="min-w-0 truncate text-xs text-muted-foreground">
                        {order.outlets_summary}
                      </p>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-foreground">
                          {formatMYR(Number(order.vendor_total))}
                        </p>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {t("ui.orders.orderStatus", {
                            status: order.status || t("ui.orders.unknown"),
                          })}
                        </span>
                      </div>
                    </div>
                  </VendorMobileRecordCard>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto xl:block">
              <div className="xl:min-w-[1000px]">
                <div className="hidden grid-cols-[32px_minmax(140px,1.2fr)_minmax(190px,1.6fr)_minmax(100px,1fr)_90px_110px_170px] gap-4 border-b border-gray-100 dark:border-border bg-gray-50/60 dark:bg-muted/60 px-5 py-3 text-xs font-semibold text-gray-500 dark:text-muted-foreground xl:grid">
                  <span></span>
                  <span>{t('ui.orders.customerColumn')}</span>
                  <span>{t("ui.orders.itemsColumn")}</span>
                  <span>{t("ui.orders.outletColumn")}</span>
                  <span>{t("ui.orders.totalColumn")}</span>
                  <span>{t("ui.orders.statusColumn")}</span>
                  <span className="text-right">
                    {t("ui.orders.actionColumn")}
                  </span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-border">
                  {items.map((order) => {
                    const customer = customerFor(order);
                    const displayOrderId = order.display_id || `#${order.id.slice(0, 8)}`;
                    const orderAction = getOrderFulfilmentAction(
                      order.status,
                      order.vendor_items.map((item) => item.fulfil_status),
                    );
                    const actionLabel =
                      orderAction === "review"
                        ? t("ui.orders.reviewItems")
                        : orderAction === "ready"
                          ? t("ui.orders.markReady")
                          : orderAction === "fulfilled"
                            ? t("ui.orders.fulfil")
                            : "";
                    return (
                      <article
                        key={order.id}
                        className="grid gap-3 px-4 py-4 transition hover:bg-secondary/30 xl:grid-cols-[32px_minmax(140px,1.2fr)_minmax(190px,1.6fr)_minmax(100px,1fr)_90px_110px_170px] xl:items-center xl:gap-4 xl:px-5"
                      >
                        <div>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(order.id)}
                            onChange={() => toggleSelected(order.id)}
                            aria-label={t("ui.orders.selectOrder", {
                              id: order.id,
                            })}
                          />
                        </div>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setSelectedItem(order)}
                            className="block max-w-full truncate text-left font-medium text-gray-800 dark:text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm"
                          >
                            {customer.full_name || t("ui.orders.guest")}
                          </button>
                          <div className="mt-1 flex min-w-0 items-center gap-1 text-xs text-gray-500 dark:text-muted-foreground">
                            <span className="truncate font-mono">{displayOrderId}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={t("ui.orders.copyOrderId", { id: displayOrderId })}
                              title={t("ui.orders.copyOrderId", { id: displayOrderId })}
                              onClick={() => void copyOrderId(displayOrderId)}
                              className="size-7 shrink-0 rounded-md text-gray-400 hover:bg-secondary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40"
                            >
                              <Copy size={13} aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex items-center gap-1">
                            {order.vendor_items.slice(0, 2).map((item, i) => (
                              <CompactThumbnail
                                key={i}
                                src={imageFor(item)}
                                alt={item.product_name}
                                kind="product"
                              />
                            ))}
                            {order.vendor_items.length > 2 && (
                              <span className="ml-1 text-xs font-medium text-gray-400 dark:text-muted-foreground">
                                +{order.vendor_items.length - 2}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => setSelectedItem(order)}
                              className="block max-w-full truncate text-left font-semibold text-gray-900 dark:text-foreground hover:text-primary"
                            >
                              {t("ui.orders.itemCount", {
                                count: order.vendor_items.length,
                              })}
                            </button>
                            <p className="mt-1 truncate text-xs text-gray-500 dark:text-muted-foreground">
                              {order.product_summary}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-muted-foreground">
                          {order.outlets_summary}
                        </p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-foreground">
                          {formatMYR(Number(order.vendor_total))}
                        </p>
                        <div>
                          <StatusBadge status={order.vendor_fulfil_status} />
                          <span className="mt-1 block text-[11px] text-gray-400 dark:text-muted-foreground">
                            {t("ui.orders.orderStatus", {
                              status: order.status || t("ui.orders.unknown"),
                            })}
                          </span>
                        </div>
                        {/* One primary next step per row; details stay one click away as a quiet icon button. */}
                        <div className="flex items-center justify-end gap-2">
                          {orderAction ? (
                            <button
                              type="button"
                              onClick={() =>
                                orderAction === "review"
                                  ? setSelectedItem(order)
                                  : requestOrderAction(order, orderAction)
                              }
                              aria-label={`${actionLabel} ${displayOrderId}`}
                              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1"
                            >
                              {orderAction === "ready" ? (
                                <Check size={14} aria-hidden="true" />
                              ) : orderAction === "review" ? (
                                <Eye size={14} aria-hidden="true" />
                              ) : (
                                <PackageCheck size={14} aria-hidden="true" />
                              )}
                              <span>{actionLabel}</span>
                            </button>
                          ) : null}
                          {orderAction !== "review" && <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedItem(order)}
                            aria-label={`${t("ui.orders.viewDetails")} ${displayOrderId}`}
                            title={t("ui.orders.viewDetails")}
                            className="size-9 shrink-0 rounded-lg border border-border text-muted-foreground hover:border-primary/30 hover:bg-secondary hover:text-primary"
                          >
                            <Eye size={15} aria-hidden="true" />
                          </Button>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
            <SharedPagination
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.total}
              pageSize={pagination.pageSize}
              onPageChange={(page) => {
                setPagination((current) => ({ ...current, page }));
                loadOrders(page);
              }} className="mt-0 border-t border-border px-4 py-3" />
          </>
        )}
      </section>

      {selectedItem && (
        <CenteredDetailModal
          eyebrow={t('ui.orders.orderDetails')}
          title={selectedItem.display_id || `#${selectedItem.id.slice(0, 8)}`}
          closeLabel={t("ui.orders.close")}
          onClose={() => setSelectedItem(null)}
          size="lg"
        >
            <div className="mt-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-gray-50 dark:bg-muted/50 p-4">
                  <p className="text-xs text-gray-500 dark:text-muted-foreground">
                    {t('ui.orders.customerColumn')}
                  </p>
                  <p className="mt-1 font-semibold text-gray-900 dark:text-foreground">
                    {customerFor(selectedItem).full_name ||
                      t("ui.orders.guest")}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-muted-foreground">
                    {customerFor(selectedItem).email || t("ui.orders.noEmail")}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-muted/50 p-4">
                  <p className="text-xs text-gray-500 dark:text-muted-foreground">
                    {t("ui.orders.totalYourItems")}
                  </p>
                  <p className="mt-1 font-semibold text-gray-900 dark:text-foreground">
                    {formatMYR(Number(selectedItem.vendor_total))}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3 rounded-xl border border-gray-100 dark:border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-gray-500 dark:text-muted-foreground text-sm">
                  {t("ui.orders.overallFulfilment")}
                </span>
                <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                  <StatusBadge status={selectedItem.vendor_fulfil_status} />
                  {selectedOrderAction && selectedOrderAction !== "review" ? (
                    <button
                      type="button"
                      onClick={() =>
                        requestOrderAction(selectedItem, selectedOrderAction)
                      }
                      className="inline-flex min-w-[13rem] flex-none items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                    >
                      {selectedOrderAction === "ready" ? (
                        <Check size={15} aria-hidden="true" />
                      ) : (
                        <PackageCheck size={15} aria-hidden="true" />
                      )}{" "}
                      {selectedOrderAction === "ready"
                        ? t("ui.orders.markOrderReady")
                        : t("ui.orders.fulfilOrder")}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-foreground">
                {t("ui.orders.orderItems")}
              </h3>
              <div className="space-y-3">
                {selectedItem.vendor_items.map((item) => {
                  const itemAction = getItemFulfilmentAction(
                    selectedItem.status,
                    item.fulfil_status,
                  );
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 rounded-xl border border-gray-100 dark:border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <CompactThumbnail
                          src={imageFor(item)}
                          alt={item.product_name}
                          kind="product"
                        />
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-foreground">
                            {item.quantity}× {item.product_name}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">
                            {item.variant_name || t("ui.orders.standard")} ·{" "}
                            {item.outlets?.name}
                          </p>
                          {item.food_fulfilment_mode && (
                            <p className="mt-1 text-xs font-semibold text-primary">
                              {t("ui.orders.foodServiceMode", {
                                service: t("ui.orders.foodService"),
                                mode: item.food_fulfilment_mode === "dine_in"
                                  ? t("ui.scanner.customerFoodMode.dine_in")
                                  : t("ui.scanner.customerFoodMode.takeaway"),
                              })}
                            </p>
                          )}
                          {item.food_fulfilment_mode === "dine_in" && item.food_qr_scanned_at && (
                            <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">{t("ui.orders.dineInArrivalConfirmed")}</p>
                          )}
                          {categorySlugFor(item) === "accommodation" && item.stay_details && (
                            <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-3 text-xs text-foreground">
                              <p className="font-semibold">{t("ui.orders.stayDetails")}</p>
                              <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                                <div><dt className="text-muted-foreground">{t("ui.orders.primaryGuest")}</dt><dd className="font-medium">{item.stay_details.primaryGuestName}</dd></div>
                                <div><dt className="text-muted-foreground">{t("ui.orders.adults")}</dt><dd className="font-medium">{item.stay_details.adults}</dd></div>
                                <div><dt className="text-muted-foreground">{t("ui.orders.estimatedArrival")}</dt><dd className="font-medium">{t(`ui.orders.arrivalLabels.${item.stay_details.estimatedArrival}`)}</dd></div>
                                {item.stay_details.additionalGuestNames?.length ? <div><dt className="text-muted-foreground">{t("ui.orders.additionalGuests")}</dt><dd className="font-medium">{item.stay_details.additionalGuestNames.join(", ")}</dd></div> : null}
                                {item.stay_details.specialRequest ? <div className="sm:col-span-2"><dt className="text-muted-foreground">{t("ui.orders.specialRequest")}</dt><dd className="whitespace-pre-wrap font-medium">{item.stay_details.specialRequest}</dd></div> : null}
                              </dl>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={item.fulfil_status} />
                        {itemAction && selectedOrderAction === "review" && (
                          <button
                            type="button"
                            onClick={() =>
                              requestItemAction(selectedItem, item, itemAction)
                            }
                            aria-label={
                              itemAction === "ready"
                                ? t("ui.orders.markReady")
                                : t("ui.orders.fulfil")
                            }
                            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-primary px-2.5 py-2 text-xs font-semibold text-white hover:bg-primary/90"
                          >
                            {itemAction === "ready" ? (
                              <Check size={14} aria-hidden="true" />
                            ) : (
                              <PackageCheck size={14} aria-hidden="true" />
                            )}
                            <span>
                              {itemAction === "ready"
                                ? t("ui.orders.markReady")
                                : t("ui.orders.fulfil")}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {selectedOrderAction === "review" && (
              <p className="mt-5 rounded-xl bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-xs font-semibold leading-5 text-amber-800 dark:text-amber-200">
                {t("ui.orders.mixedOrderHint")}
              </p>
            )}
        </CenteredDetailModal>
      )}

      <ActionConfirmationDialog
        open={Boolean(pendingConfirmation)}
        title={confirmationTitle}
        description={confirmationDescription}
        confirmLabel={confirmationLabel}
        busy={confirmationBusy}
        onCancel={() => {
          if (!confirmationBusy) setPendingConfirmation(null);
        }}
        onConfirm={() => void confirmRequestedAction()}
      />
    </div>
  );
}
