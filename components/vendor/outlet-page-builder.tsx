"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Monitor,
  Smartphone,
  Tablet,
  Undo2,
  Redo2,
  Save,
  ExternalLink,
  X,
  Eye,
  Globe2,
  RotateCcw,
} from "lucide-react";
import {
  duplicateOutletPageBlock,
  getBuilderViewportConfig,
  isOutletBuilderBusy,
  OUTLET_BUILDER_CLOSE_TRANSITION_MS,
  type BuilderConfirmationAction,
  type BuilderViewport,
  type BuilderPreviewMode,
} from "@/components/vendor/outlet-builder-ui";
import {
  getOutletBuilderDraftStorageKey,
  OUTLET_BUILDER_AUTOSAVE_DELAY_MS,
  parseOutletBuilderLocalDraft,
  serializeOutletBuilderLocalDraft,
  getOutletBuilderMediaUrls,
} from "@/components/vendor/outlet-builder-editing";
import { getOutletShopHref } from "@/lib/customer/shop-navigation";
import { GRID_COLS, firstFreeSlot, fits, gridRowCount } from "@/lib/vendor/outlet-grid";
import {
  createDefaultOutletPageDocument,
  createOutletPageBlock,
  type OutletPageBlock,
  type OutletPageBlockType,
  type OutletPageDocument,
} from "@/lib/vendor/outlet-page-schema";
import { sanitizeOutletPageProductSelections } from "@/lib/vendor/product-scope";
import {
  createHistory,
  type History,
} from "@/components/vendor/outlet-builder-history";
import OutletBuilderCanvas from "@/components/vendor/outlet-builder-canvas";
import OutletBuilderInspector from "@/components/vendor/outlet-builder-inspector";
import OutletBuilderPalette from "@/components/vendor/outlet-builder-palette";
import { OutletPageRenderer } from "@/components/outlet/outlet-page-renderer";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { useTranslation } from "react-i18next";
import { isAppLocale } from "@/lib/i18n/locale";
import { formatDateTime } from "@/lib/i18n/format";
import { FONT_FAMILY_LABELS } from "@/lib/i18n/invariant-tokens";

interface Props {
  vendorId: string;
  outletId: string;
  outletName: string;
  outletAddress?: string | null;
  outletCity?: string | null;
  outletState?: string | null;
  outletPhone?: string | null;
  onClose: () => void;
}
interface Product {
  id: string;
  name: string;
  base_price: number;
  cover_url?: string | null;
}

export default function OutletPageBuilder({
  vendorId,
  outletId,
  outletName,
  outletAddress,
  outletCity,
  outletState,
  outletPhone,
  onClose,
}: Props) {
  const { t, i18n } = useTranslation("vendor");
  const { t: tCommon } = useTranslation("common");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : "en";
  const historyRef = useRef<History<OutletPageDocument> | null>(null);
  const [document, setDocument] = useState<OutletPageDocument>(() =>
    createDefaultOutletPageDocument(outletName),
  );
  // operating_hours intentionally omitted — not in the outlets list API response; hours placeholder stays generic until that's added.
  const outletContext = {
    id: outletId,
    name: outletName,
    address: outletAddress,
    city: outletCity,
    state: outletState,
    phone: outletPhone,
  };
  const [products, setProducts] = useState<Product[]>([]);
  const [heroAiDraft, setHeroAiDraft] = useState<{ title: string; body: string; cta?: string } | null>(null);
  const [heroAiBusy, setHeroAiBusy] = useState(false);
  const [heroAiError, setHeroAiError] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>("hero");
  const [view, setView] = useState<BuilderViewport>("desktop");
  const [draftVersion, setDraftVersion] = useState(0);
  const [publishedDocument, setPublishedDocument] =
    useState<OutletPageDocument | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });
  const [previewMode, setPreviewMode] = useState<BuilderPreviewMode | null>(
    null,
  );
  const [confirmationAction, setConfirmationAction] =
    useState<BuilderConfirmationAction | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [closing, setClosing] = useState(false);
  const draftStorageKey = getOutletBuilderDraftStorageKey(vendorId, outletId);
  const { showFeedback } = useActionFeedback();

  function syncHistoryState() {
    setHistoryState({
      canUndo: Boolean(historyRef.current?.canUndo),
      canRedo: Boolean(historyRef.current?.canRedo),
    });
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/vendors/${vendorId}/outlets/${outletId}/page`, {
        cache: "no-store",
      }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(
            payload.error?.message || t("builder.loadFailed"),
          );
        return payload.data;
      }),
      fetch(
        `/api/vendors/${vendorId}/products?outlet_id=${outletId}&page=1&pageSize=24`,
        { cache: "no-store" },
      ).then((response) => response.json()),
    ])
      .then(([page, productPayload]) => {
        if (!active) return;
        const serverDraft =
          page?.draft || createDefaultOutletPageDocument(outletName);
        const serverDraftVersion = Number(page?.draftVersion || 0);
        const localDraft = parseOutletBuilderLocalDraft(
          window.localStorage.getItem(draftStorageKey),
        );
        const canRecover =
          localDraft?.pending === true &&
          localDraft.draftVersion === serverDraftVersion;
        const loaded = canRecover ? localDraft.document : serverDraft;
        const loadedProducts = (productPayload.data?.items || []).map((product: Product) => ({
          ...product,
          base_price: Number(product.base_price),
        }));
        const canSanitizeProductSelections =
          !productPayload.error && Array.isArray(productPayload.data?.items);
        const safeDocument = canSanitizeProductSelections
          ? sanitizeOutletPageProductSelections(
              loaded,
              new Set(loadedProducts.map((product: Product) => product.id)),
            )
          : loaded;
        const removedProductSelections =
          safeDocument.featuredIds.length !== loaded.featuredIds.length ||
          safeDocument.blocks.some(
            (block: OutletPageBlock, index: number) => block.productIds?.length !== loaded.blocks[index]?.productIds?.length,
          );
        const statusMessages = [
          canRecover ? t("builder.recoveredLocal") : "",
          removedProductSelections
            ? t("builder.removedUnavailableProducts")
            : "",
        ].filter(Boolean);
        setDocument(safeDocument);
        historyRef.current = createHistory(safeDocument);
        syncHistoryState();
        setDraftVersion(serverDraftVersion);
        setPublishedDocument(page?.isPublished ? page.published : null);
        setPublishedAt(page?.publishedAt || null);
        setDirty(canRecover || removedProductSelections);
        setMessage(statusMessages.join(" "));
        if (localDraft?.pending && !canRecover) {
          window.localStorage.removeItem(draftStorageKey);
        }
        setProducts(loadedProducts);
        setSelectedBlockId(safeDocument.hero.id);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : t("builder.loadFailed"),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [draftStorageKey, outletId, outletName, vendorId]);

  useEffect(() => {
    if (loading || !dirty) return;
    const timeout = window.setTimeout(() => {
      window.localStorage.setItem(
        draftStorageKey,
        serializeOutletBuilderLocalDraft(document, draftVersion),
      );
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [document, draftStorageKey, draftVersion, dirty, loading]);

  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  function commit(next: OutletPageDocument, coalesceKey?: string) {
    if (!historyRef.current) historyRef.current = createHistory(next);
    else historyRef.current.commit(next, coalesceKey);
    syncHistoryState();
    setDocument(next);
    setDirty(true);
    setMessage("");
    setError("");
  }

  function updateDocument(
    updater: (current: OutletPageDocument) => OutletPageDocument,
    coalesceKey?: string,
  ) {
    commit(updater(document), coalesceKey);
  }

  function addBlock(type: OutletPageBlockType, position?: { x: number; y: number }) {
    const created = createOutletPageBlock(type);
    // Search one screen deeper than the current grid so a full page still
    // finds room — gridRowCount already keeps spare rows below the lowest block.
    const rows = gridRowCount(document.blocks) + created.h;
    // A dropped position was measured against a provisional 4×2 ghost, so it
    // may not fit this type's real size — fall back to the first free slot.
    const dropped =
      position && fits(document.blocks, { ...position, w: created.w, h: created.h }, GRID_COLS, rows)
        ? position
        : null;
    const slot = dropped || firstFreeSlot(document.blocks, created.w, created.h, GRID_COLS, rows);
    if (!slot) {
      setError("No room left on the page. Remove or resize a section first.");
      return;
    }
    const block = { ...created, x: slot.x, y: slot.y };
    updateDocument((current) => ({ ...current, blocks: [...current.blocks, block] }));
    setSelectedBlockId(block.id);
  }

  function placeBlock(blockId: string, x: number, y: number) {
    updateDocument((current) => ({
      ...current,
      blocks: current.blocks.map((block) => (block.id === blockId ? { ...block, x, y } : block)),
    }));
  }

  function resizeBlock(blockId: string, w: number, h: number) {
    updateDocument((current) => ({
      ...current,
      blocks: current.blocks.map((block) => (block.id === blockId ? { ...block, w, h } : block)),
    }));
  }

  function deleteBlock(blockId: string) {
    updateDocument((current) => ({
      ...current,
      blocks: current.blocks.filter((block) => block.id !== blockId),
    }));
    if (selectedBlockId === blockId) setSelectedBlockId(document.hero.id);
  }

  function duplicateBlock(blockId: string) {
    const sourceIndex = document.blocks.findIndex((block) => block.id === blockId);
    const source = document.blocks[sourceIndex];
    if (!source || sourceIndex < 0) return;
    const nextBlock = duplicateOutletPageBlock(source);
    const rows = gridRowCount(document.blocks) + nextBlock.h;
    const slot = firstFreeSlot(document.blocks, nextBlock.w, nextBlock.h, GRID_COLS, rows);
    if (!slot) {
      setError("No room left on the page. Remove or resize a section first.");
      return;
    }
    const placed = { ...nextBlock, x: slot.x, y: slot.y };
    updateDocument((current) => ({
      ...current,
      blocks: [
        ...current.blocks.slice(0, sourceIndex + 1),
        placed,
        ...current.blocks.slice(sourceIndex + 1),
      ],
    }));
    setSelectedBlockId(placed.id);
  }

  function updateBlockById(
    blockId: string,
    updates: Partial<OutletPageBlock>,
    coalesceKey?: string,
  ) {
    updateDocument((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === blockId ? { ...block, ...updates } : block,
      ),
    }), coalesceKey);
  }

  function updateBlock(updates: Partial<OutletPageBlock>) {
    if (!selectedBlockId || selectedBlockId === document.hero.id) return;
    updateBlockById(
      selectedBlockId,
      updates,
      `inline:${selectedBlockId}:${Object.keys(updates).sort().join(",")}`,
    );
  }

  function updateHero(
    updates: Record<string, unknown>,
    coalesceKey?: string,
  ) {
    updateDocument((current) => ({
      ...current,
      hero: { ...current.hero, ...updates },
    }), coalesceKey);
  }

  function endInlineEdit() {
    historyRef.current?.endCoalescedCommit?.();
  }

  function updateGallery(gallery: OutletPageDocument["gallery"]) {
    updateDocument((current) => ({ ...current, gallery }));
  }

  async function generateHeroAiDraft() {
    setHeroAiBusy(true); setHeroAiError(null); setHeroAiDraft(null);
    try {
      const response = await fetch(`/api/vendors/${vendorId}/ai/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surface: "outlet_page",
          outletId,
          outletName,
          heroTitle: document.hero.title,
          heroBody: document.hero.body,
          productNames: products.map((product) => product.name).slice(0, 24),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || t("assistant.unavailable"));
      setHeroAiDraft(payload.data?.draft || null);
    } catch (reason) {
      setHeroAiError(reason instanceof Error ? reason.message : t("assistant.unavailable"));
    } finally { setHeroAiBusy(false); }
  }

  function undo() {
    if (!historyRef.current?.canUndo) return;
    setDocument(historyRef.current.undo());
    syncHistoryState();
    setDirty(true);
  }

  function redo() {
    if (!historyRef.current?.canRedo) return;
    setDocument(historyRef.current.redo());
    syncHistoryState();
    setDirty(true);
  }

  const saveDraft = useCallback(async (mode: "manual" | "auto" = "manual"): Promise<number | null> => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/vendors/${vendorId}/outlets/${outletId}/page`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            document,
            expectedDraftVersion: draftVersion,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error?.message || t("builder.saveFailed"));
      const saved = payload.data?.draft || document;
      const savedVersion = Number(
        payload.data?.draftVersion || draftVersion + 1,
      );
      setDocument(saved);
      setDraftVersion(savedVersion);
      setPublishedAt(payload.data?.publishedAt || publishedAt);
      setDirty(false);
      if (mode === "auto") {
        window.localStorage.setItem(
          draftStorageKey,
          serializeOutletBuilderLocalDraft(
            saved,
            savedVersion,
            Date.now(),
            false,
          ),
        );
      } else {
        window.localStorage.removeItem(draftStorageKey);
      }
      setMessage(
        mode === "auto"
          ? t("builder.autosaved")
          : t("builder.savedPublishHint"),
      );
      return savedVersion;
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("builder.saveFailed"),
      );
      return null;
    } finally {
      setSaving(false);
    }
  }, [document, draftStorageKey, draftVersion, outletId, publishedAt, vendorId]);

  useEffect(() => {
    if (loading || !dirty || saving || publishing) return;
    const timeout = window.setTimeout(() => {
      if (!saving) void saveDraft("auto");
    }, OUTLET_BUILDER_AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [document, dirty, loading, publishing, saveDraft, saving]);

  async function publish() {
    setPublishing(true);
    setError("");
    setMessage("");
    try {
      // Always persist the current canvas before publishing. This prevents a
      // recent edit from being skipped when the 8-second autosave already
      // changed dirty=false or when the autosave is between state updates.
      const savedVersion = await saveDraft();
      if (savedVersion === null) return;
      const expectedDraftVersion = savedVersion;
      const response = await fetch(
        `/api/vendors/${vendorId}/outlets/${outletId}/page/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedDraftVersion }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error?.message || t("builder.publishFailed"));
      setPublishedDocument(payload.data?.published || document);
      setDocument(payload.data?.draft || document);
      setDraftVersion(Number(payload.data?.draftVersion || draftVersion));
      setPublishedAt(payload.data?.publishedAt || new Date().toISOString());
      setDirty(false);
      window.localStorage.removeItem(draftStorageKey);
      const publishedVersion = payload.data?.publishedVersion || "latest";
      const publishedMessage = t("builder.published", { outlet: outletName, version: publishedVersion });
      setMessage(publishedMessage);
      showFeedback("success", publishedMessage, 6000);
    } catch (reason) {
      const publishError =
        reason instanceof Error ? reason.message : t("builder.publishFailed");
      setError(publishError);
      showFeedback("error", publishError);
    } finally {
      setPublishing(false);
    }
  }

  async function discardDraft() {
    setDiscarding(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/vendors/${vendorId}/outlets/${outletId}/page`,
        { method: "DELETE" },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error?.message || t("builder.discardFailed"));
      const resetDocument =
        payload.data?.draft ||
        publishedDocument ||
        createDefaultOutletPageDocument(outletName);
      historyRef.current = createHistory(resetDocument);
      syncHistoryState();
      setDocument(resetDocument);
      setDraftVersion(Number(payload.data?.draftVersion || draftVersion + 1));
      setPublishedDocument(payload.data?.published || publishedDocument);
      setPublishedAt(payload.data?.publishedAt || publishedAt);
      setDirty(false);
      setSelectedBlockId(resetDocument.hero.id);
      window.localStorage.removeItem(draftStorageKey);
      setMessage(t("builder.discarded"));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("builder.discardFailed"),
      );
    } finally {
      setDiscarding(false);
    }
  }

  function requestConfirmation(action: BuilderConfirmationAction) {
    setConfirmationAction(action);
  }

  async function confirmRequestedAction() {
    const action = confirmationAction;
    setConfirmationAction(null);
    if (action === "publish") await publish();
    if (action === "discard") await discardDraft();
  }

  const selectedBlock =
    selectedBlockId && selectedBlockId !== document.hero.id
      ? document.blocks.find((block) => block.id === selectedBlockId)
      : null;
  if (loading)
    return (
      <div className="rounded-2xl bg-white p-8 text-sm text-gray-500">
        {t("builder.loading")}
      </div>
    );

  const viewportConfig = getBuilderViewportConfig(view);

  function closeBuilder() {
    if (isOutletBuilderBusy({ saving, publishing, discarding, closing })) return;
    if (
      dirty &&
      !window.confirm(t("builder.closeConfirm"))
    ) {
      return;
    }
    setClosing(true);
    window.setTimeout(onClose, OUTLET_BUILDER_CLOSE_TRANSITION_MS);
  }

  return (
    <div
      className={`fixed inset-0 z-[60] bg-primary/45 p-0 transition-opacity duration-200 ease-out motion-reduce:transition-none sm:p-4 lg:p-8 ${closing ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <div
        className={`mx-auto flex h-full max-w-[1600px] flex-col overflow-hidden rounded-none bg-[#f8fafc] shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none sm:rounded-[28px] ${closing ? "scale-[0.99]" : "scale-100"}`}
      >
        <header className="flex shrink-0 flex-col gap-4 border-b border-primary/10 bg-primary px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
              {t("builder.studio")}
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">
              {outletName}
            </h2>
            <p className="mt-1 text-sm text-indigo-100/75">
              {t("builder.studioHint")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={!historyState.canUndo}
              className="rounded-xl p-2.5 text-indigo-100 hover:bg-white/10 disabled:opacity-40"
              aria-label={t("builder.undo")}
            >
              <Undo2 size={17} />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!historyState.canRedo}
              className="rounded-xl p-2.5 text-indigo-100 hover:bg-white/10 disabled:opacity-40"
              aria-label={t("builder.redo")}
            >
              <Redo2 size={17} />
            </button>
            <Link
              href={getOutletShopHref(outletId)}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 px-3 py-2.5 text-xs font-semibold text-white hover:bg-white/10"
            >
              {t("builder.viewPublicShop")} <ExternalLink size={14} />
            </Link>
            <button
              type="button"
              onClick={() => setPreviewMode("draft")}
              disabled={saving || publishing || discarding}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 px-3 py-2.5 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
            >
              <Eye size={14} /> {t("builder.draftPreview")}
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode("published")}
              disabled={!publishedDocument || saving || publishing || discarding}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 px-3 py-2.5 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
            >
              <Globe2 size={14} /> {t("builder.publishedPreview")}
            </button>
            <button
              type="button"
              onClick={() => requestConfirmation("discard")}
              disabled={!dirty || saving || publishing || discarding}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200/30 px-3 py-2.5 text-xs font-semibold text-red-100 hover:bg-red-500/20 disabled:opacity-40"
            >
              <RotateCcw size={14} /> {discarding ? t("builder.discarding") : t("builder.discardDraft")}
            </button>
            <button
              type="button"
              onClick={closeBuilder}
              disabled={saving || publishing || discarding || closing}
              className="rounded-xl p-2.5 text-indigo-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t("builder.close")}
            >
              <X size={18} />
            </button>
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={saving || publishing || !dirty}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <Save size={16} /> {saving ? t("builder.saving") : t("builder.saveDraft")}
            </button>
            <button
              type="button"
              onClick={() => requestConfirmation("publish")}
              disabled={saving || publishing || discarding}
              className="rounded-xl bg-[#FFCC00] px-4 py-2.5 text-sm font-bold text-primary disabled:opacity-50"
            >
              {publishing ? t("builder.publishing") : t("builder.publish")}
            </button>
          </div>
        </header>
        {confirmationAction && (
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-primary/45 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="outlet-builder-confirm-title"
              className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
            >
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                {t("builder.studio")}
              </p>
              <h3
                id="outlet-builder-confirm-title"
                className="mt-2 text-xl font-bold text-slate-900"
              >
                {confirmationAction === "publish" ? t("builder.confirm.publishTitle") : t("builder.confirm.discardTitle")}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {confirmationAction === "publish" ? t("builder.confirm.publishBody") : t("builder.confirm.discardBody")}
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmationAction(null)}
                  className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                >
                  {tCommon("actions.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void confirmRequestedAction()}
                  className={`rounded-xl px-4 py-2.5 text-sm font-bold text-white ${confirmationAction === "publish" ? "bg-primary" : "bg-red-600"}`}
                >
                  {confirmationAction === "publish" ? t("builder.confirm.publish") : t("builder.confirm.discard")}
                </button>
              </div>
            </div>
          </div>
        )}
        {previewMode && (
          <div className="fixed inset-0 z-[80] bg-primary/60 p-3 sm:p-8">
            <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-primary/10 bg-primary px-5 py-4 text-white sm:px-7">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
                    {previewMode === "draft" ? t("builder.draftPreview") : t("builder.publishedVersion")}
                  </p>
                  <p className="mt-1 text-sm text-indigo-100/80">
                    {previewMode === "draft"
                      ? t("builder.currentDraftHint")
                      : t("builder.currentPublishedHint")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewMode(null)}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold hover:bg-white/10"
                >
                  {t("builder.closePreview")} <X size={15} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8fafc]">
                {previewMode === "published" && !publishedDocument ? (
                  <div className="p-8 text-center text-sm text-gray-500">
                    {t("builder.publishFirstHint")}
                  </div>
                ) : (
                  <OutletPageRenderer
                    document={previewMode === "draft" ? document : publishedDocument!}
                    outlet={outletContext}
                    products={products}
                    mode="public"
                  />
                )}
              </div>
            </div>
          </div>
        )}
        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_minmax(0,42vh)] lg:grid-cols-[260px_minmax(0,1fr)_340px] lg:grid-rows-1">
          <div className="min-h-0 overflow-y-auto border-b border-primary/10 lg:border-b-0 lg:border-r">
            <OutletBuilderPalette
              onAddBlock={(type) => addBlock(type)}
              onBeginDrag={() => undefined}
            />
            <div className="border-t border-primary/10 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                {t("builder.pageSettings")}
              </p>
              <div className="mt-3 space-y-3">
                <label className="block text-xs font-semibold text-gray-600">
                  {t("builder.brandColour")}
                  <div className="mt-1 flex h-9 items-center gap-2 rounded-xl border border-gray-200 px-2">
                    <input
                      type="color"
                      value={document.brandColour}
                      onChange={(event) =>
                        updateDocument((current) => ({
                          ...current,
                          brandColour: event.target.value,
                        }))
                      }
                      className="h-6 w-8"
                    />
                    <span className="font-mono text-[10px] text-gray-500">
                      {document.brandColour}
                    </span>
                  </div>
                </label>
                <label className="block text-xs font-semibold text-gray-600">
                  {t("builder.font")}
                  <select
                    value={document.fontFamily}
                    onChange={(event) =>
                      updateDocument((current) => ({
                        ...current,
                        fontFamily: event.target.value,
                      }))
                    }
                    className="mt-1 h-9 w-full rounded-xl border border-gray-200 bg-white px-2 text-xs"
                  >
                    <option>{FONT_FAMILY_LABELS.plusJakartaSans}</option>
                    <option>{FONT_FAMILY_LABELS.fraunces}</option>
                    <option>{FONT_FAMILY_LABELS.ibmPlexMono}</option>
                    <option>{FONT_FAMILY_LABELS.georgia}</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold text-gray-600">
                  {t("builder.seoTitle")}
                  <input
                    value={document.seoTitle}
                    onChange={(event) =>
                      updateDocument((current) => ({
                        ...current,
                        seoTitle: event.target.value,
                      }))
                    }
                    className="mt-1 h-9 w-full rounded-xl border border-gray-200 px-2 text-xs"
                  />
                </label>
                <label className="block text-xs font-semibold text-gray-600">
                  {t("builder.seoDescription")}
                  <textarea
                    value={document.seoDescription}
                    onChange={(event) =>
                      updateDocument((current) => ({
                        ...current,
                        seoDescription: event.target.value,
                      }))
                    }
                    rows={3}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-2 py-1.5 text-xs"
                  />
                </label>
              </div>
            </div>
          </div>
          <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="flex shrink-0 flex-col gap-3 border-b border-primary/10 bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">
                  {t("builder.livePreview")}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {dirty
                    ? t("builder.unsavedChanges")
                    : publishedAt
                      ? t("builder.lastPublished", { date: formatDateTime(publishedAt, locale) })
                      : t("builder.draftPreview")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-gray-400">
                  {t(`builder.viewport.${view}`)}
                </span>
                <div className="flex rounded-xl bg-secondary p-1">
                <button
                  type="button"
                  onClick={() => setView("desktop")}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold ${view === "desktop" ? "bg-white text-primary shadow-sm" : "text-gray-400"}`}
                  aria-label={t("builder.desktopPreview")}
                >
                  <Monitor size={15} /> <span className="hidden xl:inline">{t("builder.desktop")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setView("tablet")}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold ${view === "tablet" ? "bg-white text-primary shadow-sm" : "text-gray-400"}`}
                  aria-label={t("builder.tabletPreview")}
                >
                  <Tablet size={15} /> <span className="hidden xl:inline">{t("builder.tablet")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setView("mobile")}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold ${view === "mobile" ? "bg-white text-primary shadow-sm" : "text-gray-400"}`}
                  aria-label={t("builder.mobilePreview")}
                >
                  <Smartphone size={15} /> <span className="hidden xl:inline">{t("builder.mobile")}</span>
                </button>
                </div>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <OutletBuilderCanvas
                vendorId={vendorId}
                document={document}
                outlet={outletContext}
                products={products}
                view={view}
                selectedBlockId={selectedBlockId}
                onSelect={setSelectedBlockId}
                onInsert={addBlock}
                onPlace={placeBlock}
                onResize={resizeBlock}
                onDelete={deleteBlock}
                onDuplicate={duplicateBlock}
                onEditHero={(updates) =>
                  updateHero(
                    updates,
                    `inline:hero:${Object.keys(updates).sort().join(",")}`,
                  )
                }
                onEditBlock={(blockId, updates) =>
                  updateBlockById(
                    blockId,
                    updates,
                    `inline:${blockId}:${Object.keys(updates).sort().join(",")}`,
                  )
                }
                onEndInlineEdit={endInlineEdit}
              />
            </div>
          </main>
          <OutletBuilderInspector
            vendorId={vendorId}
            outlet={outletContext}
            block={selectedBlock}
            blocks={document.blocks}
            hero={selectedBlockId === document.hero.id ? document.hero : null}
            gallery={document.gallery}
            products={products}
            mediaUrls={getOutletBuilderMediaUrls(document)}
            onUpdateBlock={updateBlock}
            onUpdateHero={updateHero}
            onUpdateGallery={updateGallery}
            heroAiDraft={heroAiDraft}
            heroAiBusy={heroAiBusy}
            heroAiError={heroAiError}
            onGenerateHeroAi={() => void generateHeroAiDraft()}
            onApplyHeroAi={() => { if (heroAiDraft) updateHero(heroAiDraft); setHeroAiDraft(null); }}
            onDiscardHeroAi={() => setHeroAiDraft(null)}
          />
        </div>
        {(message || error) && (
          <div
            className={`border-t px-5 py-3 text-sm font-semibold ${error ? "border-red-100 bg-red-50 text-red-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}
          >
            {error || message}
          </div>
        )}
      </div>
    </div>
  );
}
