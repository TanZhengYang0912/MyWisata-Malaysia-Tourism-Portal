import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';

interface Props { params: Promise<{ orderId: string; orderItemId: string }> }

export async function GET(_request: Request, { params }: Props) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { orderId, orderItemId } = await params;
  const service = createServiceClient();
  const { data: item } = await service.from('order_items').select('id,product_id,products(product_type,digital_asset_url,digital_asset_name)').eq('id', orderItemId).eq('order_id', orderId).maybeSingle();
  const { data: order } = await service.from('orders').select('id,status,user_id').eq('id', orderId).eq('user_id', user.id).maybeSingle();
  if (!item || !order || order.status !== 'paid') return apiFail('NOT_FOUND', 'Digital entitlement not found', 404);
  const product = Array.isArray(item.products) ? item.products[0] : item.products;
  if (!product || product.product_type !== 'digital' || !product.digital_asset_url) return apiFail('NOT_FOUND', 'This item is not a secure digital download', 404);
  const match = product.digital_asset_url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
  if (!match) return apiFail('NOT_CONFIGURED', 'This digital asset is not stored in a private Supabase bucket yet', 409);
  const signed = await service.storage.from(match[1]).createSignedUrl(decodeURIComponent(match[2]), 300);
  if (signed.error || !signed.data?.signedUrl) return apiFail('DOWNLOAD_FAILED', 'Unable to create a secure download link', 502);
  return apiOk({ url: signed.data.signedUrl, filename: product.digital_asset_name ?? 'download' });
}
