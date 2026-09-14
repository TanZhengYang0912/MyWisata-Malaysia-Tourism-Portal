"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Download,
  Eye,
  PackageCheck,
  Search,
  SlidersHorizontal,
  ShoppingBag,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { StatusBadge } from "@/components/ui/badge";
import CompactThumbnail from "@/components/vendor/compact-thumbnail";
import PaginationControls from "@/components/vendor/pagination-controls";
import BatchActionBar from "@/components/vendor/batch-action-bar";
import ActionConfirmationDialog from "@/components/vendor/action-confirmation-dialog";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { useDebounce } from "@/hooks/use-debounce";
import { exportToCsv, type CsvColumn } from "@/lib/export-csv";
import { productImageUrl } from "@/lib/storage/product-image";
import { formatMYR } from "@/lib/i18n/format";
import { getMalaysiaDateRangeDefaults } from "@/lib/datetime/date-input";
import CenteredDetailModal from "@/components/ui/centered-detail-modal";
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
  created_at: string;
  outlets?: { id?: string; name?: string; city?: string; state?: string };
  products?:
    { cover_url?: string | null } | Array<{ cover_url?: string | null }>;
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

export default function VendorOrdersPage() {
  const { t } = useTranslation("vendor");
  const { user } = useAuth();
  const { showFeedback } = useActionFeedback();
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

  function primeDateRange() {
    const defaults = getMalaysiaDateRangeDefaults();
    setDraftFilters((current) => ({ ...current, from: current.from || defaults.from, to: current.to || defaults.to }));
  }
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
      t,
      vendorId,
    ],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOrders(1);
  }, [loadOrders]);

  const quickFilter =
    filters.fulfilStatus === "pending" || filters.fulfilStatus === "ready"
      ? "attention"
      : filters.fulfilStatus;
  const activeFilterCount = [
    filters.fulfilStatus,
    filters.orderStatus,
    filters.from,
    filters.to,
  ].filter(Boolean).length;
  const hasFilters = Boolean(filters.q || activeFilterCount);

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
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <ShoppingBag size={15} aria-hidden="true" />{" "}
            {t("ui.orders.fulfilmentDesk")}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-950">
            {t("ui.orders.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t("ui.orders.description")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportOrders}
          disabled={loading || items.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40"
        >
          <Download size={16} aria-hidden="true" /> {t("actions.exportCsv")}
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{t("ui.orders.needsAttention")}</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{stats.attention}</p>
          <p className="mt-1 text-xs text-gray-400">{t("ui.bookings.currentFilter")}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{t("ui.orders.markReady")}</p>
          <p className="mt-1 text-2xl font-bold text-gray-950">{stats.ready}</p>
          <p className="mt-1 text-xs text-gray-400">{t("ui.bookings.currentFilter")}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{t("ui.orders.completed")}</p>
          <p className="mt-1 text-2xl font-bold text-primary">{stats.fulfilled}</p>
          <p className="mt-1 text-xs text-gray-400">{t("ui.bookings.currentFilter")}</p>
        </div>
        <div className="rounded-2xl border border-primary/10 bg-secondary p-4 shadow-sm">
          <p className="text-xs text-primary">{t("ui.dashboard.totalRevenue")}</p>
          <p className="mt-1 text-2xl font-bold text-primary">{formatMYR(stats.totalSales)}</p>
          <p className="mt-1 text-xs text-primary">{t("ui.bookings.currentFilter")}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1">
          {[
            { value: "", label: t("ui.orders.allOrders") },
            { value: "attention", label: t("ui.orders.needsAttention") },
            { value: "fulfilled", label: t("ui.orders.completed") },
            { value: "cancelled", label: t("ui.status.cancelled") },
          ].map((filter) => (
            <button
              key={filter.value || "all"}
              type="button"
              onClick={() => applyQuickFilter(filter.value)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${quickFilter === filter.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"}`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={15}
              aria-hidden="true"
            />
            <input
              value={filters.q}
              onChange={(event) => {
                const q = event.target.value;
                setFilters((current) => ({ ...current, q }));
                setDraftFilters((current) => ({ ...current, q }));
              }}
              placeholder={t("ui.orders.searchPlaceholder")}
              aria-label={t("ui.orders.searchPlaceholder")}
              className="h-10 w-full rounded-xl border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setDraftFilters(filters);
              setFiltersOpen((open) => !open);
            }}
            aria-expanded={filtersOpen}
            aria-controls="order-filters"
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${filtersOpen || activeFilterCount ? "border-primary bg-secondary text-primary" : "border-gray-200 text-gray-600 hover:border-primary/40 hover:text-primary"}`}
          >
            <SlidersHorizontal size={15} aria-hidden="true" />
            {t("ui.orders.filters")}
            {activeFilterCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {filtersOpen && (
          <div
            id="order-filters"
            className="rounded-xl border border-gray-100 bg-gray-50/70 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {t("ui.orders.advancedFilters")}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {t("ui.orders.advancedFiltersDescription")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                aria-label={t("ui.orders.closeFilters")}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-white hover:text-gray-700"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-gray-600">
                {t("ui.orders.fulfilmentStatus")}
                <select
                  value={draftFilters.fulfilStatus}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      fulfilStatus: event.target.value,
                    }))
                  }
                  className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-normal text-gray-700 outline-none focus:border-primary"
                >
                  <option value="">{t("ui.orders.allItems")}</option>
                  <option value="attention">
                    {t("ui.orders.needsAttention")}
                  </option>
                  {FULFILMENT_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {t(`ui.status.${status}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-gray-600">
                {t("ui.orders.orderStatusFilter")}
                <select
                  value={draftFilters.orderStatus}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      orderStatus: event.target.value,
                    }))
                  }
                  className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-normal text-gray-700 outline-none focus:border-primary"
                >
                  <option value="">{t("ui.orders.allOrderStates")}</option>
                  {ORDER_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {t(`ui.status.${status}`)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sm:col-span-2">
                <p className="mb-1.5 text-xs font-semibold text-gray-600">
                  {t("ui.orders.dateRange")}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3">
                    <span className="shrink-0 text-xs text-gray-400">
                      {t("ui.orders.fromDate")}
                    </span>
                    <input
                      type="date"
                      value={draftFilters.from}
                      onFocus={primeDateRange}
                      onChange={(event) =>
                        setDraftFilters((current) => ({
                          ...current,
                          from: event.target.value,
                        }))
                      }
                      aria-label={t("ui.orders.fromDate")}
                      className="h-10 min-w-0 flex-1 bg-transparent text-sm text-gray-700 outline-none"
                    />
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3">
                    <span className="shrink-0 text-xs text-gray-400">
                      {t("ui.orders.toDate")}
                    </span>
                    <input
                      type="date"
                      value={draftFilters.to}
                      onFocus={primeDateRange}
                      onChange={(event) =>
                        setDraftFilters((current) => ({
                          ...current,
                          to: event.target.value,
                        }))
                      }
                      aria-label={t("ui.orders.toDate")}
                      className="h-10 min-w-0 flex-1 bg-transparent text-sm text-gray-700 outline-none"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-3">
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-white hover:text-gray-900"
              >
                {t("ui.common.clearFilters")}
              </button>
              <button
                type="button"
                onClick={applyAdvancedFilters}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90"
              >
                {t("ui.orders.applyFilters")}
              </button>
            </div>
          </div>
        )}

        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-500">
              {t("ui.orders.activeFilters")}
            </span>
            {filters.q && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                {t("ui.orders.searchFilter")}: {filters.q}
              </span>
            )}
            {filters.fulfilStatus && (
              <button
                type="button"
                onClick={() => applyQuickFilter("")}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary"
              >
                {filters.fulfilStatus === "attention"
                  ? t("ui.orders.needsAttention")
                  : t(`ui.status.${filters.fulfilStatus}`)}
                <X size={12} aria-hidden="true" />
              </button>
            )}
            {filters.orderStatus && (
              <button
                type="button"
                onClick={() => {
                  const nextFilters = { ...filters, orderStatus: "" };
                  setFilters(nextFilters);
                  setDraftFilters(nextFilters);
                  clearSelectionAfterFilterChange();
                }}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary"
              >
                {t(`ui.status.${filters.orderStatus}`)}
                <X size={12} aria-hidden="true" />
              </button>
            )}
            {(filters.from || filters.to) && (
              <button
                type="button"
                onClick={() => {
                  const nextFilters = { ...filters, from: "", to: "" };
                  setFilters(nextFilters);
                  setDraftFilters(nextFilters);
                  clearSelectionAfterFilterChange();
                }}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary"
              >
                {filters.from || "…"} – {filters.to || "…"}
                <X size={12} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {t("ui.common.clearFilters")}
            </button>
          </div>
        )}
      </div>

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
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-16 animate-pulse rounded-xl bg-gray-100"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-gray-400">
            <PackageCheck
              className="mx-auto mb-3 opacity-30"
              size={34}
              aria-hidden="true"
            />
            <p>{t("ui.orders.noMatches")}</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 text-xs text-gray-500">
              <label className="inline-flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={
                    items.length > 0 &&
                    items.every((order) => selectedIds.includes(order.id))
                  }
                  onChange={(event) =>
                    setSelectedIds(
                      event.target.checked
                        ? items.map((order) => order.id)
                        : [],
                    )
                  }
                />{" "}
                {t('ui.orders.selectCurrentPage')}
              </label>
              <span>
                {t("ui.orders.pageSummary", {
                  count: pagination.total.toLocaleString(),
                  perPage: 10,
                })}
              </span>
            </div>
            <div className="overflow-x-auto">
              <div className="xl:min-w-[1000px]">
                <div className="hidden grid-cols-[32px_minmax(120px,1.2fr)_minmax(170px,1.5fr)_minmax(100px,1fr)_90px_100px_230px] gap-4 border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 xl:grid">
                  <span></span>
                  <span>{t('ui.orders.customerColumn')}</span>
                  <span>{t("ui.orders.itemsColumn")}</span>
                  <span>{t("ui.orders.outletColumn")}</span>
                  <span>{t("ui.orders.totalColumn")}</span>
                  <span>{t("ui.orders.statusColumn")}</span>
                  <span className="text-center">
                    {t("ui.orders.actionColumn")}
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {items.map((order) => {
                    const customer = customerFor(order);
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
                        className="grid gap-3 px-4 py-4 transition hover:bg-secondary/30 xl:grid-cols-[32px_minmax(120px,1.2fr)_minmax(170px,1.5fr)_minmax(100px,1fr)_90px_100px_230px] xl:items-center xl:gap-4 xl:px-5"
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
                          <p className="truncate font-medium text-gray-800">
                            {customer.full_name || t("ui.orders.guest")}
                          </p>
                          <p className="mt-1 truncate text-xs text-gray-500">
                            {order.display_id || `#${order.id.slice(0, 8)}`}
                          </p>
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
                              <span className="ml-1 text-xs font-medium text-gray-400">
                                +{order.vendor_items.length - 2}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => setSelectedItem(order)}
                              className="block max-w-full truncate text-left font-semibold text-gray-900 hover:text-primary"
                            >
                              {t("ui.orders.itemCount", {
                                count: order.vendor_items.length,
                              })}
                            </button>
                            <p className="mt-1 truncate text-xs text-gray-500">
                              {order.product_summary}
                            </p>
                          </div>
                        </div>
                        <p className="pl-[4.25rem] text-xs text-gray-600 xl:pl-0">
                          {order.outlets_summary}
                        </p>
                        <p className="pl-[4.25rem] text-sm font-semibold text-gray-900 xl:pl-0">
                          {formatMYR(Number(order.vendor_total))}
                        </p>
                        <div className="pl-[4.25rem] xl:pl-0">
                          <StatusBadge status={order.vendor_fulfil_status} />
                          <span className="mt-1 block text-[11px] text-gray-400">
                            {t("ui.orders.orderStatus", {
                              status: order.status || t("ui.orders.unknown"),
                            })}
                          </span>
                        </div>
                        <div className="flex w-full max-w-[14rem] flex-col items-stretch justify-self-center gap-2 border-t border-gray-100 pt-3 xl:border-0 xl:pt-0">
                          <button
                            type="button"
                            onClick={() => setSelectedItem(order)}
                            aria-label={
                              orderAction === "review"
                                ? t("ui.orders.reviewItems")
                                : t("ui.orders.viewDetails")
                            }
                            className="inline-flex min-h-10 w-full shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-semibold text-gray-600 hover:border-primary/30 hover:bg-gray-50 hover:text-primary"
                          >
                            <Eye size={15} aria-hidden="true" />
                            <span>{t("ui.orders.viewDetails")}</span>
                          </button>
                          {orderAction && (
                            <button
                              type="button"
                              onClick={() =>
                                orderAction === "review"
                                  ? setSelectedItem(order)
                                  : requestOrderAction(order, orderAction)
                              }
                              aria-label={actionLabel}
                              className="inline-flex min-h-10 w-full shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-primary px-2.5 py-2 text-xs font-semibold text-white hover:bg-primary/90"
                            >
                              {orderAction === "ready" ? (
                                <Check size={15} aria-hidden="true" />
                              ) : (
                                <PackageCheck size={15} aria-hidden="true" />
                              )}
                              <span>{actionLabel}</span>
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
            <PaginationControls
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              pageSize={pagination.pageSize}
              onPageChange={(page) => {
                setPagination((current) => ({ ...current, page }));
                loadOrders(page);
              }}
            />
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
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">
                    {t('ui.orders.customerColumn')}
                  </p>
                  <p className="mt-1 font-semibold text-gray-900">
                    {customerFor(selectedItem).full_name ||
                      t("ui.orders.guest")}
                  </p>
                  <p className="text-xs text-gray-500">
                    {customerFor(selectedItem).email || t("ui.orders.noEmail")}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">
                    {t("ui.orders.totalYourItems")}
                  </p>
                  <p className="mt-1 font-semibold text-gray-900">
                    {formatMYR(Number(selectedItem.vendor_total))}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-gray-100 p-4">
                <span className="text-gray-500 text-sm">
                  {t("ui.orders.overallFulfilment")}
                </span>
                <StatusBadge status={selectedItem.vendor_fulfil_status} />
              </div>
            </div>
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">
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
                      className="flex flex-col gap-3 rounded-xl border border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <CompactThumbnail
                          src={imageFor(item)}
                          alt={item.product_name}
                          kind="product"
                        />
                        <div>
                          <p className="font-semibold text-gray-900">
                            {item.quantity}× {item.product_name}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {item.variant_name || t("ui.orders.standard")} ·{" "}
                            {item.outlets?.name}
                          </p>
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
              <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-800">
                {t("ui.orders.mixedOrderHint")}
              </p>
            )}
            <div className="mt-7 flex flex-wrap justify-center gap-2">
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
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600"
              >
                {t("ui.orders.close")}
              </button>
            </div>
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
