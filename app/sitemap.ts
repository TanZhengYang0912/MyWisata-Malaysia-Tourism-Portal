import type { MetadataRoute } from 'next';
import { createServiceClient } from '@/lib/supabase/service';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const service = createServiceClient();
  const { data } = await service.from('outlets').select('id,updated_at').eq('status', 'active').limit(5000);
  return [
    { url: base, changeFrequency: 'daily', priority: 1 },
    ...(data ?? []).map((outlet) => ({ url: `${base}/customer/outlet/${outlet.id}`, lastModified: outlet.updated_at ?? undefined, changeFrequency: 'weekly' as const, priority: 0.8 })),
  ];
}
