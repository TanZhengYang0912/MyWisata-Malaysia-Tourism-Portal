import crypto from 'node:crypto';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';

interface Props { params: Promise<{ vendorId: string }> }

function candidate() {
  return `MY${crypto.randomBytes(5).toString('hex').toUpperCase()}`.slice(0, 10);
}

export async function POST(_request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!access.ok) return access.response;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = candidate();
    const { data, error } = await access.access.serviceDb.from('vouchers').select('id').eq('code', code).maybeSingle();
    if (error) return apiFail('DB_ERROR', error.message, 500);
    if (!data) return apiOk({ code });
  }
  return apiFail('CODE_GENERATION_FAILED', 'Could not find an unused voucher code. Try again.', 503);
}
