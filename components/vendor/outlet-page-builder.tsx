'use client';

import { useEffect, useMemo, useState } from 'react';
import { GripVertical, ImagePlus, Monitor, Plus, Save, Smartphone, Trash2, X } from 'lucide-react';

type Block = { id: string; type: string; title?: string; body?: string; image?: string; cta?: string };
type GalleryItem = { url: string; alt?: string };

const BLOCKS = [
  { type: 'hero', label: 'Hero banner', hint: 'Lead with a place, story or signature experience.' },
  { type: 'intro', label: 'Outlet introduction', hint: 'A short welcome from this location.' },
  { type: 'product_grid', label: 'Product grid', hint: 'Show your featured products or activities.' },
  { type: 'gallery', label: 'Gallery', hint: 'Let travellers see the place before they arrive.' },
  { type: 'hours', label: 'Opening hours', hint: 'Display this outlet schedule.' },
  { type: 'contact', label: 'Map and contact', hint: 'Make the outlet easy to find.' },
  { type: 'cta', label: 'Booking call-to-action', hint: 'Move a curious traveller toward booking.' },
];

interface Props { vendorId: string; outletId: string; outletName: string; onClose: () => void }

function newBlock(type: string): Block {
  return { id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type, title: BLOCKS.find((item) => item.type === type)?.label || 'New section', body: '' };
}

export default function OutletPageBuilder({ vendorId, outletId, outletName, onClose }: Props) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [heroUrl, setHeroUrl] = useState('');
  const [brandColour, setBrandColour] = useState('#00004D');
  const [fontFamily, setFontFamily] = useState('Plus Jakarta Sans');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [featuredIds, setFeaturedIds] = useState<string[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; base_price: number }[]>([]);
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/vendors/${vendorId}/outlets/${outletId}/page`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message || 'Could not load outlet page');
        const page = payload.data || {};
        setBlocks(Array.isArray(page.blocks) ? page.blocks : []);
        setGallery(Array.isArray(page.gallery) ? page.gallery.map((item: string | GalleryItem) => typeof item === 'string' ? { url: item } : item).filter((item: GalleryItem) => Boolean(item?.url)) : []);
        setHeroUrl(page.hero_url || '');
        setBrandColour(page.brand_colour || '#00004D');
        setFontFamily(page.font_family || 'Plus Jakarta Sans');
        setSeoTitle(page.seo_title || '');
        setSeoDescription(page.seo_description || '');
        setFeaturedIds(Array.isArray(page.featured_ids) ? page.featured_ids : []);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load outlet page'))
      .finally(() => setLoading(false));
    fetch(`/api/vendors/${vendorId}/products?outlet_id=${outletId}&page=1&pageSize=24`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => setProducts((payload.data?.items || []).map((product: { id: string; name: string; base_price: number }) => ({ id: product.id, name: product.name, base_price: Number(product.base_price) }))))
      .catch(() => undefined);
  }, [vendorId, outletId]);

  const previewWidth = view === 'mobile' ? 'max-w-[390px]' : 'max-w-full';
  const previewBlocks = useMemo(() => blocks.length ? blocks : [newBlock('hero'), newBlock('product_grid'), newBlock('contact')], [blocks]);

  function updateBlock(id: string, updates: Partial<Block>) {
    setBlocks((current) => current.map((block) => block.id === id ? { ...block, ...updates } : block));
  }

  function moveBlock(id: string, targetId: string) {
    if (id === targetId) return;
    setBlocks((current) => {
      const sourceIndex = current.findIndex((block) => block.id === id);
      const targetIndex = current.findIndex((block) => block.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  async function save() {
    setSaving(true); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/vendors/${vendorId}/outlets/${outletId}/page`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heroUrl, brandColour, fontFamily, seoTitle, seoDescription, featuredIds, blocks, gallery }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'Could not save outlet page');
      setMessage('Shop page saved.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save outlet page'); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="rounded-2xl bg-white p-8 text-sm text-gray-500">Loading shop page…</div>;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-primary/45 p-4 sm:p-8">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[28px] bg-[#f8fafc] shadow-2xl">
        <header className="flex flex-col gap-4 border-b border-primary/10 bg-primary px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">Outlet studio</p><h2 className="mt-1 text-2xl font-bold tracking-tight">{outletName}</h2><p className="mt-1 text-sm text-indigo-100/75">Arrange the story travellers see when they find this outlet.</p></div>
          <div className="flex items-center gap-2"><button type="button" onClick={onClose} className="rounded-xl p-2.5 text-indigo-100 hover:bg-white/10" aria-label="Close page builder"><X size={18} /></button><button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#FFCC00] px-4 py-2.5 text-sm font-bold text-primary disabled:opacity-50"><Save size={16} /> {saving ? 'Saving…' : 'Save page'}</button></div>
        </header>
        <div className="grid lg:grid-cols-[280px_minmax(0,1fr)_330px]">
          <aside className="border-b border-primary/10 bg-white p-5 lg:border-b-0 lg:border-r"><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Page settings</p><div className="mt-4 space-y-3"><label className="block text-xs font-semibold text-gray-600">Hero image URL<input value={heroUrl} onChange={(event) => setHeroUrl(event.target.value)} placeholder="https://…" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary" /></label><div className="grid grid-cols-2 gap-3"><label className="block text-xs font-semibold text-gray-600">Brand colour<div className="mt-1 flex h-10 items-center gap-2 rounded-xl border border-gray-200 px-2"><input type="color" value={brandColour} onChange={(event) => setBrandColour(event.target.value)} className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent p-0" /><span className="font-mono text-xs text-gray-500">{brandColour}</span></div></label><label className="block text-xs font-semibold text-gray-600">Font<select value={fontFamily} onChange={(event) => setFontFamily(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-2 text-xs"><option>Plus Jakarta Sans</option><option>Fraunces</option><option>IBM Plex Mono</option><option>Georgia</option></select></label></div><label className="block text-xs font-semibold text-gray-600">SEO title<input value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} placeholder={`${outletName} · Malaysia Tourism`} className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary" /></label><label className="block text-xs font-semibold text-gray-600">SEO description<textarea value={seoDescription} onChange={(event) => setSeoDescription(event.target.value)} rows={3} placeholder="A short description for search results…" className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary" /></label><div><p className="text-xs font-semibold text-gray-600">Featured products</p><div className="mt-1 max-h-36 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-2">{products.length === 0 ? <p className="px-1 py-2 text-[11px] text-gray-400">No products found for this outlet.</p> : products.map((product) => <label key={product.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs text-gray-700 hover:bg-secondary"><input type="checkbox" checked={featuredIds.includes(product.id)} onChange={() => setFeaturedIds((current) => current.includes(product.id) ? current.filter((id) => id !== product.id) : current.length < 12 ? [...current, product.id] : current)} /> <span className="min-w-0 flex-1 truncate">{product.name}</span><span className="font-mono text-[10px] text-gray-400">RM {product.base_price.toFixed(2)}</span></label>)}</div><p className="mt-1 text-[10px] text-gray-400">Choose up to 12 items for the product grid.</p></div></div></aside>
          <main className="min-h-[680px] p-5 sm:p-7"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Live preview</p><p className="mt-1 text-sm text-gray-500">The page uses the same ordered blocks on desktop and mobile.</p></div><div className="flex rounded-xl bg-white p-1 shadow-sm"><button type="button" onClick={() => setView('desktop')} className={`rounded-lg p-2 ${view === 'desktop' ? 'bg-secondary text-primary' : 'text-gray-400'}`} aria-label="Desktop preview"><Monitor size={16} /></button><button type="button" onClick={() => setView('mobile')} className={`rounded-lg p-2 ${view === 'mobile' ? 'bg-secondary text-primary' : 'text-gray-400'}`} aria-label="Mobile preview"><Smartphone size={16} /></button></div></div><div className={`mx-auto overflow-hidden rounded-[22px] border border-primary/10 bg-white shadow-sm transition-all ${previewWidth}`} style={{ fontFamily }}><div className="h-28 bg-gradient-to-br from-[#00004D] via-[#11115A] to-[#FFCC00] p-5 text-white" style={heroUrl ? { backgroundImage: `linear-gradient(90deg, rgba(0,0,77,.82), rgba(0,0,77,.2)), url(${heroUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/75">{outletName}</p><p className="mt-7 text-xl font-bold">A local day, made memorable.</p></div><div className="space-y-3 p-4">{previewBlocks.map((block) => <div key={block.id} className="rounded-2xl border border-gray-100 bg-[#fafbff] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: brandColour }}>{BLOCKS.find((item) => item.type === block.type)?.label || block.type}</p><p className="mt-1 font-semibold text-gray-900">{block.title || 'Untitled section'}</p>{block.body && <p className="mt-1 text-xs leading-5 text-gray-500">{block.body}</p>}{block.type === 'gallery' && <div className="mt-3 grid grid-cols-3 gap-1.5">{(gallery.length ? gallery : [{ url: '' }, { url: '' }, { url: '' }]).slice(0, 3).map((item, index) => <div key={index} className="h-14 rounded-lg bg-secondary/70" style={item.url ? { backgroundImage: `url(${item.url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined} />)}</div>}</div>)}</div></div></main>
          <aside className="border-t border-primary/10 bg-white p-5 lg:border-l lg:border-t-0"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Page structure</p><p className="mt-1 text-xs text-gray-500">Drag to reorder sections.</p></div><span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-primary">{blocks.length} blocks</span></div><div className="mt-4 space-y-2">{blocks.map((block) => <div key={block.id} draggable onDragStart={() => setDraggingId(block.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggingId) moveBlock(draggingId, block.id); setDraggingId(null); }} className={`rounded-2xl border p-3 transition ${draggingId === block.id ? 'border-amber-400 bg-amber-50' : 'border-gray-100 bg-gray-50/70'}`}><div className="flex items-start gap-2"><GripVertical className="mt-1 shrink-0 cursor-grab text-gray-400" size={16} /><div className="min-w-0 flex-1"><p className="text-xs font-bold text-gray-900">{BLOCKS.find((item) => item.type === block.type)?.label || block.type}</p><input value={block.title || ''} onChange={(event) => updateBlock(block.id, { title: event.target.value })} className="mt-2 h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs" placeholder="Section title" /><textarea value={block.body || ''} onChange={(event) => updateBlock(block.id, { body: event.target.value })} rows={2} className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs" placeholder="Short supporting copy" />{block.type !== 'gallery' && <input value={block.image || ''} onChange={(event) => updateBlock(block.id, { image: event.target.value })} className="mt-2 h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs" placeholder="Optional image URL" />}</div><button type="button" onClick={() => setBlocks((current) => current.filter((item) => item.id !== block.id))} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove block"><Trash2 size={14} /></button></div></div>)}{!blocks.length && <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-center text-xs text-gray-400">Add a section to start shaping this page.</p>}</div><div className="mt-5 border-t border-gray-100 pt-4"><p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-gray-500">Add section</p><div className="grid gap-2">{BLOCKS.map((block) => <button type="button" key={block.type} onClick={() => setBlocks((current) => [...current, newBlock(block.type)])} className="flex items-center gap-2 rounded-xl border border-gray-100 px-3 py-2.5 text-left text-xs font-semibold text-gray-700 hover:border-primary/20 hover:bg-secondary"><Plus size={14} className="text-primary" />{block.label}</button>)}</div></div><div className="mt-5 border-t border-gray-100 pt-4"><div className="flex items-center gap-2"><ImagePlus size={15} className="text-amber-700" /><p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">Gallery URLs</p></div><textarea value={gallery.map((item) => item.url).join('\n')} onChange={(event) => setGallery(event.target.value.split('\n').map((url) => url.trim()).filter(Boolean).map((url) => ({ url })))} rows={4} placeholder="One image URL per line" className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-xs" /></div>{message && <p className="mt-4 text-xs font-semibold text-primary">{message}</p>}{error && <p className="mt-4 text-xs font-semibold text-red-600">{error}</p>}</aside>
        </div>
      </div>
    </div>
  );
}
