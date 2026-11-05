import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sourceHash } from '@/lib/recommendations/content-localization';
import {
  sourceAlreadyMatchesLocale,
  translationResultKey,
  type PublicTranslationEntity,
  type PublicTranslationField,
  type PublicTranslationRequestItem,
  type PublicTranslationResult,
  type SupportedTranslationLocale,
} from './contract';

export type PublicSourceRecord = {
  entityType: PublicTranslationEntity;
  entityId: string;
  field: PublicTranslationField;
  sourceText: string;
};

const MAX_SOURCE_LENGTH = 5000;
const MAX_QUEUE_BACKLOG = 5000;

function addRecord(
  records: Map<string, PublicSourceRecord>,
  entityType: PublicTranslationEntity,
  entityId: string,
  field: PublicTranslationField,
  sourceText: unknown,
) {
  if (typeof sourceText !== 'string' || sourceText.trim().length === 0 || sourceText.length > MAX_SOURCE_LENGTH) return;
  records.set(translationResultKey(entityType, entityId, field), { entityType, entityId, field, sourceText });
}

function requestedIds(items: PublicTranslationRequestItem[], entityType: PublicTranslationEntity) {
  return [...new Set(items.filter((item) => item.entityType === entityType).map((item) => item.entityId))];
}

export async function loadPublicContentSources(
  db: SupabaseClient,
  items: PublicTranslationRequestItem[],
): Promise<Map<string, PublicSourceRecord>> {
  const records = new Map<string, PublicSourceRecord>();
  const productIds = requestedIds(items, 'product');
  const placeIds = requestedIds(items, 'place');
  const informationalIds = requestedIds(items, 'place_informational_activity');
  const reviewIds = requestedIds(items, 'review');
  const campaignIds = requestedIds(items, 'promotion_campaign');
  const eventPromotionIds = requestedIds(items, 'vendor_event_promotion');

  const tasks: Promise<void>[] = [];
  if (productIds.length) tasks.push((async () => {
    const { data, error } = await db.from('products').select('id,name,description')
      .in('id', productIds).eq('status', 'active').eq('review_status', 'approved');
    if (error) throw error;
    for (const row of data ?? []) {
      addRecord(records, 'product', row.id, 'name', row.name);
      addRecord(records, 'product', row.id, 'description', row.description);
    }
  })());

  if (placeIds.length) tasks.push((async () => {
    const { data, error } = await db.from('places').select('id,name,tagline,intro')
      .in('id', placeIds).eq('status', 'active');
    if (error) throw error;
    for (const row of data ?? []) {
      addRecord(records, 'place', row.id, 'name', row.name);
      addRecord(records, 'place', row.id, 'tagline', row.tagline);
      addRecord(records, 'place', row.id, 'intro', row.intro);
    }
  })());

  if (informationalIds.length) tasks.push((async () => {
    const { data, error } = await db.from('place_informational_activities').select('id,title,description')
      .in('id', informationalIds).eq('status', 'active');
    if (error) throw error;
    for (const row of data ?? []) {
      addRecord(records, 'place_informational_activity', row.id, 'title', row.title);
      addRecord(records, 'place_informational_activity', row.id, 'description', row.description);
    }
  })());

  if (reviewIds.length) tasks.push((async () => {
    const { data: reviews, error } = await db.from('reviews')
      .select('id,title,body,product_id,vendor_id,is_visible')
      .in('id', reviewIds).eq('is_visible', true);
    if (error) throw error;
    const publicProductIds = [...new Set((reviews ?? []).map((row) => row.product_id).filter(Boolean))];
    const publicVendorIds = [...new Set((reviews ?? []).map((row) => row.vendor_id).filter(Boolean))];
    const [productsResult, vendorsResult] = publicProductIds.length && publicVendorIds.length
      ? await Promise.all([
        db.from('products').select('id,vendor_id').in('id', publicProductIds).eq('status', 'active').eq('review_status', 'approved'),
        db.from('vendors').select('id').in('id', publicVendorIds).eq('status', 'approved'),
      ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (productsResult.error) throw productsResult.error;
    if (vendorsResult.error) throw vendorsResult.error;
    const approvedVendorIds = new Set((vendorsResult.data ?? []).map((row) => row.id));
    const visibleProductIds = new Set((productsResult.data ?? [])
      .filter((row) => approvedVendorIds.has(row.vendor_id))
      .map((row) => row.id));
    for (const row of reviews ?? []) {
      if (!row.product_id || !visibleProductIds.has(row.product_id)) continue;
      addRecord(records, 'review', row.id, 'title', row.title);
      addRecord(records, 'review', row.id, 'body', row.body);
    }
  })());

  if (campaignIds.length) tasks.push((async () => {
    // The public RPC is the source-of-truth projection; never read restricted campaign rows here.
    const { data, error } = await db.rpc('get_public_promotion_campaigns', { p_slug: null });
    if (error) throw error;
    const campaigns = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
    const wanted = new Set(campaignIds);
    for (const campaign of campaigns) {
      const id = typeof campaign.id === 'string' ? campaign.id : '';
      if (!wanted.has(id)) continue;
      addRecord(records, 'promotion_campaign', id, 'title', campaign.title);
      addRecord(records, 'promotion_campaign', id, 'summary', campaign.summary);
      addRecord(records, 'promotion_campaign', id, 'description', campaign.description);
    }
  })());

  if (eventPromotionIds.length) tasks.push((async () => {
    // The base table includes payment/review data and is not public-readable.
    // Select only customer-visible copy and enforce the same publication window
    // as the customer event-promotion listing.
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await db.from('vendor_event_promotions').select('id,title,details')
      .in('id', eventPromotionIds).eq('status', 'paid').gte('ends_on', today);
    if (error) throw error;
    for (const row of data ?? []) {
      addRecord(records, 'vendor_event_promotion', row.id, 'title', row.title);
      addRecord(records, 'vendor_event_promotion', row.id, 'details', row.details);
    }
  })());

  await Promise.all(tasks);
  return records;
}

export async function resolvePublicContentTranslations(
  db: SupabaseClient,
  locale: SupportedTranslationLocale,
  items: PublicTranslationRequestItem[],
  reserveEnqueue: () => Promise<boolean> = async () => true,
): Promise<PublicTranslationResult[]> {
  const sources = await loadPublicContentSources(db, items);
  const sourceRows = items.flatMap((item) => item.fields.flatMap((field) => {
    const source = sources.get(translationResultKey(item.entityType, item.entityId, field));
    return source ? [source] : [];
  }));
  const eligible = sourceRows.filter((source) => !sourceAlreadyMatchesLocale(source.sourceText, locale));
  const sourceHashes = new Map(eligible.map((source) => [
    translationResultKey(source.entityType, source.entityId, source.field),
    sourceHash(source.sourceText),
  ]));

  const entityTypes = [...new Set(eligible.map((source) => source.entityType))];
  const entityKeys = [...new Set(eligible.map((source) => source.entityId))];
  const cachedByKey = new Map<string, string>();
  if (entityTypes.length && entityKeys.length) {
    const { data, error } = await db.from('public_content_translations')
      .select('entity_type,entity_key,field,source_hash,translated_text')
      .in('entity_type', entityTypes).in('entity_key', entityKeys).eq('locale', locale);
    if (error) throw error;
    for (const row of data ?? []) {
      const key = translationResultKey(row.entity_type, row.entity_key, row.field);
      if (sourceHashes.get(key) === row.source_hash) cachedByKey.set(key, row.translated_text);
    }
  }

  const missing = eligible.filter((source) => !cachedByKey.has(translationResultKey(source.entityType, source.entityId, source.field)));
  if (missing.length && await reserveEnqueue()) {
    const jobs = missing.map((source) => ({
      entity_type: source.entityType,
      entity_key: source.entityId,
      field: source.field,
      locale,
      source_hash: sourceHash(source.sourceText),
    }));
    // Cache hits remain usable if the durable queue is temporarily unavailable.
    await db.rpc('enqueue_content_translation_jobs', {
      p_jobs: jobs,
      p_max_backlog: MAX_QUEUE_BACKLOG,
    });
  }

  const pendingByKey = new Set<string>();
  if (missing.length) {
    const entityTypeSet = [...new Set(missing.map((source) => source.entityType))];
    const entityKeySet = [...new Set(missing.map((source) => source.entityId))];
    const { data, error } = await db.from('content_translation_jobs')
      .select('entity_type,entity_key,field,source_hash,status')
      .in('entity_type', entityTypeSet).in('entity_key', entityKeySet).eq('locale', locale)
      .in('status', ['queued', 'processing']);
    // Pending status is only a localized hint; a status-read outage must not
    // hide translations that were already found in the cache.
    if (!error) {
      for (const row of data ?? []) {
        const key = translationResultKey(row.entity_type, row.entity_key, row.field);
        if (sourceHashes.get(key) === row.source_hash) pendingByKey.add(key);
      }
    }
  }

  return items.flatMap((item) => item.fields.map((field) => {
    const key = translationResultKey(item.entityType, item.entityId, field);
    return {
      entityType: item.entityType,
      entityId: item.entityId,
      field,
      translatedText: cachedByKey.get(key) ?? null,
      pending: pendingByKey.has(key),
    };
  }));
}
