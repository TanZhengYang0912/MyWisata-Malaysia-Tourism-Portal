"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  Check,
  ChevronRight,
  CirclePlus,
  Clock3,
  Download,
  Eye,
  MapPin,
  Save,
  ScanLine,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { StatusBadge } from "@/components/ui/badge";
import SlotForm from "@/components/vendor/slot-form";
import PaginationControls from "@/components/vendor/pagination-controls";
import BatchActionBar from "@/components/vendor/batch-action-bar";
import CompactThumbnail from "@/components/vendor/compact-thumbnail";
import {
  outletLocation,
  outletShortName,
  outletIdLabel,
} from "@/lib/outlet-display";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { useAppDialog } from "@/components/providers/app-dialog";
import { selectBookingOutlet } from "@/lib/vendor/booking-scope";
import { useDebounce } from "@/hooks/use-debounce";
import { exportToCsv, type CsvColumn } from "@/lib/export-csv";
import { productImageUrl } from "@/lib/storage/product-image";
import { formatMYR } from "@/lib/i18n/format";
import { getBookingSlotAvailability } from "@/lib/customer/booking-slot-presenter";
import {
  getMalaysiaDateInputValue,
  getMalaysiaDateRangeDefaults,
  getMalaysiaDateShortcutDates,
  type MalaysiaDateShortcut,
} from "@/lib/datetime/date-input";

type Tab = "reservations" | "operating-hours";
type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type DaySchedule = {
  open?: string;
  close?: string;
  closed?: boolean;
  note?: string;
};
type DateException = {
  date: string;
  open?: string;
  close?: string;
  closed?: boolean;
  note?: string;
};
type OperatingHours = Record<string, DaySchedule>;
interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
interface Outlet {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  status: string;
  operating_hours?: OperatingHours | null;
}
interface Product {
  id: string;
  name: string;
  outlet_id: string;
  status: string;
  requires_booking: boolean;
  cover_url?: string | null;
}
interface Booking {
  id: string;
  display_id?: string;
  status: string;
  created_at: string;
  check_in_at?: string | null;
  customer?: { full_name?: string; email?: string };
  orderItem?: {
    product_name?: string;
    quantity?: number;
    line_total?: number;
    outlets?: { id?: string; name?: string; city?: string; state?: string };
  };
  slot?: {
    starts_at?: string;
    ends_at?: string;
    capacity?: number;
    booked?: number;
    outlets?: { id?: string; name?: string; city?: string; state?: string };
    products?: {
      name?: string;
      cover_url?: string | null;
      base_price?: number;
    };
  };
}
interface Slot {
  id: string;
  product_id: string;
  outlet_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked: number;
  price_override: number | null;
  status: string;
  products?: { name?: string; base_price?: number; cover_url?: string | null };
  outlets?: { id?: string; name?: string; city?: string; state?: string };
}

const emptyPagination = { page: 1, pageSize: 10, total: 0, totalPages: 1 };
const dayLabels: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function dateLabel(
  value: string | undefined,
  locale: string,
  fallback: string,
) {
  return value
    ? new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : fallback;
}
function outletLabel(outlet: Outlet | null | undefined, fallback: string) {
  return outlet
    ? `${outletShortName(outlet.name)} · ${outletLocation(outlet.city, outlet.state)}`
    : fallback;
}
function scheduleFor(outlet?: Outlet | null): Record<DayKey, DaySchedule> {
  return dayLabels.reduce(
    (result, day) => {
      result[day] = {
        open: outlet?.operating_hours?.[day]?.open || "09:00",
        close: outlet?.operating_hours?.[day]?.close || "18:00",
        closed: Boolean(outlet?.operating_hours?.[day]?.closed),
        note: outlet?.operating_hours?.[day]?.note || "",
      };
      return result;
    },
    {} as Record<DayKey, DaySchedule>,
  );
}
function exceptionEntries(outlet?: Outlet | null) {
  return Object.entries(outlet?.operating_hours || {})
    .filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key))
    .map(([date, value]) => ({ date, ...value }));
}

function slotReference(slot: Slot): string {
  const datePart = /^\d{4}-\d{2}-\d{2}/.test(slot.starts_at)
    ? slot.starts_at.slice(0, 10).replaceAll("-", "")
    : "UNDATED";
  const suffix = slot.id.replaceAll("-", "").slice(-4).toUpperCase();
  return `SLT-${datePart}-${suffix}`;
}

function getSlotDisplayStatus(slot: Slot): string {
  if (slot.status === "cancelled") return slot.status;

  const availability = getBookingSlotAvailability({
    id: slot.id,
    activityId: slot.product_id,
    startsAt: slot.starts_at,
    endsAt: slot.ends_at,
    capacity: slot.capacity,
    booked: slot.booked,
    status: slot.status,
  });

  if (availability === "available" || availability === "full") {
    return availability;
  }

  return "expired";
}

function scheduleSignature(schedule: Record<DayKey, DaySchedule>): string {
  return dayLabels
    .map((day) => {
      const value = schedule[day] || {};
      return [
        day,
        value.open || "09:00",
        value.close || "18:00",
        Boolean(value.closed),
      ].join(":");
    })
    .join("|");
}

function exceptionSignature(exceptions: DateException[]): string {
  return exceptions
    .map((exception) =>
      [
        exception.date,
        exception.open || "09:00",
        exception.close || "18:00",
        Boolean(exception.closed),
        exception.note || "",
      ].join(":"),
    )
    .sort()
    .join("|");
}

async function loadScopedItems<T>(
  endpoint: string,
  errorMessage: string,
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page += 1) {
    const separator = endpoint.includes("?") ? "&" : "?";
    const response = await fetch(
      `${endpoint}${separator}page=${page}&pageSize=24`,
      { cache: "no-store" },
    );
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || errorMessage);
    const pageItems = (payload.data?.items || []) as T[];
    items.push(...pageItems);
    if (page >= Number(payload.data?.pagination?.totalPages || 1)) return items;
  }
}

function loadScopedProducts(vendorId: string, errorMessage: string) {
  return loadScopedItems<Product>(
    `/api/vendors/${vendorId}/products?view=booking_metadata&sort=name`,
    errorMessage,
  );
}

export default function VendorBookingsPage() {
  const { t, i18n } = useTranslation("vendor");
  const locale = i18n.resolvedLanguage || i18n.language;
  const { user, isOutletManager } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showFeedback } = useActionFeedback();
  const { confirm } = useAppDialog();
  const vendorId = user?.activeVendorId;
  const [tab, setTab] = useState<Tab>("reservations");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<Pagination>(emptyPagination);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState({
    q: "",
    status: "",
    from: "",
    to: "",
    outletId: "",
    productId: "",
  });
  const [scheduleOutletId, setScheduleOutletId] = useState("");
  const [scheduleDraft, setScheduleDraft] =
    useState<Record<DayKey, DaySchedule>>(scheduleFor());
  const [exceptions, setExceptions] = useState<DateException[]>([]);
  const [loading, setLoading] = useState(true);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showSlotForm, setShowSlotForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMessage, setBatchMessage] = useState("");

  useEffect(() => {
    if (searchParams.get("create") !== "1" || !user) return;

    setShowSlotForm(true);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("create");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, router, searchParams, user]);

  function primeDateRange() {
    const defaults = getMalaysiaDateRangeDefaults();
    setFilters((current) => ({
      ...current,
      from: current.from || defaults.from,
      to: current.to || defaults.to,
    }));
  }

  const selectedScheduleOutlet =
    outlets.find((outlet) => outlet.id === scheduleOutletId) || outlets[0];
  const selectedOutletProducts = products.filter(
    (product) =>
      product.outlet_id === (selectedScheduleOutlet?.id || "") &&
      product.requires_booking &&
      product.status === "active",
  );
  const filteredProducts = filters.outletId
    ? products.filter(
        (product) =>
          product.outlet_id === filters.outletId && product.requires_booking,
      )
    : products.filter((product) => product.requires_booking);

  useEffect(() => {
    if (!vendorId) return;
    setMetadataLoading(true);
    Promise.all([
      loadScopedItems<Outlet>(
        `/api/vendors/${vendorId}/outlets?view=booking_metadata&sort=name`,
        t("ui.bookings.loadOutletsFailed"),
      ),
      loadScopedProducts(vendorId, t("ui.bookings.loadSetupFailed")),
    ])
      .then(([outletItems, productItems]) => {
        setOutlets(
          outletItems.map((outlet) => ({
            ...outlet,
            name: `${outletShortName(outlet.name)} · ${outletIdLabel(outlet.id)}`,
          })),
        );
        setProducts(productItems);
        setScheduleOutletId((current) => current || outletItems[0]?.id || "");
      })
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : t("ui.bookings.loadSetupFailed"),
        ),
      )
      .finally(() => setMetadataLoading(false));
  }, [t, vendorId]);

  useEffect(() => {
    setScheduleDraft(scheduleFor(selectedScheduleOutlet));
    setExceptions(exceptionEntries(selectedScheduleOutlet));
  }, [selectedScheduleOutlet]);

  const debouncedQ = useDebounce(filters.q, 300);

  const loadData = useCallback(
    async (requestedPage = 1) => {
      if (!vendorId) return;
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        page: String(requestedPage),
        pageSize: "10",
        q: debouncedQ,
        status: filters.status,
        from: filters.from,
        to: filters.to,
      });
      if (filters.outletId) params.set("outletId", filters.outletId);
      if (filters.productId) params.set("productId", filters.productId);
      const endpoint = tab === "reservations" ? "bookings" : "slots";
      try {
        const response = await fetch(
          `/api/vendors/${vendorId}/${endpoint}?${params}`,
          { cache: "no-store" },
        );
        const payload = await response.json();
        if (!response.ok)
          throw new Error(
            payload.error?.message || t("ui.bookings.loadFailed"),
          );
        setPagination(payload.data?.pagination || emptyPagination);
        if (tab === "reservations") {
          setBookings(payload.data?.items || []);
          setStats(payload.data?.stats || {});
        } else setSlots(payload.data?.items || []);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : t("ui.bookings.loadFailed"),
        );
      } finally {
        setLoading(false);
      }
    },
    [
      debouncedQ,
      filters.status,
      filters.from,
      filters.to,
      filters.outletId,
      filters.productId,
      tab,
      t,
      vendorId,
    ],
  );

  useEffect(() => {
    void loadData(1);
  }, [loadData]);

  function handleExportBookings() {
    if (!bookings.length) return;
    const columns: CsvColumn<Booking>[] = [
      { header: "Reference", accessor: (b) => b.display_id || b.id },
      { header: "Customer", accessor: (b) => b.customer?.full_name || "Guest" },
      { header: "Email", accessor: (b) => b.customer?.email || "" },
      {
        header: "Product / Experience",
        accessor: (b) =>
          b.slot?.products?.name || b.orderItem?.product_name || "",
      },
      {
        header: "Date & Time",
        accessor: (b) =>
          b.slot?.starts_at ? new Date(b.slot.starts_at).toLocaleString() : "",
      },
      { header: "Quantity", accessor: (b) => b.orderItem?.quantity ?? 1 },
      { header: "Status", accessor: (b) => b.status },
      {
        header: "Check In Time",
        accessor: (b) =>
          b.check_in_at ? new Date(b.check_in_at).toLocaleString() : "",
      },
    ];
    exportToCsv(
      `bookings-${new Date().toISOString().split("T")[0]}`,
      columns,
      bookings,
    );
  }

  async function checkIn(bookingId: string) {
    if (!vendorId) return;
    try {
      const response = await fetch(
        `/api/vendors/${vendorId}/bookings/${bookingId}/checkin`,
        { method: "POST" },
      );
      if (!response.ok) {
        const payload = await response.json();
        const message =
          payload.error?.message || t("ui.bookings.checkInFailed");
        setError(message);
        showFeedback("error", message);
        return;
      }
      showFeedback("success", t("ui.bookings.checkedIn"));
      setSelectedBooking(null);
      loadData(pagination.page);
    } catch {
      setError(t("ui.bookings.checkInFailed"));
      showFeedback("error", t("ui.bookings.checkInTryAgain"));
    }
  }
  async function cancelSlot(slotId: string) {
    if (!vendorId || !(await confirm(t("ui.bookings.cancelSlotConfirm"))))
      return;
    try {
      const response = await fetch(`/api/vendors/${vendorId}/slots/${slotId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json();
        const message =
          payload.error?.message || t("ui.bookings.cancelSlotFailed");
        setError(message);
        showFeedback("error", message);
        return;
      }
      showFeedback("success", t("ui.bookings.slotCancelled"));
      loadData(pagination.page);
    } catch {
      setError(t("ui.bookings.cancelSlotFailed"));
      showFeedback("error", t("ui.bookings.cancelSlotTryAgain"));
    }
  }
  async function saveSchedule() {
    if (!isOutletManager || !vendorId || !selectedScheduleOutlet) return;
    setSavingSchedule(true);
    setSaveMessage("");
    setError("");
    const operatingHours: OperatingHours = { ...scheduleDraft };
    exceptions
      .filter((exception) => exception.date)
      .forEach((exception) => {
        operatingHours[exception.date] = {
          open: exception.open || "09:00",
          close: exception.close || "18:00",
          closed: Boolean(exception.closed),
          note: exception.note || "",
        };
      });
    try {
      const response = await fetch(
        `/api/vendors/${vendorId}/outlets/${selectedScheduleOutlet.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operatingHours }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload.error?.message || t("ui.bookings.saveHoursFailed"),
        );
      const persistedOperatingHours = payload.data?.operating_hours as
        OperatingHours | undefined;
      if (!persistedOperatingHours)
        throw new Error(t("ui.bookings.savedHoursMissing"));
      setOutlets((current) =>
        current.map((outlet) =>
          outlet.id === selectedScheduleOutlet.id
            ? { ...outlet, operating_hours: persistedOperatingHours }
            : outlet,
        ),
      );
      setSaveMessage(t("ui.bookings.hoursSaved"));
      showFeedback("success", t("ui.bookings.hoursSaved"));
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : t("ui.bookings.saveHoursFailed");
      setError(message);
      showFeedback("error", message);
    } finally {
      setSavingSchedule(false);
    }
  }
  function clearFilters() {
    setFilters({
      q: "",
      status: "",
      from: "",
      to: "",
      outletId: "",
      productId: "",
    });
    setSelectedIds([]);
    setAllFilteredSelected(false);
  }
  function toggleSelected(id: string) {
    setAllFilteredSelected(false);
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  async function applyBatch(action: string) {
    if (!vendorId) return;
    setBatchBusy(true);
    setBatchMessage("");
    const entity = tab === "reservations" ? "bookings" : "slots";
    const response = await fetch(`/api/vendors/${vendorId}/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity,
        action,
        ids: selectedIds,
        selectAllFiltered: allFilteredSelected,
        filters,
      }),
    });
    const payload = await response.json();
    setBatchBusy(false);
    if (!response.ok) {
      setError(payload.error?.message || t("ui.common.batchFailed"));
      return;
    }
    setBatchMessage(
      payload.data?.skipped
        ? t("ui.bookings.batchSummarySkipped", {
            updated: payload.data.updated,
            skipped: payload.data.skipped,
          })
        : t("ui.bookings.batchSummary", {
            count: payload.data?.updated || 0,
            entity: t(`ui.bookings.entities.${entity}`),
          }),
    );
    setSelectedIds([]);
    setAllFilteredSelected(false);
    loadData(1);
  }

  function switchTab(nextTab: Tab) {
    setTab(nextTab);
    setPagination(emptyPagination);
    setSelectedIds([]);
    setAllFilteredSelected(false);
    setBatchMessage("");
    setFilters((current) => ({ ...current, status: "", q: "" }));
  }
  function setOutletFilter(outletId: string) {
    setFilters((current) => ({ ...current, outletId, productId: "" }));
    if (tab === "operating-hours" && outletId) setScheduleOutletId(outletId);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <CalendarDays size={15} /> {t("ui.bookings.bookingOperations")}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-950">
            {t("ui.bookings.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            {t("ui.bookings.description")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isOutletManager && (
            <Link
              href="/vendor/scanner"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-secondary px-3.5 py-2.5 text-sm font-semibold text-primary shadow-sm hover:bg-secondary/80"
            >
              <ScanLine size={16} /> {t("ui.bookings.openScanner")}
            </Link>
          )}
          {tab === "reservations" && (
            <button
              type="button"
              onClick={handleExportBookings}
              disabled={loading || bookings.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40"
            >
              <Download size={16} /> {t("actions.exportCsv")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSlotForm(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90"
          >
            <CirclePlus size={17} /> {t("ui.bookings.addSlot")}
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{t("ui.status.confirmed")}</p>
          <p className="mt-1 text-2xl font-bold text-gray-950">
            {stats.confirmed || 0}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {t("ui.bookings.currentFilter")}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{t("ui.status.checked_in")}</p>
          <p className="mt-1 text-2xl font-bold text-primary">
            {stats.checked_in || 0}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {t("ui.bookings.currentFilter")}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{t("ui.status.cancelled")}</p>
          <p className="mt-1 text-2xl font-bold text-gray-950">
            {stats.cancelled || 0}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {t("ui.bookings.currentFilter")}
          </p>
        </div>
        <div className="rounded-2xl border border-primary/10 bg-secondary p-4 shadow-sm">
          <p className="text-xs text-primary">
            {t("ui.bookings.outletsManaged")}
          </p>
          <p className="mt-1 text-2xl font-bold text-primary">
            {outlets.length}
          </p>
          <p className="mt-1 text-xs text-primary">
            {t("ui.bookings.allVendorOutlets")}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-xl bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => switchTab("reservations")}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === "reservations" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              <Users size={15} /> {t("ui.bookings.reservations")}
            </button>
            <button
              type="button"
              onClick={() => switchTab("operating-hours")}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === "operating-hours" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              <Clock3 size={15} /> {t("ui.bookings.operatingHours")}
            </button>
          </div>

          {tab === "reservations" && (
            <div className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1">
              {[
                { value: "", label: t("ui.orders.allOrders") || "All" },
                { value: "confirmed", label: t("ui.status.confirmed") },
                { value: "checked_in", label: t("ui.status.checked_in") },
                { value: "cancelled", label: t("ui.status.cancelled") },
              ].map((f) => (
                <button
                  key={f.value || "all"}
                  type="button"
                  onClick={() =>
                    setFilters((current) => ({ ...current, status: f.value }))
                  }
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${filters.status === f.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={15}
            />
            <input
              value={filters.q}
              onChange={(event) =>
                setFilters((current) => ({ ...current, q: event.target.value }))
              }
              placeholder={
                tab === "reservations"
                  ? t("ui.bookings.searchPlaceholder")
                  : t("ui.bookings.searchOperatingPlaceholder")
              }
              className="h-10 w-full rounded-xl border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </label>
          <select
            value={filters.outletId}
            onChange={(event) => setOutletFilter(event.target.value)}
            className="h-10 rounded-xl border border-gray-200 px-3 text-sm text-gray-600 outline-none focus:border-primary sm:w-52"
          >
            <option value="">{t("ui.bookings.allOutlets")}</option>
            {outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outletShortName(outlet.name)} ·{" "}
                {outletLocation(outlet.city, outlet.state)}
              </option>
            ))}
          </select>
          {tab === "reservations" && (
            <select
              value={filters.productId}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  productId: event.target.value,
                }))
              }
              className="h-10 rounded-xl border border-gray-200 px-3 text-sm text-gray-600 outline-none focus:border-primary sm:w-48"
            >
              <option value="">{t("ui.bookings.allExperiences")}</option>
              {filteredProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {tab === "reservations" && (
          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
            <SlidersHorizontal size={14} className="text-gray-400" />
            <input
              type="date"
              value={filters.from}
              onFocus={primeDateRange}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  from: event.target.value,
                }))
              }
              className="h-9 rounded-lg border border-gray-200 px-2.5 text-xs text-gray-600"
            />
            <span className="text-xs text-gray-400">{t("ui.bookings.to")}</span>
            <input
              type="date"
              value={filters.to}
              onFocus={primeDateRange}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  to: event.target.value,
                }))
              }
              className="h-9 rounded-lg border border-gray-200 px-2.5 text-xs text-gray-600"
            />
            {(filters.q ||
              filters.status ||
              filters.from ||
              filters.to ||
              filters.outletId ||
              filters.productId) && (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-auto text-xs font-semibold text-primary hover:underline"
              >
                {t("ui.common.clearFilters")}
              </button>
            )}
          </div>
        )}
      </div>

      {tab === "reservations" && (
        <BatchActionBar
          selectedCount={selectedIds.length}
          total={pagination.total}
          allFilteredSelected={allFilteredSelected}
          onSelectAllFiltered={() => {
            setAllFilteredSelected(true);
            setSelectedIds(bookings.map((booking) => booking.id));
          }}
          onClear={() => {
            setSelectedIds([]);
            setAllFilteredSelected(false);
            setBatchMessage("");
          }}
          onApply={applyBatch}
          actions={[
            { value: "check_in", label: t("ui.bookings.checkInSelected") },
            { value: "cancel", label: t("ui.bookings.cancelSelected") },
          ]}
          busy={batchBusy}
          message={batchMessage}
        />
      )}
      {tab === "operating-hours" && (
        <BatchActionBar
          selectedCount={selectedIds.length}
          total={pagination.total}
          allFilteredSelected={allFilteredSelected}
          onSelectAllFiltered={() => {
            setAllFilteredSelected(true);
            setSelectedIds(slots.map((slot) => slot.id));
          }}
          onClear={() => {
            setSelectedIds([]);
            setAllFilteredSelected(false);
            setBatchMessage("");
          }}
          onApply={applyBatch}
          actions={[
            { value: "cancel", label: t("ui.bookings.cancelSelectedSlots") },
            { value: "restore", label: t("ui.bookings.restoreSelectedSlots") },
          ]}
          busy={batchBusy}
          message={batchMessage}
        />
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {tab === "reservations" ? (
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 text-xs text-gray-500">
            <label className="inline-flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                checked={
                  bookings.length > 0 &&
                  bookings.every((booking) => selectedIds.includes(booking.id))
                }
                onChange={(event) =>
                  setSelectedIds(
                    event.target.checked
                      ? bookings.map((booking) => booking.id)
                      : [],
                  )
                }
              />{" "}
              {t("ui.bookings.selectCurrentPage")}
            </label>
            <span>
              {t("ui.bookings.pageSummary", {
                count: pagination.total.toLocaleString(),
                perPage: 10,
              })}
            </span>
          </div>

          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="h-16 animate-pulse rounded-xl bg-gray-100"
                />
              ))}
            </div>
          ) : bookings.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-gray-400">
              <p>{t("ui.bookings.noMatches")}</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-2 text-xs font-semibold text-primary hover:underline"
              >
                {t("ui.common.clearFilters")}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="xl:min-w-[960px]">
                <div className="hidden grid-cols-[32px_minmax(120px,1.2fr)_minmax(170px,1.5fr)_minmax(100px,1fr)_90px_100px_190px] gap-4 border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 xl:grid">
                  <span></span>
                  <span>{t("ui.orders.customerColumn")}</span>
                  <span>{t("ui.orders.itemsColumn")}</span>
                  <span>{t("ui.orders.outletColumn")}</span>
                  <span>{t("ui.orders.totalColumn")}</span>
                  <span>{t("ui.orders.statusColumn")}</span>
                  <span className="text-center">
                    {t("ui.orders.actionColumn")}
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {bookings.map((booking) => {
                    const bookingOutlet = selectBookingOutlet(
                      booking.orderItem?.outlets,
                      booking.slot?.outlets,
                    );
                    const lineTotal = Number(
                      booking.orderItem?.line_total ||
                        booking.slot?.products?.base_price ||
                        0,
                    );
                    return (
                      <article
                        key={booking.id}
                        className="grid gap-3 px-4 py-4 transition hover:bg-secondary/30 xl:grid-cols-[32px_minmax(120px,1.2fr)_minmax(170px,1.5fr)_minmax(100px,1fr)_90px_100px_190px] xl:items-center xl:gap-4 xl:px-5"
                      >
                        <div>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(booking.id)}
                            onChange={() => toggleSelected(booking.id)}
                            aria-label={t("ui.bookings.selectBooking", {
                              id: booking.display_id || booking.id.slice(0, 8),
                            })}
                          />
                        </div>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setSelectedBooking(booking)}
                            className="block max-w-full truncate text-left font-medium text-gray-900 hover:text-primary"
                          >
                            {booking.customer?.full_name ||
                              t("ui.bookings.guest")}
                          </button>
                          <p className="mt-1 truncate font-mono text-xs text-gray-500">
                            {booking.display_id || `#${booking.id.slice(0, 8)}`}
                          </p>
                        </div>
                        <div className="flex min-w-0 items-center gap-3">
                          <CompactThumbnail
                            src={productImageUrl(
                              booking.slot?.products?.cover_url,
                            )}
                            alt={
                              booking.slot?.products?.name ||
                              booking.orderItem?.product_name ||
                              t("ui.bookings.experience")
                            }
                            kind="experience"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">
                              {booking.orderItem?.product_name ||
                                booking.slot?.products?.name ||
                                t("ui.bookings.experience")}
                            </p>
                            <p className="mt-1 truncate text-xs text-gray-500">
                              {t("ui.bookings.quantityDate", {
                                quantity: booking.orderItem?.quantity || 1,
                                date: dateLabel(
                                  booking.slot?.starts_at,
                                  locale,
                                  t("ui.bookings.noTime"),
                                ),
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="text-xs text-gray-600">
                          <p className="truncate font-medium text-gray-800">
                            {outletShortName(bookingOutlet?.name)}
                          </p>
                          <p className="mt-0.5 truncate text-gray-500">
                            {outletLocation(
                              bookingOutlet?.city,
                              bookingOutlet?.state,
                            )}
                          </p>
                          <p className="mt-0.5 font-mono text-[10px] text-gray-400">
                            {outletIdLabel(bookingOutlet?.id)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {lineTotal > 0
                              ? formatMYR(lineTotal)
                              : t("ui.bookings.freeToExplore")}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-400">
                            {booking.orderItem?.quantity || 1}{" "}
                            {t("ui.bookings.guests").toLowerCase()}
                          </p>
                        </div>
                        <div>
                          <StatusBadge status={booking.status} />
                          {booking.check_in_at && (
                            <span className="mt-1 block text-[11px] text-gray-400">
                              {new Intl.DateTimeFormat(locale, {
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(new Date(booking.check_in_at))}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-gray-100 pt-3 xl:border-0 xl:pt-0">
                          <button
                            type="button"
                            onClick={() => setSelectedBooking(booking)}
                            title={t("ui.bookings.viewReservation")}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-semibold text-gray-600 hover:border-primary/30 hover:bg-gray-50 hover:text-primary"
                          >
                            <Eye size={15} aria-hidden="true" />
                            <span>{t("ui.orders.viewDetails")}</span>
                          </button>
                          {booking.status === "confirmed" && (
                            <button
                              type="button"
                              onClick={() => checkIn(booking.id)}
                              title={t("ui.bookings.checkIn")}
                              className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-2 text-xs font-semibold text-white hover:bg-primary/90"
                            >
                              <Check size={15} aria-hidden="true" />
                              <span>{t("ui.bookings.checkIn")}</span>
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {!loading && (
            <PaginationControls
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              pageSize={pagination.pageSize}
              onPageChange={(page) => {
                setPagination((current) => ({ ...current, page }));
                loadData(page);
              }}
            />
          )}
        </section>
      ) : (
        <OperatingHoursPanel
          metadataLoading={metadataLoading}
          outlets={outlets}
          products={selectedOutletProducts}
          selectedOutlet={selectedScheduleOutlet}
          canEdit={isOutletManager}
          scheduleDraft={scheduleDraft}
          setScheduleDraft={setScheduleDraft}
          exceptions={exceptions}
          setExceptions={setExceptions}
          saveSchedule={saveSchedule}
          savingSchedule={savingSchedule}
          saveMessage={saveMessage}
          setScheduleOutletId={(id) => {
            setScheduleOutletId(id);
            setFilters((current) => ({
              ...current,
              outletId: id,
              productId: "",
            }));
          }}
          slots={slots}
          loading={loading}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          toggleSelected={toggleSelected}
          cancelSlot={cancelSlot}
          pagination={pagination}
          loadData={loadData}
        />
      )}

      {showSlotForm && vendorId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/35 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <SlotForm
              vendorId={vendorId}
              outlets={outlets}
              products={products}
              onSuccess={() => {
                setShowSlotForm(false);
                setTab("operating-hours");
                loadData(1);
              }}
              onClose={() => setShowSlotForm(false)}
            />
          </div>
        </div>
      )}
      {selectedBooking && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-gray-950/20 p-4"
          onClick={() => setSelectedBooking(null)}
        >
          <aside
            onClick={(event) => event.stopPropagation()}
            className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  {t("ui.bookings.reservationDetails")}
                </p>
                <h2 className="mt-1 text-xl font-bold text-gray-950">
                  {selectedBooking.customer?.full_name ||
                    t("ui.bookings.guest")}
                </h2>
                <p className="mt-1 font-mono text-xs text-gray-500">
                  {selectedBooking.display_id || `#${selectedBooking.id}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-6 flex items-center gap-4 rounded-2xl bg-secondary/40 p-3">
              <CompactThumbnail
                src={productImageUrl(selectedBooking.slot?.products?.cover_url)}
                alt={
                  selectedBooking.slot?.products?.name ||
                  selectedBooking.orderItem?.product_name ||
                  t("ui.bookings.experience")
                }
                size="md"
              />
            </div>
            <div className="mt-6 space-y-3 text-sm">
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs text-gray-500">
                  {t("ui.bookings.experience")}
                </p>
                <p className="mt-1 font-semibold text-gray-900">
                  {selectedBooking.orderItem?.product_name ||
                    selectedBooking.slot?.products?.name}
                </p>
                <p className="mt-1 text-gray-500">
                  {dateLabel(
                    selectedBooking.slot?.starts_at,
                    locale,
                    t("ui.bookings.noDate"),
                  )}{" "}
                  –{" "}
                  {selectedBooking.slot?.ends_at
                    ? new Intl.DateTimeFormat(locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(selectedBooking.slot.ends_at))
                    : ""}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">
                    {t("ui.bookings.guests")}
                  </p>
                  <p className="mt-1 font-semibold text-gray-900">
                    {selectedBooking.orderItem?.quantity || 1}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">
                    {t("ui.bookings.status")}
                  </p>
                  <div className="mt-1">
                    <StatusBadge status={selectedBooking.status} />
                  </div>
                </div>
              </div>
              <p className="text-gray-600">
                {selectedBooking.customer?.email ||
                  t("ui.bookings.noEmailProvided")}
              </p>
              <p className="text-gray-600">
                {t("ui.bookings.outletValue", {
                  outlet:
                    selectBookingOutlet(
                      selectedBooking.orderItem?.outlets,
                      selectedBooking.slot?.outlets,
                    )?.name || t("ui.bookings.malaysiaOutlet"),
                })}
              </p>
            </div>
            <div className="mt-7 flex gap-2">
              {selectedBooking.status === "confirmed" && (
                <button
                  type="button"
                  onClick={() => checkIn(selectedBooking.id)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                >
                  <Check size={15} /> {t("ui.bookings.checkIn")}
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600"
              >
                {t("ui.bookings.close")}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

interface OperatingHoursPanelProps {
  metadataLoading: boolean;
  outlets: Outlet[];
  products: Product[];
  selectedOutlet?: Outlet;
  canEdit: boolean;
  scheduleDraft: Record<DayKey, DaySchedule>;
  setScheduleDraft: React.Dispatch<
    React.SetStateAction<Record<DayKey, DaySchedule>>
  >;
  exceptions: DateException[];
  setExceptions: React.Dispatch<React.SetStateAction<DateException[]>>;
  saveSchedule: () => void;
  savingSchedule: boolean;
  saveMessage: string;
  setScheduleOutletId: (id: string) => void;
  slots: Slot[];
  loading: boolean;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  toggleSelected: (id: string) => void;
  cancelSlot: (id: string) => void;
  pagination: Pagination;
  loadData: (page?: number) => void;
}

interface WeeklyOperatingHoursRowProps {
  day: DayKey;
  label: string;
  value: DaySchedule;
  canEdit: boolean;
  labels: {
    open: string;
    closed: string;
    opensAt: string;
    closesAt: string;
  };
  onChange: (patch: Partial<DaySchedule>) => void;
}

function WeeklyOperatingHoursRow({
  day,
  label,
  value,
  canEdit,
  labels,
  onChange,
}: WeeklyOperatingHoursRowProps) {
  const isOpen = !value.closed;
  const disabled = !canEdit || !isOpen;

  return (
    <div
      data-day={day}
      className={`grid gap-3 rounded-2xl border px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors md:grid-cols-[minmax(110px,0.8fr)_120px_minmax(280px,1.4fr)] md:items-center ${isOpen ? "border-gray-200/80 bg-gradient-to-r from-white to-gray-50/80" : "border-gray-100 bg-gray-50/70"}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
      </div>

      <label
        className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${isOpen ? "border-primary/15 bg-secondary/60 text-primary" : "border-gray-200 bg-white text-gray-500"} ${canEdit ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
      >
        <input
          type="checkbox"
          disabled={!canEdit}
          checked={isOpen}
          onChange={(event) => onChange({ closed: !event.target.checked })}
        />
        <span>{isOpen ? labels.open : labels.closed}</span>
      </label>

      <div className="flex min-w-0 items-center gap-2">
        <label
          className={`min-w-0 flex-1 rounded-xl border px-2 ${isOpen ? "border-gray-200 bg-white shadow-sm" : "border-gray-100 bg-white/70"}`}
        >
          <span className="sr-only">{labels.opensAt}</span>
          <input
            type="time"
            disabled={disabled}
            value={value.open || "09:00"}
            onChange={(event) => onChange({ open: event.target.value })}
            className="h-10 min-w-0 w-full bg-transparent px-1 text-sm font-semibold text-gray-900 outline-none disabled:cursor-not-allowed disabled:text-gray-400"
          />
        </label>
        <span
          aria-hidden="true"
          className="shrink-0 text-sm font-semibold text-gray-300"
        >
          –
        </span>
        <label
          className={`min-w-0 flex-1 rounded-xl border px-2 ${isOpen ? "border-gray-200 bg-white shadow-sm" : "border-gray-100 bg-white/70"}`}
        >
          <span className="sr-only">{labels.closesAt}</span>
          <input
            type="time"
            disabled={disabled}
            value={value.close || "18:00"}
            onChange={(event) => onChange({ close: event.target.value })}
            className="h-10 min-w-0 w-full bg-transparent px-1 text-sm font-semibold text-gray-900 outline-none disabled:cursor-not-allowed disabled:text-gray-400"
          />
        </label>
      </div>
    </div>
  );
}

function OperatingHoursPanel({
  metadataLoading,
  outlets,
  products,
  selectedOutlet,
  canEdit,
  scheduleDraft,
  setScheduleDraft,
  exceptions,
  setExceptions,
  saveSchedule,
  savingSchedule,
  saveMessage,
  setScheduleOutletId,
  slots,
  loading,
  selectedIds,
  setSelectedIds,
  toggleSelected,
  cancelSlot,
  pagination,
  loadData,
}: OperatingHoursPanelProps) {
  const { t, i18n } = useTranslation("vendor");
  const locale = i18n.resolvedLanguage || i18n.language;
  const showOutletSelector = metadataLoading || outlets.length > 1;
  const [isScheduleEditorOpen, setScheduleEditorOpen] = useState(false);
  const scheduleDirty =
    scheduleSignature(scheduleDraft) !==
      scheduleSignature(scheduleFor(selectedOutlet)) ||
    exceptionSignature(exceptions) !==
      exceptionSignature(exceptionEntries(selectedOutlet));
  const scheduleGroups = dayLabels.reduce(
    (groups, day) => {
      const value = scheduleDraft[day] || {};
      const key = value.closed
        ? "closed"
        : `${value.open || "09:00"}-${value.close || "18:00"}`;
      const group = groups.find((item) => item.key === key);
      if (group) group.days.push(day);
      else groups.push({ key, days: [day], value });
      return groups;
    },
    [] as Array<{ key: string; days: DayKey[]; value: DaySchedule }>,
  );

  useEffect(() => {
    setScheduleEditorOpen(false);
  }, [selectedOutlet?.id]);

  function addShortcutExceptions(shortcut: MalaysiaDateShortcut) {
    const dates = getMalaysiaDateShortcutDates(shortcut);
    setExceptions((current) => {
      const existingDates = new Set(current.map((exception) => exception.date));
      return [
        ...current,
        ...dates
          .filter((date) => !existingDates.has(date))
          .map((date) => ({
            date,
            open: "09:00",
            close: "18:00",
            closed: true,
            note: "",
          })),
      ];
    });
  }
  return (
    <div
      className={
        showOutletSelector
          ? "grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)]"
          : "space-y-5"
      }
    >
      {showOutletSelector && (
        <aside className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between px-2 pb-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {t("ui.bookings.yourOutlets")}
              </p>
              <p className="text-xs text-gray-500">
                {t(
                  canEdit
                    ? "ui.bookings.selectToEdit"
                    : "ui.bookings.selectToView",
                )}
              </p>
            </div>
            <MapPin size={17} className="text-primary" />
          </div>
          <div className="space-y-1">
            {metadataLoading ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-12 animate-pulse rounded-xl bg-gray-100"
                  />
                ))}
              </div>
            ) : (
              outlets.map((outlet) => (
                <button
                  type="button"
                  key={outlet.id}
                  onClick={() => setScheduleOutletId(outlet.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition ${selectedOutlet?.id === outlet.id ? "bg-secondary text-primary ring-1 ring-primary/20" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {outlet.name}
                    </span>
                    <span className="mt-1 block truncate text-xs text-gray-500">
                      {outlet.city || outlet.state || t("ui.bookings.malaysia")}
                    </span>
                  </span>
                  <ChevronRight size={15} className="shrink-0" />
                </button>
              ))
            )}
          </div>
        </aside>
      )}
      <div className="space-y-5">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                {t("ui.bookings.weeklyHours")}
              </p>
              <h2 className="mt-1 text-xl font-bold text-gray-950">
                {outletLabel(selectedOutlet, t("ui.bookings.allOutlets"))}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {t(
                  canEdit
                    ? "ui.bookings.weeklyHoursDescription"
                    : "ui.bookings.weeklyHoursReadOnlyDescription",
                )}
              </p>
            </div>
            {canEdit ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${scheduleDirty ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"}`}
                >
                  {scheduleDirty
                    ? t("ui.bookings.unsavedChanges")
                    : t("ui.bookings.allChangesSaved")}
                </span>
                <button
                  type="button"
                  onClick={() => setScheduleEditorOpen((current) => !current)}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  {isScheduleEditorOpen
                    ? t("ui.bookings.doneEditing")
                    : t("ui.bookings.editSchedule")}
                </button>
                {(isScheduleEditorOpen || scheduleDirty) && (
                  <button
                    type="button"
                    onClick={saveSchedule}
                    disabled={
                      savingSchedule || !selectedOutlet || !scheduleDirty
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Save size={15} />{" "}
                    {savingSchedule
                      ? t("ui.bookings.saving")
                      : t("ui.bookings.saveHours")}
                  </button>
                )}
              </div>
            ) : (
              <span className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-500">
                <Eye size={15} /> {t("ui.bookings.viewOnly")}
              </span>
            )}
          </div>
          <div className="mt-4" data-booking-hours-summary>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
              {t("ui.bookings.scheduleSummary")}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {scheduleGroups.map((group) => (
                <div
                  key={group.key}
                  className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2.5"
                >
                  <p className="text-xs font-semibold text-gray-500">
                    {group.days
                      .map((day) => t(`ui.bookings.days.${day}`))
                      .join(" · ")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {group.value.closed
                      ? t("ui.bookings.closed")
                      : `${group.value.open || "09:00"} – ${group.value.close || "18:00"}`}
                  </p>
                </div>
              ))}
            </div>
          </div>
          {isScheduleEditorOpen && (
            <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
              {dayLabels.map((day) => {
                const value = scheduleDraft[day] || {};
                return (
                  <WeeklyOperatingHoursRow
                    key={day}
                    day={day}
                    label={t(`ui.bookings.days.${day}`)}
                    value={value}
                    canEdit={canEdit}
                    labels={{
                      open: t("ui.bookings.open"),
                      closed: t("ui.bookings.closed"),
                      opensAt: t("ui.bookings.opensAt"),
                      closesAt: t("ui.bookings.closesAt"),
                    }}
                    onChange={(patch) =>
                      setScheduleDraft((current) => ({
                        ...current,
                        [day]: { ...current[day], ...patch },
                      }))
                    }
                  />
                );
              })}
            </div>
          )}
          {saveMessage && (
            <p className="mt-3 text-xs font-semibold text-primary">
              {saveMessage}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 border-b border-gray-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                {t("ui.bookings.dateExceptions")}
              </p>
              <h2 className="mt-1 text-lg font-bold text-gray-950">
                {t("ui.bookings.holidayHours")}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {t("ui.bookings.exceptionsDescription")}
              </p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() =>
                  setExceptions((current) => [
                    ...current,
                    {
                      date: getMalaysiaDateInputValue(),
                      open: "09:00",
                      close: "18:00",
                      closed: true,
                      note: "",
                    },
                  ])
                }
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <CirclePlus size={14} /> {t("ui.bookings.addException")}
              </button>
            )}
          </div>
          {canEdit && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-100 bg-amber-50/60 p-3">
              <span className="mr-1 text-xs font-semibold text-amber-900">
                {t("ui.bookings.quickAdd")}
              </span>
              <button
                type="button"
                onClick={() => addShortcutExceptions("today")}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-amber-200 hover:bg-amber-50"
              >
                {t("ui.bookings.today")}
              </button>
              <button
                type="button"
                onClick={() => addShortcutExceptions("tomorrow")}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-amber-200 hover:bg-amber-50"
              >
                {t("ui.bookings.tomorrow")}
              </button>
              <button
                type="button"
                onClick={() => addShortcutExceptions("weekend")}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-amber-200 hover:bg-amber-50"
              >
                {t("ui.bookings.thisWeekend")}
              </button>
              <span className="basis-full text-[11px] text-amber-800 sm:basis-auto">
                {t("ui.bookings.quickAddHint")}
              </span>
            </div>
          )}
          <div className="mt-4 space-y-3">
            {exceptions.map((exception, index) => (
              <article
                key={exception.date + "-" + index}
                className="rounded-xl border border-gray-100 bg-gray-50/60 p-3"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                  <label className="min-w-0 flex-1 text-xs font-semibold text-gray-600">
                    <span className="mb-1.5 block">
                      {t("ui.bookings.exceptionDate")}
                    </span>
                    <input
                      type="date"
                      disabled={!canEdit}
                      value={exception.date}
                      onChange={(event) =>
                        setExceptions((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, date: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>
                  <div
                    className="flex flex-wrap gap-2"
                    role="group"
                    aria-label={t("ui.bookings.exceptionMode")}
                  >
                    <button
                      type="button"
                      disabled={!canEdit}
                      aria-pressed={Boolean(exception.closed)}
                      onClick={() =>
                        setExceptions((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, closed: true }
                              : item,
                          ),
                        )
                      }
                      className={
                        exception.closed
                          ? "rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60"
                          : "rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-600 ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                      }
                    >
                      {t("ui.bookings.closedAllDay")}
                    </button>
                    <button
                      type="button"
                      disabled={!canEdit}
                      aria-pressed={!exception.closed}
                      onClick={() =>
                        setExceptions((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, closed: false }
                              : item,
                          ),
                        )
                      }
                      className={
                        !exception.closed
                          ? "rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60"
                          : "rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-600 ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                      }
                    >
                      {t("ui.bookings.customHours")}
                    </button>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() =>
                        setExceptions((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      aria-label={t("ui.bookings.removeException")}
                      className="self-start rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 lg:self-end"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
                {!exception.closed && (
                  <div className="mt-3 grid gap-3 border-t border-gray-200/80 pt-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-gray-600">
                      {t("ui.bookings.opensAt")}
                      <input
                        type="time"
                        disabled={!canEdit}
                        value={exception.open || "09:00"}
                        onChange={(event) =>
                          setExceptions((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, open: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>
                    <label className="text-xs font-semibold text-gray-600">
                      {t("ui.bookings.closesAt")}
                      <input
                        type="time"
                        disabled={!canEdit}
                        value={exception.close || "18:00"}
                        onChange={(event) =>
                          setExceptions((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, close: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>
                  </div>
                )}
              </article>
            ))}
            {!exceptions.length && (
              <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-sm text-gray-400">
                {t("ui.bookings.noExceptions")}
              </p>
            )}
          </div>
        </div>
        <div
          className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
          data-booking-slot-list
        >
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/70 px-5 py-3">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600">
              <input
                type="checkbox"
                checked={
                  slots.length > 0 &&
                  slots.every((slot) => selectedIds.includes(slot.id))
                }
                onChange={(event) =>
                  setSelectedIds(
                    event.target.checked ? slots.map((slot) => slot.id) : [],
                  )
                }
              />{" "}
              {t("ui.bookings.selectSlots")}
            </label>
            <span className="text-xs text-gray-400">
              {t("ui.bookings.slotsSummary", {
                slots: pagination.total.toLocaleString(),
                products: products.length,
              })}
            </span>
          </div>
          <div className="hidden grid-cols-[32px_minmax(220px,1.5fr)_minmax(130px,0.8fr)_110px_110px_90px] gap-3 border-b border-gray-100 bg-gray-50/60 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 md:grid">
            <span />
            <span>{t("ui.bookings.slotTime")}</span>
            <span>{t("ui.bookings.outlet")}</span>
            <span>{t("ui.bookings.bookedCapacity")}</span>
            <span>{t("ui.bookings.slotStatus")}</span>
            <span className="text-right">{t("ui.orders.actionColumn")}</span>
          </div>
          <div className="divide-y divide-gray-100">
            {loading ? (
              <div className="space-y-3 p-5">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-16 animate-pulse rounded-xl bg-gray-100"
                  />
                ))}
              </div>
            ) : (
              slots.map((slot) => {
                const displayStatus = getSlotDisplayStatus(slot);
                const canCancel =
                  slot.booked === 0 && displayStatus === "available";
                return (
                  <article
                    key={slot.id}
                    className="grid gap-3 px-4 py-4 transition hover:bg-secondary/30 md:grid-cols-[32px_minmax(220px,1.5fr)_minmax(130px,0.8fr)_110px_110px_90px] md:items-center"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(slot.id)}
                      onChange={() => toggleSelected(slot.id)}
                      aria-label={t("ui.bookings.selectSlot", {
                        id: slotReference(slot),
                      })}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">
                        {slot.products?.name || t("ui.bookings.experience")}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {t("strictMigration.bookingReference", {
                          date: dateLabel(
                            slot.starts_at,
                            locale,
                            t("ui.bookings.noDate"),
                          ),
                          reference: slotReference(slot),
                        })}
                      </p>
                    </div>
                    <div className="text-xs text-gray-600">
                      <p className="font-medium text-gray-800">
                        {slot.outlets?.name || t("ui.bookings.outlet")}
                      </p>
                      <p className="mt-1 text-gray-400">
                        {slot.outlets?.city || slot.outlets?.state || ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {slot.booked}/{slot.capacity}
                      </p>
                    </div>
                    <div>
                      <StatusBadge status={displayStatus} />
                    </div>
                    <div className="flex justify-end">
                      {canCancel && (
                        <button
                          type="button"
                          onClick={() => cancelSlot(slot.id)}
                          className="text-xs font-semibold text-red-600 hover:underline"
                        >
                          {t("ui.bookings.cancel")}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
            {!slots.length && !loading && (
              <div className="px-6 py-16 text-center text-sm text-gray-400">
                {t("ui.bookings.noSlots")}
              </div>
            )}
          </div>
          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={pagination.pageSize}
            onPageChange={(page) => loadData(page)}
          />
        </div>
      </div>
    </div>
  );
}
