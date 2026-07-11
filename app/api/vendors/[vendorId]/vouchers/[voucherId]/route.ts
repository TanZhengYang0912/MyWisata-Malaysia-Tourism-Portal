// P2 — Member 2: Single voucher PATCH (B3)

import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { voucherUpdateSchema } from '@/lib/validation/vendor-schemas';

interface Props { params: Promise<{ vendorId: string; voucherId: string }> }

export async function PATCH(request: Request, { params }: Props) {
  const { vendorId, voucherId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: vendor } = await supabase
    .from('vendors')
    .select('owner_id')
    .eq('id', vendorId)
    .single();
  if (!vendor || vendor.owner_id !== user.id) return apiFail('FORBIDDEN', 'Not your vendor', 403);

  const parsed = await parseBody(request, voucherUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.discountValue !== undefined) updateData.discount_value = body.discountValue;
  if (body.minSpend !== undefined) updateData.min_spend = body.minSpend;
  if (body.maxUses !== undefined) updateData.max_uses = body.maxUses;
  if (body.validFrom !== undefined) updateData.valid_from = body.validFrom;
  if (body.validUntil !== undefined) updateData.valid_until = body.validUntil;
  if (body.isActive !== undefined) updateData.is_active = body.isActive;

  const { data, error } = await supabase
    .from('vouchers')
    .update(updateData)
    .eq('id', voucherId)
    .eq('vendor_id', vendorId)
    .select()
    .single();

  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk(data);
}
