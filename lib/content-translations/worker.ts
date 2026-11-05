import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { prepareExternalText, redactPII } from '@/lib/chatbot/pii';
import { buildTranslationPrompt, sourceHash } from '@/lib/recommendations/content-localization';
import { generateAiText, type AiTextResult } from '@/lib/ai/provider';
import { reserveGuestRateLimit } from '@/lib/checkout/guest-session';
import { createServiceClient } from '@/lib/supabase/service';
import { loadPublicContentSources, type PublicSourceRecord } from './server';
import {
  sourceAlreadyMatchesLocale,
  type PublicTranslationEntity,
  type PublicTranslationField,
  type SupportedTranslationLocale,
} from './contract';

export type TranslationJob = {
  id: string;
  entity_type: PublicTranslationEntity;
  entity_key: string;
  field: PublicTranslationField;
  locale: SupportedTranslationLocale;
  source_hash: string;
  attempts: number;
  lease_token: string;
};

type TranslationCandidate = Pick<PublicSourceRecord, 'entityType' | 'entityId' | 'field' | 'sourceText'>;
type TranslationDependencies = {
  loadSource: (job: TranslationJob) => Promise<TranslationCandidate | null>;
  generate: (input: { field: PublicTranslationField; sourceText: string; locale: SupportedTranslationLocale; prompt: { system: string; user: string } }, signal: AbortSignal) => Promise<AiTextResult>;
  reserveGlobalBudget: () => Promise<boolean>;
  complete: (job: TranslationJob, text: string, provider: string, model: string) => Promise<unknown>;
  defer: (job: TranslationJob, errorCode: string) => Promise<unknown>;
  supersede: (job: TranslationJob) => Promise<unknown>;
  releaseForBudget: (job: TranslationJob) => Promise<unknown>;
};

const BLOCKED_OR_CREATED_PII = /(?:\[PHONE\]|\[EMAIL\]|\[IC\]|\[PASSPORT\]|\[CARD\]|\[URL\])/g;

function safeTranslationOutput(sourceText: string, output: string) {
  const trimmed = output.trim();
  if (!trimmed || trimmed.length > 5000 || /<[^>]+>/.test(trimmed) || redactPII(trimmed).found) return null;
  const requiredTokens = sourceText.match(BLOCKED_OR_CREATED_PII) ?? [];
  const outputTokens = new Set(trimmed.match(BLOCKED_OR_CREATED_PII) ?? []);
  if (requiredTokens.some((token) => !outputTokens.has(token))) return null;
  return trimmed;
}

export async function processClaimedTranslationJob(job: TranslationJob, deps: TranslationDependencies) {
  const source = await deps.loadSource(job);
  if (!source || sourceHash(source.sourceText) !== job.source_hash
      || source.entityType !== job.entity_type || source.entityId !== job.entity_key || source.field !== job.field) {
    await deps.supersede(job);
    return 'superseded' as const;
  }

  if (sourceAlreadyMatchesLocale(source.sourceText, job.locale)) {
    await deps.supersede(job);
    return 'source_matches_locale' as const;
  }

  const preparedSource = prepareExternalText(source.sourceText);
  if (!preparedSource.allowed) {
    await deps.supersede(job);
    return 'sensitive_input' as const;
  }

  if (!await deps.reserveGlobalBudget()) {
    await deps.releaseForBudget(job);
    return 'budget_deferred' as const;
  }

  const prompt = buildTranslationPrompt({ field: job.field, sourceText: source.sourceText, locale: job.locale });
  let result: AiTextResult;
  try {
    const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      result = await deps.generate({
        field: job.field,
        sourceText: preparedSource.clean,
        locale: job.locale,
        prompt,
      }, controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    await deps.defer(job, 'provider_unavailable');
    return 'deferred' as const;
  }

  if (!result.available && result.reason === 'sensitive_input') {
    await deps.supersede(job);
    return 'sensitive_input' as const;
  }

  if (!result.available) {
    await deps.defer(job, result.reason === 'not_configured' ? 'provider_not_configured' : 'provider_unavailable');
    return 'deferred' as const;
  }

  // Re-fetch immediately before cache persistence. A source edit or visibility
  // change during the provider call must never publish a stale translation.
  const currentSource = await deps.loadSource(job);
  if (!currentSource || sourceHash(currentSource.sourceText) !== job.source_hash
      || currentSource.entityType !== job.entity_type || currentSource.entityId !== job.entity_key || currentSource.field !== job.field) {
    await deps.supersede(job);
    return 'superseded' as const;
  }

  const translated = safeTranslationOutput(preparedSource.clean.replace(/\b(?:https?:\/\/|www\.)[^\s<>"']+/gi, '[URL]'), result.content);
  if (!translated) {
    await deps.defer(job, 'invalid_translation_output');
    return 'deferred' as const;
  }

  try {
    await deps.complete(job, translated, result.provider, result.model);
    return 'completed' as const;
  } catch {
    await deps.defer(job, 'cache_write_failed');
    return 'deferred' as const;
  }
}

function databaseDependencies(db: SupabaseClient, sources: Map<string, PublicSourceRecord>): TranslationDependencies {
  const sourceReads = new Set<string>();
  return {
    loadSource: async (job) => {
      const key = `${job.entity_type}:${job.entity_key}:${job.field}`;
      if (!sourceReads.has(job.id)) {
        sourceReads.add(job.id);
        return sources.get(key) ?? null;
      }
      const latest = await loadPublicContentSources(db, [{
        entityType: job.entity_type, entityId: job.entity_key, fields: [job.field],
      }]);
      return latest.get(key) ?? null;
    },
    generate: ({ prompt }, signal) => generateAiText(prompt.system, prompt.user, { maxTokens: 1200, maxProviderAttempts: 1, signal }),
    reserveGlobalBudget: () => reserveGuestRateLimit('public-content-translation:provider', 12, 600),
    complete: async (job, text, provider, model) => {
      const { error } = await db.rpc('complete_content_translation_job', {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
        p_current_source_hash: job.source_hash,
        p_translated_text: text,
        p_provider: provider,
        p_model: model,
      });
      if (error) throw error;
    },
    defer: async (job, errorCode) => {
      const { error } = await db.rpc('defer_content_translation_job', {
        p_job_id: job.id, p_lease_token: job.lease_token, p_error_code: errorCode,
      });
      if (error) throw error;
    },
    supersede: async (job) => {
      const { error } = await db.from('content_translation_jobs').update({
        status: 'superseded', lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString(),
      }).eq('id', job.id).eq('status', 'processing').eq('lease_token', job.lease_token);
      if (error) throw error;
    },
    releaseForBudget: async (job) => {
      const { error } = await db.from('content_translation_jobs').update({
        status: 'queued', attempts: Math.max(0, job.attempts - 1),
        available_at: new Date(Date.now() + 30_000).toISOString(),
        lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString(),
      }).eq('id', job.id).eq('status', 'processing').eq('lease_token', job.lease_token);
      if (error) throw error;
    },
  };
}

export async function processContentTranslationJobs(batchSize = 10) {
  const db = createServiceClient();
  const { error: backfillError } = await db.rpc('backfill_public_content_translation_jobs', { p_limit: 50 });
  if (backfillError) throw new Error('translation_backfill_unavailable');
  const { data, error } = await db.rpc('claim_content_translation_jobs', { p_limit: Math.min(4, Math.max(1, batchSize)) });
  if (error) throw new Error('translation_job_claim_failed');
  const jobs = (data ?? []) as TranslationJob[];
  const retentionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await db.from('content_translation_jobs').delete()
    .in('status', ['completed', 'failed', 'superseded']).lt('updated_at', retentionCutoff);
  if (jobs.length === 0) return { claimed: 0, completed: 0, deferred: 0, superseded: 0 };

  const items = jobs.map((job) => ({ entityType: job.entity_type, entityId: job.entity_key, fields: [job.field] }));
  const sources = await loadPublicContentSources(db, items);
  const totals = { claimed: jobs.length, completed: 0, deferred: 0, superseded: 0 };
  const dependencies = databaseDependencies(db, sources);
  for (const job of jobs) {
    try {
      const outcome = await processClaimedTranslationJob(job, dependencies);
      if (outcome === 'completed') totals.completed += 1;
      else if (outcome === 'deferred' || outcome === 'budget_deferred') totals.deferred += 1;
      else totals.superseded += 1;
    } catch {
      totals.deferred += 1;
      await dependencies.defer(job, 'worker_unavailable').catch(() => undefined);
    }
  }
  return totals;
}
