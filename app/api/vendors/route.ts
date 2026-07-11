// P2 — Member 2 owns GET /api/vendors + POST /api/vendors

import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { vendorRegisterSchema } from '@/lib/validation/vendor-schemas';
import { slugify } from '@/lib/utils';

export async function GET(request: Request) {
  const supabase = await createClient();
  const url = new URL(request.url);
  const city     = url.searchParams.get('city');
  const category = url.searchParams.get('category');
  const status   = url.searchParams.get('status');
  const q        = url.searchParams.get('q');

  let query = supabase
    .from('vendors')
    .select('*, outlets(id, name, city, lat, lng, status)')
    .eq('status', status ?? 'approved');

  if (q) query = query.ilike('name', `%${q}%`);
  if (city) query = query.contains('outlets', [{ city }]);

  const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
  if (error) return apiFail('DB_ERROR', error.message, 500);

  // If category filter, post-filter vendors that have products in that category
  let filtered = data ?? [];
  if (category) {
    const vendorIds = filtered.map((v: any) => v.id);
    const { data: products } = await supabase
      .from('products')
      .select('vendor_id, categories(slug)')
      .in('vendor_id', vendorIds.length ? vendorIds : ['none'])
      .eq('status', 'active');

    const matchingVendorIds = new Set(
      (products ?? [])
        .filter((p: any) => (p.categories as Record<string, any>)?.slug === category)
        .map((p: any) => p.vendor_id),
    );
    filtered = filtered.filter((v: any) => matchingVendorIds.has(v.id));
  }

  return apiOk(filtered);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, vendorRegisterSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Check if user already has a vendor
  const { data: existing } = await supabase
    .from('vendors')
    .select('id, status')
    .eq('owner_id', user.id)
    .in('status', ['pending', 'approved'])
    .limit(1);

  if (existing && existing.length > 0) {
    return apiFail('DUPLICATE', `You already have a vendor (status: ${existing[0].status})`, 409);
  }

  // Generate slug if not provided
  const finalSlug = body.slug || slugify(body.name);

  // Check slug uniqueness
  const { data: slugCheck } = await supabase
    .from('vendors')
    .select('id')
    .eq('slug', finalSlug)
    .limit(1);

  if (slugCheck && slugCheck.length > 0) {
    return apiFail('SLUG_TAKEN', `Slug "${finalSlug}" is already in use`, 409);
  }

  const { data, error } = await supabase.from('vendors').insert({
    owner_id: user.id,
    name: body.name,
    slug: finalSlug,
    description: body.description ?? null,
    business_type: body.businessType ?? null,
    logo_url: body.logoUrl || null,
    cover_url: body.coverUrl || null,
    status: 'pending',
  }).select().single();

  if (error) return apiFail('DB_ERROR', error.message, 400);
  return apiOk(data, { status: 201 });
}
