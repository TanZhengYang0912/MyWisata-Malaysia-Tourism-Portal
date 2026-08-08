import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { validateRecommendationImage } from '@/lib/recommendations/submission';

const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const form = await request.formData().catch(() => null);
  const file = form?.get('image');
  if (!(file instanceof File)) return apiFail('IMAGE_REQUIRED', 'Choose an image to upload', 422);
  const message = validateRecommendationImage(file);
  if (message) return apiFail('IMAGE_INVALID', message, 422);

  const service = createServiceClient();
  const id = crypto.randomUUID();
  const path = `${user.id}/staged/${id}.${extensions[file.type]}`;
  const { error: uploadError } = await service.storage.from('recommendation-images').upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
  if (uploadError) return apiFail('UPLOAD_FAILED', 'Unable to upload image', 502);
  const { error: rowError } = await service.from('recommendation_images').insert({ id, owner_id: user.id, storage_path: path, is_staged: true });
  if (rowError) {
    await service.storage.from('recommendation-images').remove([path]);
    return apiFail('UPLOAD_FAILED', 'Unable to prepare image', 502);
  }
  return apiOk({ stagedImageId: id }, { status: 201 });
}
