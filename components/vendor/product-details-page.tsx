'use client';

import { ArrowLeft, Check, Copy, Eye, Pencil } from 'lucide-react';
import CompactThumbnail from '@/components/vendor/compact-thumbnail';
import VariantManager from '@/components/vendor/variant-manager';
import PriceRuleManager from '@/components/vendor/price-rule-manager';
import { StatusBadge } from '@/components/ui/badge';
import { ShareButton } from '@/components/shared/share-button';
import { outletIdLabel, outletLocation, outletShortName } from '@/lib/outlet-display';
import { getProductDetailsLayoutClasses } from '@/lib/vendor/product-details-layout';
import { useTranslation } from 'react-i18next';
import { isAppLocale } from '@/lib/i18n/locale';
import { formatMYR, formatNumber } from '@/lib/i18n/format';

interface ProductVariantData {
  id: string;
  name: string;
  price_offset: number;
  is_default: boolean;
  sku: string | null;
  inventory: { quantity: number; reserved: number }[];
}

export interface ProductDetailsData {
  id: string;
  display_id?: string;
  outlet_id: string;
  name: string;
  description?: string | null;
  product_type: string;
  base_price: number;
  status: string;
  requires_booking: boolean;
  cover_url?: string | null;
  variants?: ProductVariantData[];
  availableStock?: number;
  lowStockThreshold?: number;
  outlet?: { id?: string; name?: string; city?: string; state?: string };
}

interface Props {
  product: ProductDetailsData;
  vendorId: string;
  canManageOutlet: boolean;
  productTypeLabel: string;
  productImageKind: 'food' | 'experience' | 'product';
  outletFallback?: { id?: string; name?: string; city?: string | null; state?: string | null };
  productOptions: { id: string; name: string; base_price: number }[];
  copiedProductId: string | null;
  onCopyProductId: (productId: string) => void;
  onBack: () => void;
  onEdit: () => void;
  onUpdate: () => void;
}

function ProductImage({ product, kind }: { product: ProductDetailsData; kind: Props['productImageKind'] }) {
  if (product.cover_url) {
    // External and Supabase URLs are not statically enumerable for next/image.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={product.cover_url} alt={product.name} className="h-full w-full object-cover" />;
  }
  return <div className="flex h-full w-full items-center justify-center"><CompactThumbnail src={null} alt={product.name} kind={kind} size="md" /></div>;
}

export default function ProductDetailsPage({ product, vendorId, canManageOutlet, productTypeLabel, productImageKind, outletFallback, productOptions, copiedProductId, onCopyProductId, onBack, onEdit, onUpdate }: Props) {
  const { t, i18n } = useTranslation('vendor');
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en';
  const layout = getProductDetailsLayoutClasses();
  const outlet = product.outlet || outletFallback;
  const productId = product.display_id || product.id;
  const location = outletLocation(outlet?.city, outlet?.state);
  const outletId = outletIdLabel(outlet?.id || product.outlet_id || outletFallback?.id);
  const stockSummary = product.requires_booking ? t('productDetails.timeSlots') : product.availableStock === undefined ? t('productDetails.inventoryNotLoaded') : t('productDetails.unitsAvailable', { count: formatNumber(product.availableStock, locale) });

  return <div className={layout.page}>
    <div className={`${layout.actions} flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between`}>
      <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-gray-600 transition hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10"><ArrowLeft size={16} /> {t('productDetails.backToProducts')}</button>
      <div className="flex items-center gap-2"><ShareButton compact shareType="product" contentId={product.id} title={product.name} plainOnly /><button type="button" onClick={onEdit} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"><Pencil size={15} /> {t('productDetails.editListing')}</button></div>
    </div>

    <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
      <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="min-h-64 bg-secondary lg:min-h-full"><ProductImage product={product} kind={productImageKind} /></div>
        <div className="p-6 sm:p-8"><div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary"><Eye size={14} /> {t('productDetails.overview')}</div><h1 className="mt-3 break-words text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">{product.name}</h1><div className="mt-4 flex flex-wrap items-center gap-2"><span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary">{productTypeLabel}</span><StatusBadge status={product.status} /></div><p className="mt-5 max-w-2xl text-sm leading-6 text-gray-500">{t('productDetails.overviewHint')}</p></div>
      </div>
      <div className="grid gap-px border-t border-gray-100 bg-gray-100 sm:grid-cols-2 lg:grid-cols-5">
        <div className="bg-white p-5"><p className="text-xs text-gray-500">{t('productDetails.productId')}</p><div className="mt-2 flex items-start justify-between gap-2"><p className="break-all font-mono text-xs font-semibold text-gray-900">{productId}</p><button type="button" onClick={() => onCopyProductId(productId)} title={t('productDetails.copyProductId')} aria-label={t('productDetails.copyProductId')} className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-50 hover:text-primary">{copiedProductId === productId ? <Check size={15} className="text-primary" /> : <Copy size={15} />}</button></div>{copiedProductId === productId && <p className="mt-1 text-[11px] font-medium text-primary">{t('productDetails.copied')}</p>}</div>
        <div className="bg-white p-5"><p className="text-xs text-gray-500">{t('productDetails.basePrice')}</p><p className="mt-2 text-lg font-bold text-gray-950">{formatMYR(Number(product.base_price), locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
        <div className="bg-white p-5"><p className="text-xs text-gray-500">{t('productDetails.outlet')}</p><p className="mt-2 truncate text-sm font-semibold text-gray-900">{outletShortName(outlet?.name)}</p><p className="mt-1 text-xs text-gray-500">{location}</p></div>
        <div className="bg-white p-5"><p className="text-xs text-gray-500">{t('productDetails.availability')}</p><p className="mt-2 text-sm font-semibold text-gray-900">{stockSummary}</p><p className="mt-1 font-mono text-[10px] text-gray-400">{outletId}</p></div>
        <div className="bg-white p-5"><p className="text-xs text-gray-500">{t('productDetails.status')}</p><div className="mt-2"><StatusBadge status={product.status} /></div></div>
      </div>
    </section>

    <div className={layout.content}>
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-7"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{t('productDetails.customerContent')}</p><h2 className="mt-1 text-xl font-bold text-gray-950">{t('productDetails.description')}</h2></div><span className="text-xs text-gray-400">{t('productDetails.shownOnListing')}</span></div><p className="mt-5 max-w-4xl text-sm leading-7 text-gray-600">{product.description || t('productDetails.noDescription')}</p></section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-7"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{t('productDetails.catalogueSetup')}</p><h2 className="mt-1 text-xl font-bold text-gray-950">{t('productDetails.variantsInventory')}</h2><p className="mt-1 text-sm text-gray-500">{t('productDetails.variantsHint')}</p></div>{canManageOutlet ? <VariantManager vendorId={vendorId} productId={product.id} variants={product.variants || []} requiresBooking={product.requires_booking} onUpdate={onUpdate} /> : <div className="mt-5 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5 text-sm text-gray-500">{t('productDetails.viewOnlyVariants')}</div>}</section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-7"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{t('productDetails.revenueControls')}</p><h2 className="mt-1 text-xl font-bold text-gray-950">{t('productDetails.pricingRules')}</h2><p className="mt-1 text-sm text-gray-500">{t('productDetails.pricingHint')}</p></div>{canManageOutlet ? <PriceRuleManager vendorId={vendorId} productId={product.id} productOptions={productOptions} /> : <div className="mt-5 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5 text-sm text-gray-500">{t('productDetails.viewOnlyPricing')}</div>}</section>
    </div>
  </div>;
}
