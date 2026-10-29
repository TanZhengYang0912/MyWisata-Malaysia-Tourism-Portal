import { z } from 'zod';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { authorizeOutlet, authorizeVendor } from '@/lib/vendor-authorization';
import { generateContentDraft } from '@/lib/ai/content-assistant';

interface Props { params: Promise<{ vendorId: string }> }

const contentSchema = z.discriminatedUnion('surface', [
  z.object({
    surface: z.literal('business_profile'),
    name: z.string().trim().min(2).max(255),
    businessType: z.string().trim().max(120).optional(),
    description: z.string().trim().max(2000).optional(),
  }).strict(),
  z.object({
    surface: z.literal('outlet_page'),
    outletId: z.string().uuid(),
    outletName: z.string().trim().min(1).max(255),
    heroTitle: z.string().trim().max(255).optional(),
    heroBody: z.string().trim().max(2000).optional(),
    productNames: z.array(z.string().trim().max(255)).max(24).optional(),
  }).strict(),
  z.object({
    surface: z.literal('inbox_reply'),
    threadId: z.string().uuid(),
  }).strict(),
]);

function providerError(reason: 'not_configured' | 'authentication_failed' | 'rate_limited' | 'sensitive_input' | 'unavailable') {
  if (reason === 'sensitive_input') return apiFail('AI_PERSONAL_DATA_WITHHELD', 'Your content was not sent to AI because it may contain personal details. Remove phone, email, identity, bank, or private-address details and try again, or write the content manually.', 422);
  if (reason === 'not_configured' || reason === 'authentication_failed') return apiFail('AI_UNAVAILABLE', 'AI writing is temporarily unavailable. You can write this content manually or contact platform support if the problem continues.', 503);
  if (reason === 'rate_limited') return apiFail('AI_RATE_LIMITED', 'The AI provider is temporarily rate limited. Please try again later.', 429);
  return apiFail('AI_UNAVAILABLE', 'AI writing is temporarily unavailable. You can write this content manually or contact platform support if the problem continues.', 503);
}

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const parsed = await parseBody(request, contentSchema);
  if (!parsed.ok) return parsed.response;

  const access = parsed.data.surface === 'business_profile'
    ? await authorizeVendor(vendorId, ['vendor_owner'])
    : parsed.data.surface === 'outlet_page'
      ? await authorizeOutlet(vendorId, parsed.data.outletId, ['outlet_manager'])
      : await authorizeVendor(vendorId);
  if (!access.ok) return access.response;

  let context: Record<string, unknown>;
  if (parsed.data.surface === 'business_profile') {
    context = { name: parsed.data.name, businessType: parsed.data.businessType || undefined, description: parsed.data.description || undefined };
  } else if (parsed.data.surface === 'outlet_page') {
    context = {
      outletName: parsed.data.outletName,
      heroTitle: parsed.data.heroTitle || undefined,
      heroBody: parsed.data.heroBody || undefined,
      productNames: parsed.data.productNames || [],
    };
  } else {
    const { data: thread, error: threadError } = await access.access.serviceDb
      .from('chat_threads')
      .select('id,customer_id,outlet_id')
      .eq('id', parsed.data.threadId)
      .in('outlet_id', access.access.outletIds)
      .maybeSingle();
    if (threadError) return apiFail('DB_ERROR', threadError.message, 500);
    if (!thread) return apiFail('NOT_FOUND', 'Conversation not found in your assigned scope', 404);

    const { data: messages, error: messagesError } = await access.access.serviceDb
      .from('chat_messages')
      .select('sender_id,body,created_at')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: false })
      .limit(12);
    if (messagesError) return apiFail('DB_ERROR', messagesError.message, 500);
    if (!messages?.length) return apiFail('EMPTY_CONVERSATION', 'This conversation has no messages to reply to', 422);

    context = {
      messages: messages.reverse().map((message: { sender_id: string; body: string; created_at: string }) => ({
        speaker: message.sender_id === thread.customer_id ? 'traveller' : 'vendor',
        text: message.body,
      })),
    };
  }

  try {
    const result = await generateContentDraft(parsed.data.surface, context);
    if (!result.available) return providerError(result.reason);
    return apiOk({ draft: result.draft, provider: result.provider, model: result.model });
  } catch (error) {
    console.error('[ai] content draft failed', error instanceof Error ? error.message : error);
    return providerError('unavailable');
  }
}
