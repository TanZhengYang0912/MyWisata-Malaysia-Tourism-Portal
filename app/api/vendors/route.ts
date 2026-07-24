// P2 — Member 2 owns GET /api/vendors + POST /api/vendors

import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { vendorRegisterSchema } from '@/lib/validation/vendor-schemas';

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
    const vendorIds = filtered.map((v: { id: string }) => v.id);
    const { data: products } = await supabase
      .from('products')
      .select('vendor_id, categories(slug)')
      .in('vendor_id', vendorIds.length ? vendorIds : ['none'])
      .eq('status', 'active');

    const matchingVendorIds = new Set(
      (products ?? [])
        .filter((p: { categories: unknown; vendor_id: string }) => (p.categories as { slug: string } | null)?.slug === category)
        .map((p: { vendor_id: string }) => p.vendor_id),
    );
    filtered = filtered.filter((v: { id: string }) => matchingVendorIds.has(v.id));
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

  // One RPC, one transaction: vendor + onboarding profile + first outlet are
  // created together or not at all. It also takes a per-user advisory lock and
  // re-checks for an existing vendor inside it, so a double-clicked Register
  // cannot create two vendors. Slug collisions are resolved server-side.
  const { data: created, error } = await supabase.rpc('register_vendor_with_outlet', {
    p_name: body.name,
    p_slug: body.slug ?? null,
    p_description: body.description ?? null,
    p_business_type: body.businessType ?? null,
    p_legal_business_name: body.legalBusinessName ?? null,
    p_registration_number: body.registrationNumber ?? null,
    p_contact_name: body.contactName ?? null,
    p_contact_email: body.contactEmail || user.email || null,
    p_contact_phone: body.contactPhone ?? null,
    p_business_address: body.businessAddress ?? null,
    p_logo_url: body.logoUrl || null,
    p_cover_url: body.coverUrl || null,
  });

  if (error) {
    if (error.message.includes('vendor_exists')) return apiFail('DUPLICATE', 'You already have a vendor', 409);
    if (error.message.includes('unauthorized')) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
    if (error.message.includes('invalid_name')) return apiFail('VALIDATION_ERROR', 'Vendor name must contain letters or numbers', 400);
    return apiFail('DB_ERROR', error.message, 400);
  }

  const { vendor_id: vendorId } = created as { vendor_id: string };
  const { data } = await supabase.from('vendors').select('*').eq('id', vendorId).single();
  return apiOk(data, { status: 201 });
}
