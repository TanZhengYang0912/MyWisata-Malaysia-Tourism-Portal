"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Monitor,
  Redo2,
  Save,
  Smartphone,
  Undo2,
  X,
} from "lucide-react";
import { getOutletShopHref } from "@/lib/customer/shop-navigation";
import {
  createDefaultOutletPageDocument,
  createOutletPageBlock,
  type OutletPageBlock,
  type OutletPageBlockType,
  type OutletPageDocument,
} from "@/lib/vendor/outlet-page-schema";
import {
  createHistory,
  type History,
} from "@/components/vendor/outlet-builder-history";
import OutletBuilderCanvas from "@/components/vendor/outlet-builder-canvas";
import OutletBuilderInspector from "@/components/vendor/outlet-builder-inspector";
import OutletBuilderPalette from "@/components/vendor/outlet-builder-palette";

interface Props {
  vendorId: string;
  outletId: string;
  outletName: string;
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
  onClose,
}: Props) {
  const historyRef = useRef<History<OutletPageDocument> | null>(null);
  const [document, setDocument] = useState<OutletPageDocument>(() =>
    createDefaultOutletPageDocument(outletName),
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>("hero");
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const [draftVersion, setDraftVersion] = useState(0);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/vendors/${vendorId}/outlets/${outletId}/page`, {
        cache: "no-store",
      }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(
            payload.error?.message || "Could not load outlet page",
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
        const loaded =
          page?.draft || createDefaultOutletPageDocument(outletName);
        setDocument(loaded);
        historyRef.current = createHistory(loaded);
        setDraftVersion(Number(page?.draftVersion || 0));
        setPublishedAt(page?.publishedAt || null);
        setProducts(
          (productPayload.data?.items || []).map((product: Product) => ({
            ...product,
            base_price: Number(product.base_price),
          })),
        );
        setSelectedBlockId(loaded.hero.id);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load outlet page",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [outletId, outletName, vendorId]);

  function commit(next: OutletPageDocument) {
    if (!historyRef.current) historyRef.current = createHistory(next);
    else historyRef.current.commit(next);
    setDocument(next);
    setDirty(true);
    setMessage("");
    setError("");
  }

  function updateDocument(
    updater: (current: OutletPageDocument) => OutletPageDocument,
  ) {
    commit(updater(document));
  }

  function addBlock(type: OutletPageBlockType, index = document.blocks.length) {
    const block = createOutletPageBlock(type);
    updateDocument((current) => ({
      ...current,
      blocks: [
        ...current.blocks.slice(0, index),
        block,
        ...current.blocks.slice(index),
      ],
    }));
    setSelectedBlockId(block.id);
  }

  function moveBlock(blockId: string, targetIndex: number) {
    updateDocument((current) => {
      const sourceIndex = current.blocks.findIndex(
        (block) => block.id === blockId,
      );
      if (sourceIndex < 0) return current;
      const next = [...current.blocks];
      const [moved] = next.splice(sourceIndex, 1);
      const adjustedIndex =
        sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      next.splice(Math.max(0, Math.min(adjustedIndex, next.length)), 0, moved);
      return { ...current, blocks: next };
    });
  }

  function deleteBlock(blockId: string) {
    updateDocument((current) => ({
      ...current,
      blocks: current.blocks.filter((block) => block.id !== blockId),
    }));
    if (selectedBlockId === blockId) setSelectedBlockId(document.hero.id);
  }

  function updateBlock(updates: Partial<OutletPageBlock>) {
    if (!selectedBlockId || selectedBlockId === document.hero.id) return;
    updateDocument((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === selectedBlockId ? { ...block, ...updates } : block,
      ),
    }));
  }

  function updateHero(updates: Record<string, unknown>) {
    updateDocument((current) => ({
      ...current,
      hero: { ...current.hero, ...updates },
    }));
  }

  function updateGallery(gallery: OutletPageDocument["gallery"]) {
    updateDocument((current) => ({ ...current, gallery }));
  }

  function undo() {
    if (!historyRef.current?.canUndo) return;
    setDocument(historyRef.current.undo());
    setDirty(true);
  }

  function redo() {
    if (!historyRef.current?.canRedo) return;
    setDocument(historyRef.current.redo());
    setDirty(true);
  }

  async function saveDraft(): Promise<boolean> {
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
        throw new Error(payload.error?.message || "Could not save draft");
      const saved = payload.data?.draft || document;
      setDocument(saved);
      setDraftVersion(Number(payload.data?.draftVersion || draftVersion + 1));
      setPublishedAt(payload.data?.publishedAt || publishedAt);
      setDirty(false);
      setMessage("Draft saved. Publish when you are ready.");
      historyRef.current = createHistory(saved);
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save draft",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setPublishing(true);
    setError("");
    setMessage("");
    try {
      if (dirty && !(await saveDraft())) return;
      const response = await fetch(
        `/api/vendors/${vendorId}/outlets/${outletId}/page/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedDraftVersion: draftVersion }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error?.message || "Could not publish page");
      setDocument(payload.data?.draft || document);
      setDraftVersion(Number(payload.data?.draftVersion || draftVersion));
      setPublishedAt(payload.data?.publishedAt || new Date().toISOString());
      setDirty(false);
      setMessage("Published. Open the public shop to verify the live page.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not publish page",
      );
    } finally {
      setPublishing(false);
    }
  }

  const selectedBlock =
    selectedBlockId && selectedBlockId !== document.hero.id
      ? document.blocks.find((block) => block.id === selectedBlockId)
      : null;
  if (loading)
    return (
      <div className="rounded-2xl bg-white p-8 text-sm text-gray-500">
        Loading Outlet Studio…
      </div>
    );

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-primary/45 p-4 sm:p-8">
      <div className="mx-auto max-w-[1500px] overflow-hidden rounded-[28px] bg-[#f8fafc] shadow-2xl">
        <header className="flex flex-col gap-4 border-b border-primary/10 bg-primary px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
              Outlet studio
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">
              {outletName}
            </h2>
            <p className="mt-1 text-sm text-indigo-100/75">
              Build the shop page travellers see.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={!historyRef.current?.canUndo}
              className="rounded-xl p-2.5 text-indigo-100 hover:bg-white/10 disabled:opacity-40"
              aria-label="Undo"
            >
              <Undo2 size={17} />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!historyRef.current?.canRedo}
              className="rounded-xl p-2.5 text-indigo-100 hover:bg-white/10 disabled:opacity-40"
              aria-label="Redo"
            >
              <Redo2 size={17} />
            </button>
            <Link
              href={getOutletShopHref(outletId)}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 px-3 py-2.5 text-xs font-semibold text-white hover:bg-white/10"
            >
              View public shop <ExternalLink size={14} />
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2.5 text-indigo-100 hover:bg-white/10"
              aria-label="Close page builder"
            >
              <X size={18} />
            </button>
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={saving || publishing || !dirty}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <Save size={16} /> {saving ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              onClick={() => void publish()}
              disabled={saving || publishing}
              className="rounded-xl bg-[#FFCC00] px-4 py-2.5 text-sm font-bold text-primary disabled:opacity-50"
            >
              {publishing ? "Publishing…" : "Publish"}
            </button>
          </div>
        </header>
        <div className="grid lg:grid-cols-[260px_minmax(0,1fr)_320px]">
          <div className="border-b border-primary/10 lg:border-b-0 lg:border-r">
            <OutletBuilderPalette
              onAddBlock={(type) => addBlock(type)}
              onBeginDrag={() => undefined}
            />
            <div className="border-t border-primary/10 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                Page settings
              </p>
              <div className="mt-3 space-y-3">
                <label className="block text-xs font-semibold text-gray-600">
                  Brand colour
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
                  Font
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
                    <option>Plus Jakarta Sans</option>
                    <option>Fraunces</option>
                    <option>IBM Plex Mono</option>
                    <option>Georgia</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold text-gray-600">
                  SEO title
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
                  SEO description
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
          <main className="min-h-[780px]">
            <div className="flex items-center justify-between border-b border-primary/10 bg-white px-5 py-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">
                  Live preview
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {dirty
                    ? "Unsaved changes"
                    : publishedAt
                      ? `Last published ${new Date(publishedAt).toLocaleString()}`
                      : "Draft preview"}
                </p>
              </div>
              <div className="flex rounded-xl bg-secondary p-1">
                <button
                  type="button"
                  onClick={() => setView("desktop")}
                  className={`rounded-lg p-2 ${view === "desktop" ? "bg-white text-primary shadow-sm" : "text-gray-400"}`}
                  aria-label="Desktop preview"
                >
                  <Monitor size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setView("mobile")}
                  className={`rounded-lg p-2 ${view === "mobile" ? "bg-white text-primary shadow-sm" : "text-gray-400"}`}
                  aria-label="Mobile preview"
                >
                  <Smartphone size={16} />
                </button>
              </div>
            </div>
            <OutletBuilderCanvas
              document={document}
              outlet={{ id: outletId, name: outletName }}
              products={products}
              view={view}
              selectedBlockId={selectedBlockId}
              onSelect={setSelectedBlockId}
              onInsert={addBlock}
              onMove={moveBlock}
              onDelete={deleteBlock}
            />
          </main>
          <OutletBuilderInspector
            vendorId={vendorId}
            block={selectedBlock}
            hero={selectedBlockId === document.hero.id ? document.hero : null}
            gallery={document.gallery}
            products={products}
            onUpdateBlock={updateBlock}
            onUpdateHero={updateHero}
            onUpdateGallery={updateGallery}
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
