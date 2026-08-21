import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { generateAiText } from '@/lib/ai/provider';
import { buildTranslationPrompt, sourceHash, type TranslationField, type TranslationLocale } from '@/lib/recommendations/content-localization';
import { selectSuggestedPlace } from '@/lib/recommendations/place-resolution';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

const requestSchema = z.object({
  action: z.enum(['suggest_place', 'confirm_place', 'clear_place', 'generate']),
  placeId: z.string().uuid().optional(),
}).strict();

const reviewSchema = z.object({
  translationId: z.string().uuid(),
  translatedText: z.string().trim().min(1).max(2000),
  status: z.enum(['approved', 'rejected']),
}).strict();

const LOCK_TTL_MS = 10 * 60 * 1000;
const AI_TIMEOUT_MS = 2 * 60 * 1000;

function generateTranslation(system: string, user: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  return generateAiText(system, user, { temperature: 0.2, maxTokens: 600, signal: controller.signal })
    .finally(() => clearTimeout(timeout));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return apiFail('NOT_FOUND', 'Recommendation not found', 404);

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: isSuperAdmin, error: roleError } = await db.rpc('is_super_admin', { uid: user.id });
  if (roleError || !isSuperAdmin) return apiFail('FORBIDDEN', 'Super Admin access required', 403);

  const parsed = await parseBody(request, requestSchema);
  if (!parsed.ok) return parsed.response;
  const { action, placeId } = parsed.data;

  if (action === 'confirm_place' && !placeId) return apiFail('VALIDATION_FAILED', 'An internal Place ID is required', 422);

  if (action === 'generate') {
    const service = createServiceClient();
    const { data: recommendation, error } = await service
      .from('vendor_recommendations')
      .select('id,vendor_name,description,status')
      .eq('id', id)
      .maybeSingle();
    if (error) return apiFail('DB_ERROR', error.message, 500);
    if (!recommendation) return apiFail('NOT_FOUND', 'Recommendation not found', 404);
    if (recommendation.status !== 'approved') {
      return apiFail('RECOMMENDATION_NOT_APPROVED', 'Only approved recommendations can have translation drafts', 409);
    }

    const fields: Array<{ field: TranslationField; sourceText: string }> = [
      { field: 'name', sourceText: recommendation.vendor_name },
      ...(recommendation.description ? [{ field: 'description' as const, sourceText: recommendation.description }] : []),
    ];
    const locales: TranslationLocale[] = ['zh-CN', 'ms'];
    let generated = 0;
    let skipped = 0;

    for (const { field, sourceText } of fields) {
      const hash = sourceHash(sourceText);
      for (const locale of locales) {
        const lock = { entity_type: 'vendor_recommendation', entity_id: id, field, locale, source_hash: hash };
        const ownerToken = randomUUID();
        const { data: existingTranslation, error: existingError } = await service
          .from('content_translations')
          .select('id')
          .match(lock)
          .maybeSingle();
        if (existingError) return apiFail('DB_ERROR', existingError.message, 500);
        if (existingTranslation) {
          skipped += 1;
          continue;
        }

        await service
          .from('content_translation_generation_locks')
          .delete()
          .match(lock)
          .lt('expires_at', new Date().toISOString());
        const { error: lockError } = await service
          .from('content_translation_generation_locks')
          .insert({ ...lock, owner_token: ownerToken, expires_at: new Date(Date.now() + LOCK_TTL_MS).toISOString() });
        if (lockError) {
          if (lockError.code === '23505') {
            skipped += 1;
            continue;
          }
          return apiFail('LOCALIZATION_LOCK_FAILED', lockError.message, 500);
        }

        const releaseLock = () => service.from('content_translation_generation_locks').delete().match({ ...lock, owner_token: ownerToken });
        try {
          const prompt = buildTranslationPrompt({ field, sourceText, locale });
          const result = await generateTranslation(prompt.system, prompt.user);
          if (!result.available) {
            await releaseLock();
            return apiFail('LOCALIZATION_UNAVAILABLE', 'Translation generation is unavailable; retry later', 502);
          }

          const translatedText = result.content.trim().replace(/\s+/g, ' ');
          if (!translatedText || translatedText.length > 2000 || /<[^>]+>/.test(translatedText)) {
            await releaseLock();
            return apiFail('LOCALIZATION_INVALID_OUTPUT', 'Translation provider returned invalid text; retry later', 502);
          }

          const { error: upsertError } = await service.from('content_translations').upsert({
            ...lock,
            source_text: sourceText,
            translated_text: translatedText,
            status: 'draft',
            provider: result.provider,
            model: result.model,
          }, { onConflict: 'entity_type,entity_id,field,locale,source_hash' });
          if (upsertError) {
            await releaseLock();
            return apiFail('LOCALIZATION_SAVE_FAILED', upsertError.message, 500);
          }
        } catch {
          await releaseLock();
          return apiFail('LOCALIZATION_UNAVAILABLE', 'Translation generation is unavailable; retry later', 502);
        }
        generated += 1;
      }
    }

    return apiOk({ generated, skipped });
  }

  if (action === 'suggest_place') {
    const service = createServiceClient();
    const [{ data: recommendation, error: recommendationError }, { data: places, error: placesError }] = await Promise.all([
      service.from('vendor_recommendations').select('latitude,longitude').eq('id', id).maybeSingle(),
      service.from('places').select('id,name,level,lat,lng').eq('status', 'active'),
    ]);
    if (recommendationError) return apiFail('DB_ERROR', recommendationError.message, 500);
    if (!recommendation) return apiFail('NOT_FOUND', 'Recommendation not found', 404);
    if (placesError) return apiFail('DB_ERROR', placesError.message, 500);

    const suggestion = recommendation.latitude != null && recommendation.longitude != null
      ? selectSuggestedPlace(Number(recommendation.latitude), Number(recommendation.longitude), (places ?? []).map((place) => ({
        id: place.id,
        name: place.name,
        level: place.level,
        latitude: Number(place.lat),
        longitude: Number(place.lng),
      })))
      : null;
    if (!suggestion) return apiOk({ suggestion: null });
    const { error } = await db.rpc('admin_resolve_recommendation_place', {
      p_rec_id: id,
      p_action: 'suggest',
      p_place_id: suggestion?.id ?? null,
    });
    if (error) return apiFail('RESOLUTION_FAILED', error.message, 409);
    return apiOk({ suggestion });
  }

  const { error } = await db.rpc('admin_resolve_recommendation_place', {
    p_rec_id: id,
    p_action: action === 'confirm_place' ? 'confirm' : 'clear',
    p_place_id: placeId ?? null,
  });
  if (error) return apiFail('RESOLUTION_FAILED', error.message, 409);
  return apiOk({ placeId: action === 'confirm_place' ? placeId : null, status: action === 'confirm_place' ? 'confirmed' : 'cleared' });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return apiFail('NOT_FOUND', 'Recommendation not found', 404);

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { data: isSuperAdmin, error: roleError } = await db.rpc('is_super_admin', { uid: user.id });
  if (roleError || !isSuperAdmin) return apiFail('FORBIDDEN', 'Super Admin access required', 403);

  const parsed = await parseBody(request, reviewSchema);
  if (!parsed.ok) return parsed.response;
  const translatedText = parsed.data.translatedText.replace(/\s+/g, ' ');
  if (/<[^>]+>/.test(translatedText)) return apiFail('VALIDATION_FAILED', 'Translation must be plain text', 422);
  const { error: reviewError } = await db.rpc('admin_review_recommendation_translation', {
    p_translation_id: parsed.data.translationId,
    p_rec_id: id,
    p_translated_text: translatedText,
    p_status: parsed.data.status,
  });
  if (reviewError) return apiFail('LOCALIZATION_REVIEW_FAILED', reviewError.message, 409);

  return apiOk({ translationId: parsed.data.translationId, status: parsed.data.status });
}
