import type { MetadataRoute } from 'next';
import { createServiceClient } from '@/lib/supabase/service';
import { getHelpArticles } from '@/lib/help/kb.server';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const service = createServiceClient();
  const { data } = await service.from('outlets').select('id,updated_at').eq('status', 'active').eq('review_status', 'approved').limit(5000);
  const helpArticles = await getHelpArticles();
  const legalPaths = ['privacy', 'terms', 'data', 'about'];
  return [
    { url: base, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/help`, changeFrequency: 'weekly', priority: 0.6 },
    ...legalPaths.map((path) => ({ url: `${base}/legal/${path}`, changeFrequency: 'monthly' as const, priority: 0.3 })),
    ...(data ?? []).map((outlet) => ({ url: `${base}/customer/outlets/${outlet.id}`, lastModified: outlet.updated_at ?? undefined, changeFrequency: 'weekly' as const, priority: 0.8 })),
    ...helpArticles.map((article) => ({ url: `${base}/help/${article.slug}`, lastModified: article.createdAt, changeFrequency: 'monthly' as const, priority: 0.5 })),
  ];
}
