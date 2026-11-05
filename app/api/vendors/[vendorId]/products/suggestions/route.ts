import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { z } from 'zod';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { generateListingSuggestion } from '@/lib/ai/listing-suggestions';

interface Props { params: Promise<{ vendorId: string }> }

const suggestionSchema = z.object({
  name: z.string().trim().min(2).max(255),
  productType: z.string().trim().min(2).max(30),
  location: z.string().trim().max(255).optional(),
  description: z.string().trim().max(2000).optional(),
  keywords: z.array(z.string().trim().max(50)).max(20).optional(),
  priceRange: z.string().trim().max(80).optional(),
}).strict();

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!access.ok) return access.response;

  const parsed = await parseBody(request, suggestionSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await generateListingSuggestion(parsed.data);
    if (!result.available) {
      const message = result.reason === 'rate_limited'
          ? 'The free AI provider is temporarily rate limited. Please try again later.'
          : result.reason === 'sensitive_input'
            ? 'Your listing details were not sent to AI because they may contain personal information. Remove phone, email, identity, bank, or private-address details and try again, or write the listing manually.'
          : 'AI suggestions are temporarily unavailable. You can write the listing manually or contact platform support if the problem continues.';
      const code = result.reason === 'authentication_failed' || result.reason === 'not_configured' ? 'AI_UNAVAILABLE' : `AI_${result.reason.toUpperCase()}`;
      return apiFail(code, message, result.reason === 'rate_limited' ? 429 : result.reason === 'sensitive_input' ? 422 : 503);
    }
    return apiOk(result);
  } catch (error) {
    console.error('[ai] listing suggestion failed', error instanceof Error ? error.message : error);
    return apiFail('AI_UNAVAILABLE', 'AI suggestions are temporarily unavailable.', 503);
  }
}
