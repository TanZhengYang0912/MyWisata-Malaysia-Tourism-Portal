'use client';

import { AlertCircle, Check, CheckCircle2, ChevronDown, Copy, Eye, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '@/lib/i18n/format';
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from '@/lib/i18n/locale';
import { DEMO_VOUCHER_PREFIX } from '@/lib/i18n/invariant-tokens';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  emptyVoucherCsvDraft,
  previewVoucherCodes,
  validateVoucherCsvDrafts,
  type VoucherCsvDraft,
} from '@/lib/vendor/voucher-csv-builder';
import {
  getVoucherCsvDraftBlockingError,
  normalizeVoucherCsvDraft,
  summarizeVoucherCsvDraft,
  type VoucherCsvDraftDocument,
} from '@/lib/vendor/voucher-csv-draft';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getMalaysiaDateTimeRangeDefaults } from '@/lib/datetime/date-input';
import { useAppDialog } from '@/components/providers/app-dialog';

interface Option { id: string; name: string }

export interface VoucherCsvDraftRecord {
  id: string;
  title: string;
  document: VoucherCsvDraftDocument;
  draftVersion: number;
  updatedAt: string;
}

interface Props {
  open: boolean;
  outlets: Option[];
  products: Option[];
  isOutletManager?: boolean;
  assignedOutletId?: string;
  drafts: VoucherCsvDraftRecord[];
  initialDraft?: VoucherCsvDraftRecord | null;
  onLoadDraft: (id: string) => Promise<VoucherCsvDraftRecord | null>;
  onSaveDraft: (input: { id?: string; document: VoucherCsvDraftDocument; expectedDraftVersion?: number }) => Promise<VoucherCsvDraftRecord | null>;
  onDeleteDraft: (id: string) => Promise<boolean>;
  onBack: () => void;
  onUseCsv: (document: VoucherCsvDraftDocument, draftId?: string) => void;
}

const tableColumns = 'grid-cols-[40px_115px_210px_135px_100px_110px_115px_115px_150px_150px_140px_140px_80px_80px]';
const inputClass = 'h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100';
const selectClass = `${inputClass} appearance-none pr-7`;
export const VOUCHER_CSV_AUTOSAVE_DELAY_MS = 8000;

function blankDocument(title: string): VoucherCsvDraftDocument {
  return { title, rows: [defaultVoucherCsvDraft()], autoGenerate: true, codePrefix: 'TRAVEL' };
}

function defaultVoucherCsvDraft(): VoucherCsvDraft {
  const defaults = getMalaysiaDateTimeRangeDefaults();
  return { ...emptyVoucherCsvDraft(), validFrom: defaults.from, validUntil: defaults.to };
}

function scopeDocument(document: VoucherCsvDraftDocument, isOutletManager: boolean, assignedOutletId?: string) {
  if (!isOutletManager || !assignedOutletId) return document;
  return { ...document, rows: document.rows.map((row) => ({ ...row, outletId: assignedOutletId })) };
}

function formatSavedAt(value: string | undefined, locale: AppLocale, translate: TFunction) {
  if (!value) return translate('voucher.csv.notSaved');
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  return translate('voucher.csv.savedAt', { time });
}

export default function VoucherCsvBuilder({
  open,
  outlets,
  products,
  isOutletManager = false,
  assignedOutletId,
  drafts,
  initialDraft,
  onLoadDraft,
  onSaveDraft,
  onDeleteDraft,
  onBack,
  onUseCsv,
}: Props) {
  const { t, i18n } = useTranslation('vendor');
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const assignedOutlet = outlets.find((outlet) => outlet.id === assignedOutletId);
  const [document, setDocument] = useState<VoucherCsvDraftDocument>(() => scopeDocument(initialDraft?.document || blankDocument(t('voucher.csv.untitledBatch')), isOutletManager, assignedOutletId));
  const [draftId, setDraftId] = useState(initialDraft?.id);
  const [draftVersion, setDraftVersion] = useState(initialDraft?.draftVersion);
  const [savedAt, setSavedAt] = useState(initialDraft?.updatedAt);
  const [dirty, setDirty] = useState(!initialDraft);
  const [saving, setSaving] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { confirm } = useAppDialog();
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [rowErrors, setRowErrors] = useState<Record<number, string[]>>({});
  const [previewOpen, setPreviewOpen] = useState(false);

  const summary = useMemo(() => summarizeVoucherCsvDraft(document), [document]);
  const codePreview = useMemo(() => {
    if (!document.autoGenerate || !document.codePrefix || summary.blankCodes === 0) return null;
    try { return previewVoucherCodes(document.rows, document.codePrefix); } catch { return null; }
  }, [document, summary.blankCodes]);

  const updateDocument = useCallback((update: (current: VoucherCsvDraftDocument) => VoucherCsvDraftDocument) => {
    setDocument((current) => scopeDocument(update(current), isOutletManager, assignedOutletId));
    setDirty(true);
    setMessage('');
  }, [assignedOutletId, isOutletManager]);

  function updateRow(index: number, field: keyof VoucherCsvDraft, value: string) {
    updateDocument((current) => ({ ...current, rows: current.rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row) }));
    setRowErrors((current) => { const next = { ...current }; delete next[index]; return next; });
  }

  function addRow(copyFrom?: VoucherCsvDraft) {
    updateDocument((current) => ({ ...current, rows: [...current.rows, copyFrom ? { ...copyFrom, code: '' } : defaultVoucherCsvDraft()] }));
  }

  function removeRows(indexes: number[]) {
    if (!indexes.length || document.rows.length <= 1) return;
    const removeSet = new Set(indexes);
    updateDocument((current) => ({ ...current, rows: current.rows.filter((_, index) => !removeSet.has(index)) }));
    setSelectedRows([]);
    setRowErrors({});
  }

  async function loadDraft(id: string) {
    setLoadingDraft(true);
    setError('');
    try {
      const loaded = await onLoadDraft(id);
      if (!loaded) return;
      setDocument(scopeDocument(loaded.document, isOutletManager, assignedOutletId));
      setDraftId(loaded.id);
      setDraftVersion(loaded.draftVersion);
      setSavedAt(loaded.updatedAt);
      setDirty(false);
      setSelectedRows([]);
      setRowErrors({});
      setMessage(t('voucher.csv.draftLoaded'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('voucher.csv.loadFailed'));
    } finally {
      setLoadingDraft(false);
    }
  }

  const saveDraft = useCallback(async (exitAfterSave = false) => {
    setSaving(true);
    setError('');
    try {
      const saved = await onSaveDraft({ id: draftId, document: normalizeVoucherCsvDraft(scopeDocument(document, isOutletManager, assignedOutletId)), expectedDraftVersion: draftVersion });
      if (!saved) return false;
      setDocument(scopeDocument(saved.document, isOutletManager, assignedOutletId));
      setDraftId(saved.id);
      setDraftVersion(saved.draftVersion);
      setSavedAt(saved.updatedAt);
      setDirty(false);
      setMessage(t('voucher.csv.draftSaved'));
      if (exitAfterSave) onBack();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('voucher.csv.saveFailed'));
      return false;
    } finally {
      setSaving(false);
    }
  }, [assignedOutletId, document, draftId, draftVersion, isOutletManager, onBack, onSaveDraft, t]);

  useEffect(() => {
    if (!open || !dirty || saving || previewOpen) return;
    const timeout = window.setTimeout(() => { void saveDraft(); }, VOUCHER_CSV_AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [dirty, open, previewOpen, saveDraft, saving]);

  function requestPreview() {
    const nextErrors = validateVoucherCsvDrafts(document.rows);
    if (Object.keys(nextErrors).length) {
      setRowErrors(nextErrors);
      setError(getVoucherCsvDraftBlockingError(document) || t('voucher.csv.fixRows'));
      return;
    }
    const blockingError = getVoucherCsvDraftBlockingError(document);
    if (blockingError) { setError(blockingError); return; }
    setRowErrors({});
    setError('');
    setPreviewOpen(true);
  }

  async function closeBuilder() {
    if (dirty && !(await confirm(t('voucher.csv.leaveUnsavedConfirm')))) return;
    onBack();
  }

  async function discardDraft() {
    if (!draftId || !(await confirm(t('voucher.csv.discardConfirm')))) return;
    if (await onDeleteDraft(draftId)) {
      setDocument(scopeDocument(blankDocument(t('voucher.csv.untitledBatch')), isOutletManager, assignedOutletId));
      setDraftId(undefined);
      setDraftVersion(undefined);
      setSavedAt(undefined);
      setDirty(true);
      setMessage(t('voucher.csv.draftDiscarded'));
    }
  }

  function renderSelectOptions(options: Option[], emptyLabel: string) {
    return <><option value="">{emptyLabel}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</>;
  }

  function rowStatus(index: number) {
    return rowErrors[index]?.length ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={13} /> {t('voucher.csv.fixRow')}</span> : <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><CheckCircle2 size={13} /> {t('voucher.csv.ready')}</span>;
  }

  function renderMobileRow(row: VoucherCsvDraft, index: number) {
    const errors = rowErrors[index] || [];
    return <article key={`mobile-${index}`} className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-amber-700">{t('voucher.csv.voucherNumber', { number: index + 1 })}</p><div className="mt-1">{rowStatus(index)}</div></div><input type="checkbox" checked={selectedRows.includes(index)} onChange={() => setSelectedRows((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])} aria-label={t('voucher.csv.selectVoucher', { number: index + 1 })} /></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-gray-700 sm:col-span-2">{t('voucher.csv.voucherName')} *<Input value={row.name} onChange={(event) => updateRow(index, 'name', event.target.value)} placeholder={t('voucher.csv.exampleVoucher')} className="mt-1 bg-white" /></label>
        <label className="text-xs font-semibold text-gray-700">{t('voucher.csv.code')}<Input value={row.code} onChange={(event) => updateRow(index, 'code', event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 50))} placeholder={t('voucher.csv.autoGenerated')} className="mt-1 bg-white font-mono uppercase" /></label>
        <label className="text-xs font-semibold text-gray-700">{t('voucher.csv.type')}<select value={row.voucherType} onChange={(event) => updateRow(index, 'voucherType', event.target.value as VoucherCsvDraft['voucherType'])} className={`mt-1 ${selectClass}`}>{renderSelectOptions([{ id: 'fixed', name: t('voucher.form.fixedAmount') }, { id: 'percent', name: t('voucher.form.percentage') }, { id: 'bogo', name: t('voucher.form.buyOneGetOne') }], '')}</select></label>
        {row.voucherType !== 'bogo' && <label className="text-xs font-semibold text-gray-700">{t('voucher.csv.discountValue')} *<Input value={row.discountValue} onChange={(event) => updateRow(index, 'discountValue', event.target.value)} type="number" min="0.01" step="0.01" placeholder="10" className="mt-1 bg-white" /></label>}
        <label className="text-xs font-semibold text-gray-700">{t('voucher.csv.minimumSpend')}<Input value={row.minSpend} onChange={(event) => updateRow(index, 'minSpend', event.target.value)} type="number" min="0" step="0.01" className="mt-1 bg-white" /></label>
        <label className="text-xs font-semibold text-gray-700">{t('voucher.csv.totalUses')}<Input value={row.maxUses} onChange={(event) => updateRow(index, 'maxUses', event.target.value)} type="number" min="1" placeholder={t('voucher.csv.unlimited')} className="mt-1 bg-white" /></label>
        <label className="text-xs font-semibold text-gray-700">{t('voucher.csv.perCustomer')}<Input value={row.perCustomerLimit} onChange={(event) => updateRow(index, 'perCustomerLimit', event.target.value)} type="number" min="1" placeholder={t('voucher.csv.unlimited')} className="mt-1 bg-white" /></label>
        <label className="text-xs font-semibold text-gray-700">{t('voucher.csv.validFrom')}<input value={row.validFrom} onChange={(event) => updateRow(index, 'validFrom', event.target.value)} type="datetime-local" className={inputClass} /></label>
        <label className="text-xs font-semibold text-gray-700">{t('voucher.csv.validUntil')}<input value={row.validUntil} min={row.validFrom || undefined} onChange={(event) => updateRow(index, 'validUntil', event.target.value)} type="datetime-local" className={inputClass} /></label>
        <label className="text-xs font-semibold text-gray-700">{t('voucher.csv.outlet')}{isOutletManager ? <span className={`${inputClass} mt-1 flex items-center bg-gray-50 text-gray-600`}>{assignedOutlet?.name || t('voucher.form.assignedOutlet')}</span> : <select value={row.outletId} onChange={(event) => updateRow(index, 'outletId', event.target.value)} className={selectClass}>{renderSelectOptions(outlets, t('voucher.csv.allOutlets'))}</select>}</label>
        <label className="text-xs font-semibold text-gray-700">{t('voucher.csv.product')}<select value={row.productId} onChange={(event) => updateRow(index, 'productId', event.target.value)} className={selectClass}>{renderSelectOptions(products, t('voucher.csv.allProducts'))}</select></label>
        {row.voucherType === 'bogo' && <><label className="text-xs font-semibold text-gray-700">{t('voucher.csv.buy')} *<Input value={row.buyQuantity} onChange={(event) => updateRow(index, 'buyQuantity', event.target.value)} type="number" min="1" step="1" className="mt-1 bg-white" /></label><label className="text-xs font-semibold text-gray-700">{t('voucher.csv.free')} *<Input value={row.freeQuantity} onChange={(event) => updateRow(index, 'freeQuantity', event.target.value)} type="number" min="1" step="1" className="mt-1 bg-white" /></label></>}
      </div>
      {errors.length > 0 && <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{errors.join(' ')}</div>}
    </article>;
  }

  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) closeBuilder(); }}>
    <DialogContent className="min-w-0 max-h-[96vh] w-[96vw] !max-w-[1800px] overflow-hidden rounded-2xl border-amber-100 p-0">
      <div className="flex min-w-0 max-h-[96vh] flex-col">
        <DialogHeader className="min-w-0 border-b border-gray-100 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4 pr-8">
            <div><DialogTitle className="text-xl text-gray-950">{t('voucher.csv.title')}</DialogTitle><DialogDescription className="mt-1 max-w-3xl leading-6 text-gray-600">{t('voucher.csv.description')}</DialogDescription></div>
            <div className="flex items-center gap-2 text-xs text-gray-500"><span className={dirty ? 'text-amber-700' : 'text-emerald-700'}>{dirty ? t('voucher.csv.unsavedChanges') : <><Check size={13} className="mr-1 inline" />{formatSavedAt(savedAt, locale, t)}</>}</span><span className="rounded-full bg-gray-100 px-2.5 py-1 font-semibold text-gray-600">{t('voucher.csv.rows', { count: formatNumber(summary.total, locale) })}</span></div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Input value={document.title} onChange={(event) => updateDocument((current) => ({ ...current, title: event.target.value }))} placeholder={t('voucher.csv.campaignName')} className="h-9 w-64 border-amber-200 text-sm font-semibold" aria-label={t('voucher.csv.draftName')} />
            {drafts.length > 0 && <label className="relative"><span className="sr-only">{t('voucher.csv.openSavedDraft')}</span><select disabled={loadingDraft} value={draftId || ''} onChange={(event) => { if (event.target.value) void loadDraft(event.target.value); }} className="h-9 appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 text-xs font-semibold text-gray-700"><option value="">{t('voucher.csv.openDraft')}</option>{drafts.map((draft) => <option key={draft.id} value={draft.id}>{draft.title} · {formatSavedAt(draft.updatedAt, locale, t)}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" /></label>}
            <label className="ml-auto inline-flex items-center gap-2 text-xs font-semibold text-gray-700"><input type="checkbox" checked={document.autoGenerate} onChange={(event) => updateDocument((current) => ({ ...current, autoGenerate: event.target.checked }))} /> {t('voucher.csv.generateBlankCodes')}</label>
            {document.autoGenerate && <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">{t('voucher.csv.prefix')}<input value={document.codePrefix} onChange={(event) => updateDocument((current) => ({ ...current, codePrefix: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) }))} className="h-9 w-28 rounded-lg border border-amber-200 bg-white px-2 font-mono text-xs uppercase outline-none focus:ring-2 focus:ring-amber-100" placeholder={DEMO_VOUCHER_PREFIX} /></label>}
          </div>
        </DialogHeader>

        {error && <div role="alert" className="mx-6 mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</div>}
        {message && <div className="mx-6 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"><CheckCircle2 size={16} className="mr-1 inline" />{message}</div>}

        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><p className="text-xs text-gray-500"><span className="font-semibold text-gray-800">{t('voucher.csv.readyCount', { count: formatNumber(summary.valid, locale) })}</span> · <span className={summary.errors ? 'font-semibold text-red-600' : ''}>{t('voucher.csv.attentionCount', { count: formatNumber(summary.errors, locale) })}</span> · {t('voucher.csv.blankCodesCount', { count: formatNumber(summary.blankCodes, locale) })}</p><p className="hidden text-[11px] text-gray-400 md:block">{t('voucher.csv.scrollFields')}</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => addRow()}><Plus size={14} /> {t('voucher.csv.addRow')}</Button><Button type="button" variant="outline" size="sm" disabled={!selectedRows.length} onClick={() => addRow(document.rows[selectedRows[0]])}><Copy size={14} /> {t('voucher.csv.duplicate')}</Button><Button type="button" variant="outline" size="sm" disabled={!selectedRows.length || document.rows.length <= 1} onClick={() => removeRows(selectedRows)}><Trash2 size={14} /> {t('voucher.csv.delete')}</Button></div></div>

          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 md:block" role="region" aria-label={t('voucher.csv.spreadsheet')} tabIndex={0}>
            <div className={`grid min-w-[1748px] ${tableColumns} gap-1 border-b border-gray-200 bg-gray-50/90 px-2 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-gray-500`}>
              <span className="sticky left-0 z-10 bg-gray-50/90">#</span><span className="sticky left-[40px] z-10 bg-gray-50/90">{t('voucher.csv.code')}</span><span className="sticky left-[155px] z-10 bg-gray-50/90">{t('voucher.csv.voucherName')} *</span><span>{t('voucher.csv.type')}</span><span>{t('voucher.csv.value')} *</span><span>{t('voucher.csv.minimumSpend')}</span><span>{t('voucher.csv.totalUses')}</span><span>{t('voucher.csv.perCustomer')}</span><span>{t('voucher.csv.validFrom')}</span><span>{t('voucher.csv.validUntil')}</span><span>{t('voucher.csv.outlet')}</span><span>{t('voucher.csv.product')}</span><span>{t('voucher.csv.buy')}</span><span>{t('voucher.csv.free')}</span>
            </div>
            {document.rows.map((row, index) => <div key={index} className={`grid min-w-[1748px] ${tableColumns} items-start gap-1 border-b border-gray-100 px-2 py-2 last:border-0 ${rowErrors[index]?.length ? 'bg-red-50/30' : 'bg-white'}`}>
              <div className="sticky left-0 z-10 flex items-center gap-1 bg-inherit pt-2"><input type="checkbox" checked={selectedRows.includes(index)} onChange={() => setSelectedRows((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])} aria-label={t('voucher.csv.selectRow', { number: index + 1 })} /><span className="text-xs font-semibold text-gray-500">{index + 1}</span></div>
              <div className="sticky left-[40px] z-10 bg-inherit"><Input value={row.code} onChange={(event) => updateRow(index, 'code', event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 50))} placeholder={t('voucher.csv.auto')} className={`${inputClass} font-mono uppercase`} /></div>
              <div className="sticky left-[155px] z-10 bg-inherit"><Input value={row.name} onChange={(event) => updateRow(index, 'name', event.target.value)} placeholder={t('voucher.csv.exampleVoucher')} className={inputClass} />{rowErrors[index]?.length ? <p className="mt-1 text-[10px] text-red-600">{rowErrors[index].join(' ')}</p> : <p className="mt-1 text-[10px] text-emerald-600">{t('voucher.csv.ready')}</p>}</div>
              <select value={row.voucherType} onChange={(event) => updateRow(index, 'voucherType', event.target.value as VoucherCsvDraft['voucherType'])} className={selectClass}><option value="fixed">{t('voucher.form.fixedAmount')}</option><option value="percent">{t('voucher.form.percentage')}</option><option value="bogo">{t('voucher.form.buyOneGetOneShort')}</option></select>
              <Input value={row.discountValue} onChange={(event) => updateRow(index, 'discountValue', event.target.value)} disabled={row.voucherType === 'bogo'} type="number" min="0.01" step="0.01" placeholder={row.voucherType === 'percent' ? '15%' : row.voucherType === 'bogo' ? t('voucher.csv.auto') : '10'} className={`${inputClass} disabled:bg-gray-100 disabled:text-gray-400`} />
              <Input value={row.minSpend} onChange={(event) => updateRow(index, 'minSpend', event.target.value)} type="number" min="0" step="0.01" className={inputClass} />
              <Input value={row.maxUses} onChange={(event) => updateRow(index, 'maxUses', event.target.value)} type="number" min="1" placeholder={t('voucher.csv.unlimited')} className={inputClass} />
              <Input value={row.perCustomerLimit} onChange={(event) => updateRow(index, 'perCustomerLimit', event.target.value)} type="number" min="1" placeholder={t('voucher.csv.unlimited')} className={inputClass} />
              <input value={row.validFrom} onChange={(event) => updateRow(index, 'validFrom', event.target.value)} type="datetime-local" className={inputClass} />
              <input value={row.validUntil} min={row.validFrom || undefined} onChange={(event) => updateRow(index, 'validUntil', event.target.value)} type="datetime-local" className={inputClass} />
              {isOutletManager ? <div className={`${inputClass} flex items-center bg-gray-50 text-gray-600`}>{assignedOutlet?.name || t('voucher.form.assignedOutlet')}</div> : <select value={row.outletId} onChange={(event) => updateRow(index, 'outletId', event.target.value)} className={selectClass}>{renderSelectOptions(outlets, t('voucher.csv.allOutlets'))}</select>}
              <select value={row.productId} onChange={(event) => updateRow(index, 'productId', event.target.value)} className={selectClass}>{renderSelectOptions(products, t('voucher.csv.allProducts'))}</select>
              <Input value={row.buyQuantity} onChange={(event) => updateRow(index, 'buyQuantity', event.target.value)} disabled={row.voucherType !== 'bogo'} type="number" min="1" className={`${inputClass} disabled:bg-gray-100`} />
              <Input value={row.freeQuantity} onChange={(event) => updateRow(index, 'freeQuantity', event.target.value)} disabled={row.voucherType !== 'bogo'} type="number" min="1" className={`${inputClass} disabled:bg-gray-100`} />
            </div>)}
          </div>
          <div className="space-y-3 md:hidden">{document.rows.map(renderMobileRow)}</div>
          <button type="button" onClick={() => addRow()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/40 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50"><Plus size={15} /> {t('voucher.csv.addAnotherRow')}</button>
        </div>

        <div className="min-w-0 flex flex-wrap items-center gap-2 border-t border-gray-100 bg-white px-6 py-4">
          <Button type="button" variant="outline" onClick={closeBuilder}>{t('actions.back')}</Button>
          {draftId && <Button type="button" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" disabled={saving} onClick={() => void discardDraft()}>{t('voucher.csv.discardDraft')}</Button>}
            <span className="ml-auto text-xs text-gray-500">{saving ? <><Loader2 size={13} className="mr-1 inline animate-spin" />{t('actions.saving')}</> : dirty ? t('voucher.csv.autosaveNotice') : formatSavedAt(savedAt, locale, t)}</span>
          <Button type="button" variant="outline" disabled={saving || !dirty} onClick={() => void saveDraft()}><Save size={15} /> {saving ? t('actions.saving') : t('actions.saveDraft')}</Button>
          <Button type="button" variant="outline" disabled={saving || !dirty} onClick={() => void saveDraft(true)}>{t('actions.saveAndExit')}</Button>
          <Button type="button" onClick={requestPreview} disabled={saving || loadingDraft}><Eye size={15} /> {t('actions.previewUpload')}</Button>
        </div>
      </div>

      {previewOpen && <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-950/35 p-4"><div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-amber-700">{t('voucher.csv.finalReview')}</p><h2 className="mt-1 text-xl font-bold text-gray-950">{t('voucher.csv.readyToUpload')}</h2><p className="mt-2 text-sm leading-6 text-gray-600">{t('voucher.csv.uploadConfirmationNotice')}</p></div><button type="button" onClick={() => setPreviewOpen(false)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100" aria-label={t('actions.close')}><X size={18} /></button></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">{t('voucher.csv.rowsLabel')}</p><p className="mt-1 text-lg font-bold text-gray-950">{formatNumber(summary.total, locale)}</p></div><div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-700">{t('voucher.csv.ready')}</p><p className="mt-1 text-lg font-bold text-emerald-800">{formatNumber(summary.valid, locale)}</p></div><div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-700">{t('voucher.csv.blankCodes')}</p><p className="mt-1 text-lg font-bold text-amber-800">{formatNumber(summary.blankCodes, locale)}</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">{t('voucher.csv.prefix')}</p><p className="mt-1 font-mono text-sm font-bold text-gray-950">{document.autoGenerate ? document.codePrefix : t('voucher.csv.off')}</p></div></div>{codePreview && <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/50 p-4"><p className="text-xs font-semibold text-amber-800">{t('voucher.csv.generatedPreview', { count: formatNumber(codePreview.generated, locale) })}</p><div className="mt-2 flex flex-wrap gap-2">{codePreview.sampleCodes.slice(0, 8).map((code, index) => <span key={`${code}-${index}`} className="rounded-md bg-white px-2 py-1 font-mono text-xs font-semibold text-amber-800">{code}</span>)}</div></div>}<p className="mt-4 text-xs leading-5 text-gray-500">{t('voucher.csv.apiValidationNotice')}</p><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setPreviewOpen(false)}>{t('voucher.csv.backToEdit')}</Button><Button type="button" onClick={() => { setPreviewOpen(false); onUseCsv(normalizeVoucherCsvDraft(scopeDocument(document, isOutletManager, assignedOutletId)), draftId); }}>{t('voucher.csv.continueUpload')}</Button></DialogFooter></div></div>}
    </DialogContent>
  </Dialog>;
}
