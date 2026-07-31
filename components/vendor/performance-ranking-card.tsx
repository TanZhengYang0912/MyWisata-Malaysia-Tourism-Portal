import Link from 'next/link';
import { ArrowRight, Crown, Landmark, Star, Utensils } from 'lucide-react';
import CompactThumbnail from '@/components/vendor/compact-thumbnail';
import { rankingPercent } from '@/lib/vendor/performance-ranking';

type SellingItem = { name: string; quantity: number; revenue: number; coverUrl: string | null; outletName?: string };
type RatedItem = { name: string; rating: number; reviews: number; coverUrl: string | null; outletName?: string };

type Props = {
  kind: 'selling' | 'rated';
  periodLabel: string;
  items: SellingItem[] | RatedItem[];
  href: string;
};

const accent = {
  selling: {
    icon: Utensils,
    eyebrow: 'SALES LEADERBOARD',
    title: 'Top selling products',
    subtitle: 'Ranked by paid units sold',
    iconClass: 'text-primary',
    pillClass: 'bg-secondary text-primary ring-primary/10',
    heroClass: 'border-primary/10 bg-gradient-to-br from-secondary via-white to-white',
    rankClass: 'bg-primary text-white',
    barClass: 'bg-primary',
    hoverClass: 'hover:border-primary/20 hover:bg-secondary/40',
    linkLabel: 'View catalogue',
  },
  rated: {
    icon: Landmark,
    eyebrow: 'TRAVELLER FAVOURITES',
    title: 'Top rated listings',
    subtitle: 'Visible customer reviews',
    iconClass: 'text-amber-600',
    pillClass: 'bg-amber-50 text-amber-800 ring-amber-100',
    heroClass: 'border-amber-100 bg-gradient-to-br from-amber-50 via-white to-white',
    rankClass: 'bg-amber-500 text-white',
    barClass: 'bg-amber-500',
    hoverClass: 'hover:border-amber-200 hover:bg-amber-50/40',
    linkLabel: 'View analytics',
  },
} as const;

export default function PerformanceRankingCard({ kind, periodLabel, items, href }: Props) {
  const style = accent[kind];
  const Icon = style.icon;
  const first = items[0];
  const leader = kind === 'selling'
    ? Number((first as SellingItem | undefined)?.quantity || 0)
    : 5;

  const insight = first
    ? kind === 'selling'
      ? `${first.name} leads with ${(first as SellingItem).quantity} units sold.`
      : `${first.name} is the highest-rated listing at ${(first as RatedItem).rating.toFixed(1)} / 5.`
    : kind === 'selling' ? 'Paid products will appear here.' : 'Published reviews will appear here.';

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <header className="border-b border-gray-100 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400"><Icon size={14} className={style.iconClass} /> {style.eyebrow}</div>
            <h2 className="text-lg font-semibold text-gray-950">{style.title}</h2>
            <p className="mt-1 text-sm text-gray-500">{style.subtitle}</p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${style.pillClass}`}>{periodLabel}</span>
        </div>
      </header>

      <div className="p-3">
        {items.length ? (
          <div className="space-y-2">
            {items.map((item, index) => {
              const isFirst = index === 0;
              const metric = kind === 'selling' ? (item as SellingItem).quantity : (item as RatedItem).rating;
              const progress = kind === 'selling' ? rankingPercent(metric, leader) : rankingPercent(metric, leader);
              return (
                <article key={`${item.name}-${index}`} className={`rounded-xl border px-3 py-3 transition ${isFirst ? style.heroClass : `border-transparent ${style.hoverClass}`}`}>
                  <div className="flex items-center gap-3">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isFirst ? style.rankClass : 'bg-gray-100 text-gray-500'}`}>{isFirst ? <Crown size={14} /> : `#${index + 1}`}</div>
                    <CompactThumbnail src={item.coverUrl} alt={item.name} kind="product" size={isFirst ? 'md' : 'sm'} />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate font-semibold text-gray-900 ${isFirst ? 'text-sm' : 'text-sm'}`}>{item.name}</p>
                      <p className="mt-1 truncate text-xs text-gray-500">{item.outletName || (kind === 'selling' ? `${(item as SellingItem).quantity} units sold` : `${(item as RatedItem).reviews} traveller reviews`)}</p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${style.barClass}`} style={{ width: `${progress}%` }} /></div>
                    </div>
                    <div className="shrink-0 text-right">
                      {kind === 'selling' ? <><p className="text-sm font-bold text-gray-950">{(item as SellingItem).quantity} sold</p><p className="mt-1 text-[11px] text-gray-400">RM {(item as SellingItem).revenue.toFixed(2)}</p></> : <><p className="inline-flex items-center gap-1 text-sm font-bold text-amber-600"><Star size={14} fill="currentColor" />{(item as RatedItem).rating.toFixed(1)}</p><p className="mt-1 text-[11px] text-gray-400">{(item as RatedItem).reviews} reviews</p></>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : <div className="px-4 py-10 text-center text-sm text-gray-400">{kind === 'selling' ? 'No paid products in this period.' : 'No published reviews in this period.'}</div>}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/60 px-6 py-4">
        <p className="min-w-0 truncate text-xs text-gray-500"><span className="font-semibold text-gray-700">Insight</span> · {insight}</p>
        <Link href={href} className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${style.iconClass} hover:underline`}>{style.linkLabel} <ArrowRight size={14} /></Link>
      </footer>
    </section>
  );
}
