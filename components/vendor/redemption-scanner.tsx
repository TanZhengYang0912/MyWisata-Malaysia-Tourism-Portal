"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import {
  Camera,
  CheckCircle2,
  Clock,
  History,
  Keyboard,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  Sparkles,
  Square,
  Tag,
  Ticket,
  TicketCheck,
  User,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useTranslation } from "react-i18next";

type OutletOption = { id: string; name: string };
type ResolvedScan =
  | { kind: "ticket"; bookingId: string; passToken: string | null; outletId: string; outletName: string; vendorName: string; status: string; productName: string; quantity: number; pass: { policy?: string; entry_limit?: number; entries_used?: number; remaining?: number; status?: string; valid_until?: string | null } | null }
  | { kind: "food_order"; orderId: string; foodToken: string; outletId: string; outletName: string; vendorName: string; mode: "dine_in" | "takeaway"; items: { id: string; name: string; variant: string | null; quantity: number }[] }
  | { kind: "voucher"; claimId: string; voucherId: string; outletId: string; code: string; name: string; voucherType: string; discountValue: number; validUntil: string | null; redemptionMode: string; vendorName: string; outletName: string };

interface RecentScanItem {
  id: string;
  kind: "voucher" | "ticket";
  redeemedAt: string;
  outlet: { id: string; name: string };
  item: { code?: string; name: string; details: string; discountValue?: number };
  customer: { name: string; email: string };
}

interface StationStats {
  todayScans: number;
  ticketAdmissions: number;
  voucherRedemptions: number;
  uniqueCustomers: number;
}

interface RedemptionScannerProps {
  vendorId: string;
  outlets: OutletOption[];
}

function playBeep(success = true) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(success ? 880 : 320, ctx.currentTime);
    if (success) {
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } else {
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.28);
    }
  } catch {
    // Ignore audio context errors gracefully
  }
}

function formatScanTime(isoString: string) {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return isoString;
  }
}

export function RedemptionScanner({ vendorId, outlets }: RedemptionScannerProps) {
  const { t } = useTranslation("vendor");
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [outletId, setOutletId] = useState(outlets[0]?.id ?? "");
  const [cameraOn, setCameraOn] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [result, setResult] = useState<ResolvedScan | null>(null);
  const [scanError, setScanError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [entriesToAdmit, setEntriesToAdmit] = useState(1);

  // Layout & Productivity States
  const [activeTab, setActiveTab] = useState<"scanner" | "manual" | "history">("scanner");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [stats, setStats] = useState<StationStats>({
    todayScans: 0,
    ticketAdmissions: 0,
    voucherRedemptions: 0,
    uniqueCustomers: 0,
  });
  const [recentLogs, setRecentLogs] = useState<RecentScanItem[]>([]);

  useEffect(() => {
    if (!outletId && outlets[0]?.id) {
      // Outlet options arrive after the authenticated vendor scope is loaded.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOutletId(outlets[0].id);
    }
  }, [outletId, outlets]);

  const loadStationData = useCallback(async () => {
    if (!vendorId || !outletId) return;
    setLoadingStats(true);
    try {
      const params = new URLSearchParams({ outletId, pageSize: "8" });
      const response = await fetch(`/api/vendors/${vendorId}/redemptions?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { data?: { stats?: { totalRedemptions?: number; ticketAdmissions?: number; voucherRedemptions?: number; uniqueCustomers?: number }; items?: RecentScanItem[] } };
      if (response.ok && payload.data) {
        setStats({
          todayScans: payload.data.stats?.totalRedemptions ?? 0,
          ticketAdmissions: payload.data.stats?.ticketAdmissions ?? 0,
          voucherRedemptions: payload.data.stats?.voucherRedemptions ?? 0,
          uniqueCustomers: payload.data.stats?.uniqueCustomers ?? 0,
        });
        setRecentLogs(payload.data.items ?? []);
      }
    } catch {
      // Ignore silent stats fetch error
    } finally {
      setLoadingStats(false);
    }
  }, [outletId, vendorId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStationData();
  }, [loadStationData]);

  useEffect(() => {
    function handleFsChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }

  const resolve = useCallback(async (rawValue: string) => {
    setBusy(true);
    setResult(null);
    setScanError("");
    setMessage("");
    try {
      const response = await fetch(`/api/vendors/${vendorId}/scanner/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawValue, outletId }),
      });
      const payload = await response.json() as { data?: ResolvedScan; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? t("ui.scanner.invalidCode"));
      setResult(payload.data);
      if (soundEnabled) playBeep(true);
      if (payload.data.kind === "ticket") {
        setEntriesToAdmit(Math.min(1, Math.max(1, payload.data.pass?.remaining ?? (payload.data.pass?.entry_limit ?? payload.data.quantity) - (payload.data.pass?.entries_used ?? 0))));
      }
    } catch (error) {
      if (soundEnabled) playBeep(false);
      setScanError(error instanceof Error ? error.message : t("ui.scanner.resolveFailed"));
    } finally {
      setBusy(false);
    }
  }, [outletId, soundEnabled, t, vendorId]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!cameraOn || !videoElement) return;
    let cancelled = false;
    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128]);
    const reader = new BrowserMultiFormatReader(hints);

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error(t("ui.scanner.cameraUnsupported"));
      try {
        controlsRef.current = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          videoElement ?? undefined,
          (decoded) => {
            if (cancelled || !decoded || result) return;
            cancelled = true;
            controlsRef.current?.stop();
            setManualValue(decoded.getText());
            setCameraOn(false);
            void resolve(decoded.getText());
          },
        );
      } catch (error) {
        if (!cancelled) setScanError(error instanceof Error ? error.message : t("ui.scanner.cameraFailed"));
      }
    }

    void startCamera();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      BrowserMultiFormatReader.releaseAllStreams();
    };
  }, [cameraOn, resolve, result, t]);

  async function confirm() {
    if (!result || !outletId) return;
    setBusy(true);
    setScanError("");
    try {
      let successMessage = "";
      if (result.kind === "ticket") {
        const entriesAdmitted = result.pass?.policy === 'group_entry' ? entriesToAdmit : 1;
        const response = await fetch(`/api/vendors/${vendorId}/bookings/${result.bookingId}/checkin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passToken: result.passToken, entriesAdmitted }),
        });
        const payload = await response.json() as { data?: { pass?: { entries_used?: number; entry_limit?: number; remaining?: number } }; error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message ?? t("ui.scanner.commitFailed"));
        const progress = payload.data?.pass;
        successMessage = progress
          ? t("ui.scanner.ticketAcceptedCount", { used: progress.entries_used ?? 0, total: progress.entry_limit ?? 1, remaining: progress.remaining ?? 0 })
          : t("ui.scanner.ticketAccepted");
      } else if (result.kind === "food_order") {
        const response = await fetch("/api/vendors/" + vendorId + "/scanner/fulfil-food-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ foodToken: result.foodToken, outletId }),
        });
        const payload = await response.json() as { data?: { mode?: "dine_in" | "takeaway"; status?: "checked_in" | "fulfilled" }; error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message ?? t("ui.scanner.commitFailed"));
        successMessage = payload.data?.status === "checked_in"
          ? t("ui.scanner.foodDineInCheckedIn")
          : t("ui.scanner.foodOrderFulfilled");
      } else {
        const response = await fetch(`/api/vendors/${vendorId}/scanner/redeem-voucher`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: manualValue || "", outletId }),
        });
        const payload = await response.json() as { error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message ?? t("ui.scanner.commitFailed"));
        successMessage = t("ui.scanner.voucherRedeemed");
      }
      if (soundEnabled) playBeep(true);
      setMessage(successMessage);
      setResult(null);
      setManualValue("");
      void loadStationData();
    } catch (error) {
      if (soundEnabled) playBeep(false);
      setScanError(error instanceof Error ? error.message : t("ui.scanner.commitFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function resolveManual() {
    const value = manualValue.trim();
    if (value) await resolve(value);
  }

  const assignedOutlet = outlets.find((o) => o.id === outletId) ?? outlets[0];
  const assignedOutletName = assignedOutlet?.name || t("ui.scanner.assignedOutlet", "Assigned outlet");
  const ticketRemaining = result?.kind === "ticket"
    ? result.pass?.remaining ?? Math.max(0, (result.pass?.entry_limit ?? result.quantity) - (result.pass?.entries_used ?? 0))
    : null;

  return (
    <div className="space-y-5">
      {/* 1. Header (Matching Fig 2 Layout) */}
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <ScanLine size={15} />
            <span>{t("ui.scanner.eyebrow")}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-950">{t("ui.scanner.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("ui.scanner.description")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSoundEnabled((prev) => !prev)}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition ${
              soundEnabled
                ? "border-primary/20 bg-secondary text-primary hover:bg-secondary/80"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
            title={soundEnabled ? t("ui.scanner.soundOn", "Sound on") : t("ui.scanner.soundOff", "Sound muted")}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span className="hidden sm:inline">{soundEnabled ? t("ui.scanner.soundOn", "Sound On") : t("ui.scanner.soundOff", "Muted")}</span>
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            <span className="hidden sm:inline">{isFullscreen ? t("ui.scanner.exitFullscreen", "Exit") : t("ui.scanner.fullscreen", "Fullscreen")}</span>
          </button>
          <button
            type="button"
            onClick={() => void loadStationData()}
            disabled={loadingStats}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loadingStats ? "animate-spin" : ""} />
            <span>{t("actions.refresh", "Refresh")}</span>
          </button>
        </div>
      </header>

      {/* 2. KPI Summary Cards Row (Matching Fig 2) */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{t("ui.scanner.todayScans", "Today's Scans")}</p>
          <p className="mt-1 text-2xl font-bold text-primary">{stats.todayScans}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{t("ui.scanner.ticketsAdmitted", "Tickets Admitted")}</p>
          <p className="mt-1 text-2xl font-bold text-gray-950">{stats.ticketAdmissions}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{t("ui.scanner.vouchersUsed", "Vouchers Redeemed")}</p>
          <p className="mt-1 text-2xl font-bold text-gray-950">{stats.voucherRedemptions}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{t("ui.scanner.stationStatus", "Station Status")}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="truncate text-sm font-bold text-gray-900" title={assignedOutletName}>
              {assignedOutletName}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Toolbar Row (Tabs + Outlet Selector - Matching Fig 2) */}
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("scanner")}
            className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              activeTab === "scanner" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <Camera size={14} />
            <span>{t("ui.scanner.cameraTab", "Live Camera")}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("manual")}
            className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              activeTab === "manual" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <Keyboard size={14} />
            <span>{t("ui.scanner.manualTab", "Barcode Gun / Manual")}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              activeTab === "history" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <History size={14} />
            <span>{t("ui.scanner.historyTab", "Recent Scans")}</span>
            {recentLogs.length > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                {recentLogs.length}
              </span>
            )}
          </button>
        </div>

        {/* Outlet Switcher */}
        {outlets.length > 1 ? (
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
            <span>{t("ui.scanner.outlet")}:</span>
            <select
              value={outletId}
              onChange={(event) => setOutletId(event.target.value)}
              className="h-9 rounded-xl border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-800 outline-none focus:border-primary"
              disabled={cameraOn || busy}
            >
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <span>{t("ui.scanner.outlet")}:</span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-secondary px-2.5 py-1 text-xs font-bold text-primary">
              {outlets[0]?.name || t("ui.scanner.assignedOutlet", "Assigned outlet")}
            </span>
          </div>
        )}
      </div>

      {/* 4. Main Workstation Card (Matching Fig 2 unified white card container) */}
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
        {activeTab !== "history" ? (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
              {/* Left Column: Viewfinder or Dedicated Gun Input */}
              {activeTab === "scanner" ? (
                <div className="rounded-2xl border border-gray-900 bg-gray-950 p-4 text-white shadow-inner sm:p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/80">
                      <Camera size={14} className="text-[#ffcc00]" />
                      <span>{t("ui.scanner.supportsQrAndBarcode")}</span>
                    </span>
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/70">
                      {cameraOn ? t("ui.scanner.stationActive", "Ready to scan") : t("ui.scanner.cameraReady")}
                    </span>
                  </div>

                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
                    <video
                      ref={videoRef}
                      muted
                      playsInline
                      className="h-full w-full object-cover"
                      aria-label={t("ui.scanner.cameraPreview")}
                    />
                    <div className="pointer-events-none absolute inset-[14%] rounded-2xl border-2 border-[#ffcc00] shadow-[0_0_0_999px_rgba(0,0,0,0.3)]">
                      {cameraOn && (
                        <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-[#ffcc00] shadow-[0_0_8px_#ffcc00]" />
                      )}
                    </div>
                    {!cameraOn && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white/80">
                        <TicketCheck size={42} className="text-[#ffcc00]" />
                        <p className="max-w-xs text-sm">{t("ui.scanner.cameraReady")}</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setScanError("");
                        setMessage("");
                        setCameraOn((current) => !current);
                      }}
                      disabled={busy || !outletId}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#ffcc00] px-4 py-2.5 text-sm font-bold text-[#010066] transition hover:brightness-105 disabled:opacity-50"
                    >
                      {cameraOn ? (
                        <>
                          <Square size={15} /> {t("ui.scanner.stopCamera")}
                        </>
                      ) : (
                        <>
                          <Camera size={16} /> {t("ui.scanner.openCamera")}
                        </>
                      )}
                    </button>
                  </div>
                  <p className="mt-2.5 text-center text-xs text-white/50">{t("ui.scanner.cameraHint")}</p>
                </div>
              ) : (
                <div className="flex flex-col justify-center rounded-2xl border border-primary/20 bg-secondary/30 p-6 sm:p-8">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Keyboard size={24} />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-gray-950">{t("ui.scanner.manualTitle")}</h3>
                  <p className="mt-1 text-sm text-gray-500">{t("ui.scanner.manualDescription")}</p>

                  <div className="mt-6 space-y-3">
                    <div className="relative">
                      <input
                        autoFocus
                        value={manualValue}
                        onChange={(event) => setManualValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void resolveManual();
                        }}
                        placeholder={t("ui.scanner.manualPlaceholder")}
                        className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 font-mono text-base uppercase shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void resolveManual()}
                      disabled={!manualValue.trim() || busy || !outletId}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
                    >
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <ScanLine size={16} />}
                      <span>{t("ui.scanner.checkCode")}</span>
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-gray-500">{t("ui.scanner.quickInputHint")}</p>
                </div>
              )}

              {/* Right Column: Code Input / Review Box / Alerts */}
              <div className="flex flex-col justify-between space-y-4">
                <div className="space-y-4">
                  {/* Recent activity panel */}
                  {activeTab === "scanner" && (
                    <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-gray-700">
                          <Clock size={14} className="text-primary" />
                          <span>{t("ui.scanner.recentRedemptions", "Recent Redemptions")}</span>
                        </div>
                        {recentLogs.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setActiveTab("history")}
                            className="whitespace-nowrap text-xs font-bold text-primary hover:underline"
                          >
                            {t("ui.scanner.viewHistory", "View full logs")} →
                          </button>
                        )}
                      </div>

                      {recentLogs.length === 0 ? (
                        <p className="mt-3 text-xs text-gray-400">{t("ui.scanner.noRecentActivity")}</p>
                      ) : (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {recentLogs.slice(0, 4).map((item) => (
                            <div
                              key={item.id}
                              className="flex min-w-0 items-start gap-2 rounded-xl border border-gray-100 bg-white p-2.5 text-xs shadow-sm"
                            >
                              <div className="mt-0.5 rounded-lg bg-secondary p-1.5 text-primary">
                                {item.kind === "voucher" ? <Tag size={13} /> : <Ticket size={13} />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold text-gray-900">{item.item.name}</p>
                                <p className="truncate text-[11px] text-gray-500">
                                  {item.customer.name} · {formatScanTime(item.redeemedAt)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Feedback Alerts */}
                  {scanError && (
                    <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                      <ShieldAlert size={18} className="shrink-0 text-red-600" />
                      <span>{scanError}</span>
                    </div>
                  )}
                  {message && (
                    <div role="status" className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
                      <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
                      <span>{message}</span>
                    </div>
                  )}

                  {/* Resolved Review Card */}
                  {result && (
                    <div className="rounded-2xl border border-primary/20 bg-secondary/35 p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">
                          {t("ui.scanner.reviewBeforeConfirm")}
                        </p>
                        <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                          {result.kind === "voucher" ? t("ui.scanner.voucherKind") : result.kind === "food_order" ? t("ui.scanner.foodOrderKind") : t("ui.scanner.ticketKind")}
                        </span>
                      </div>

                      {result.kind === "food_order" ? (
                        <div className="mt-3">
                          <h2 className="text-lg font-bold text-gray-950">{t("ui.scanner.foodOrderTitle", { order: result.orderId.slice(0, 8).toUpperCase() })}</h2>
                          <p className="mt-1 text-xs text-gray-600">{t("ui.scanner.vendor")}: <span className="font-semibold text-gray-900">{result.vendorName}</span></p>
                          <p className="text-xs text-gray-600">{t("ui.scanner.outlet")}: <span className="font-semibold text-gray-900">{result.outletName}</span></p>
                          <p className="mt-1 text-sm font-semibold text-primary">{result.mode === "dine_in" ? t("ui.scanner.customerFoodMode.dine_in") : t("ui.scanner.customerFoodMode.takeaway")}</p>
                          <ul className="mt-3 space-y-1 text-sm text-gray-700">
                            {result.items.map((item) => <li key={item.id}>{item.quantity} × {item.name}{item.variant ? " · " + item.variant : ""}</li>)}
                          </ul>
                        </div>
                      ) : result.kind === "voucher" ? (
                        <div className="mt-3">
                          <h2 className="text-lg font-bold text-gray-950">{result.name}</h2>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="rounded-md bg-white px-2 py-0.5 font-mono text-xs font-bold text-primary shadow-xs">
                              {result.code}
                            </span>
                          </div>
                          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-primary/10 pt-3 text-xs">
                            <div>
                              <dt className="text-gray-500">{t("ui.scanner.vendor")}</dt>
                              <dd className="mt-0.5 font-semibold text-gray-900">{result.vendorName}</dd>
                            </div>
                            <div>
                              <dt className="text-gray-500">{t("ui.scanner.outlet")}</dt>
                              <dd className="mt-0.5 font-semibold text-gray-900">{result.outletName}</dd>
                            </div>
                            <div>
                              <dt className="text-gray-500">{t("ui.scanner.discount")}</dt>
                              <dd className="mt-0.5 font-semibold text-gray-900">{result.discountValue}</dd>
                            </div>
                          </dl>
                        </div>
                      ) : (
                        <div className="mt-3">
                          <h2 className="text-lg font-bold text-gray-950">{result.productName}</h2>
                          <p className="mt-1 text-xs text-gray-600">{t("ui.scanner.vendor")}: <span className="font-semibold text-gray-900">{result.vendorName}</span></p>
                          <p className="text-xs text-gray-600">{t("ui.scanner.outlet")}: <span className="font-semibold text-gray-900">{result.outletName}</span></p>
                          <p className="mt-1 font-mono text-xs text-gray-500">{result.bookingId}</p>
                          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-primary/10 pt-3 text-xs">
                            <div>
                              <p className="text-gray-500">{t("ui.scanner.remaining")}</p>
                              <p className="mt-0.5 text-base font-bold text-primary">
                                {ticketRemaining ?? 0}
                              </p>
                              <p className="mt-1 text-[11px] text-gray-500">
                                {t("ui.scanner.ticketProgress", { used: result.pass?.entries_used ?? 0, total: result.pass?.entry_limit ?? result.quantity })}
                              </p>
                            </div>
                            {result.pass?.policy === 'group_entry' ? (
                              <label className="text-gray-500">
                                <span>{t("ui.scanner.entriesToAdmit")}</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={ticketRemaining ?? 1}
                                  value={entriesToAdmit}
                                  onChange={(event) => setEntriesToAdmit(Math.min(ticketRemaining ?? 1, Math.max(1, Number(event.target.value) || 1)))}
                                  className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-2 font-semibold text-gray-900"
                                />
                              </label>
                            ) : (
                              <div className="text-gray-500">
                                <p>{result.pass?.policy === 'multi_entry' ? t('ui.scanner.multiEntryPass') : t('ui.scanner.singleEntryPass')}</p>
                                <p className="mt-1 text-sm font-semibold text-gray-900">{t('ui.scanner.oneEntryPerScan')}</p>
                              </div>
                            )}
                          </div>
                          {result.pass?.policy === "multi_entry" && result.pass.valid_until && <p className="mt-3 text-xs text-gray-500">{t("ui.scanner.passExpires", { date: new Date(result.pass.valid_until).toLocaleDateString() })}</p>}
                        </div>
                      )}

                      <div className="mt-5 space-y-2">
                        <button
                          type="button"
                          onClick={() => void confirm()}
                          disabled={busy}
                          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
                        >
                          {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                          <span>{t("ui.scanner.confirm")}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResult(null);
                            setManualValue("");
                          }}
                          disabled={busy}
                          className="w-full py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900"
                        >
                          {t("ui.scanner.cancel")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-[11px] text-gray-500">
                  <span className="font-semibold text-gray-700">{t("ui.scanner.quickInputHint")}</span>{" "}
                  {t("ui.scanner.pressEnter")}
                </div>
              </div>
            </div>

          </div>
        ) : (
          /* Full History Tab View (Matching Fig 2 Table layout) */
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-950">{t("ui.scanner.historyTab", "Recent Scans")}</h3>
                <p className="text-xs text-gray-500">{t("ui.redemptions.description")}</p>
              </div>
              <button
                type="button"
                onClick={() => void loadStationData()}
                disabled={loadingStats}
                className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                <RefreshCw size={12} className={loadingStats ? "animate-spin" : ""} />
                <span>{t("actions.refresh", "Refresh")}</span>
              </button>
            </div>

            {recentLogs.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">
                <TicketCheck className="mx-auto mb-2 opacity-30" size={32} />
                <p>{t("ui.scanner.noRecentActivity")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-gray-100 bg-gray-50/70 font-semibold uppercase tracking-[0.1em] text-gray-500">
                    <tr>
                      <th className="px-4 py-3">{t("ui.redemptions.table.time")}</th>
                      <th className="px-4 py-3">{t("ui.redemptions.table.type")}</th>
                      <th className="px-4 py-3">{t("ui.redemptions.table.item")}</th>
                      <th className="px-4 py-3">{t("ui.redemptions.table.customer")}</th>
                      <th className="px-4 py-3 text-right">{t("ui.vouchers.status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recentLogs.map((item) => (
                      <tr key={item.id} className="transition hover:bg-gray-50/50">
                        <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                          {formatScanTime(item.redeemedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              item.kind === "voucher"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-primary/10 text-primary"
                            }`}
                          >
                            {item.kind === "voucher" ? <Tag size={10} /> : <Ticket size={10} />}
                            <span className="capitalize">{item.kind}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {item.item.name}
                          {item.item.code && (
                            <span className="ml-2 font-mono text-[11px] text-gray-400">
                              ({item.item.code})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          <span className="inline-flex items-center gap-1">
                            <User size={12} className="text-gray-400" />
                            <span>{item.customer.name}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            <Sparkles size={10} />
                            <span>{t("ui.redemptions.table.verifiedBy")}</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
