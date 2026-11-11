import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { cleanUserContent } from '@/lib/moderation/clean';

const schema = z.object({
  subject: z.string().trim().min(1).max(255),
  summary: z.string().trim().min(1).max(2000),
}).strict();

export async function POST(request: Request) {
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  try {
    const service = createServiceClient();
    const [subject, summary] = await Promise.all([
      cleanUserContent(parsed.data.subject, service),
      cleanUserContent(parsed.data.summary, service),
    ]);
    const response = apiOk({ subject: subject.display, summary: summary.display });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch {
    return apiFail('PREVIEW_UNAVAILABLE', 'The ticket preview is temporarily unavailable. Try again.', 503);
  }
}
