import { APP_LOCALES, isAppLocale, type AppLocale } from '@/lib/i18n/locale';
import { detectLanguage } from '@/lib/chatbot/language';

export const PUBLIC_TRANSLATION_FIELDS = {
  product: ['name', 'description'],
  place: ['name', 'tagline', 'intro'],
  place_informational_activity: ['title', 'description'],
  review: ['title', 'body'],
  promotion_campaign: ['title', 'summary', 'description'],
  vendor_event_promotion: ['title', 'details'],
} as const;

export type PublicTranslationEntity = keyof typeof PUBLIC_TRANSLATION_FIELDS;
export type PublicTranslationField = (typeof PUBLIC_TRANSLATION_FIELDS)[PublicTranslationEntity][number];
export type SupportedTranslationLocale = AppLocale;

export type PublicTranslationRequestItem = {
  entityType: PublicTranslationEntity;
  entityId: string;
  fields: PublicTranslationField[];
};

export type PublicTranslationResult = {
  entityType: PublicTranslationEntity;
  entityId: string;
  field: PublicTranslationField;
  translatedText: string | null;
  pending: boolean;
};

export function isSupportedTranslationLocale(value: unknown): value is SupportedTranslationLocale {
  return isAppLocale(value) && APP_LOCALES.includes(value);
}

export function isPublicTranslationField(entityType: unknown, field: unknown): entityType is PublicTranslationEntity {
  if (typeof entityType !== 'string' || typeof field !== 'string' || !(entityType in PUBLIC_TRANSLATION_FIELDS)) return false;
  return (PUBLIC_TRANSLATION_FIELDS as Record<string, readonly string[]>)[entityType].includes(field);
}

export function sourceAlreadyMatchesLocale(sourceText: string, locale: SupportedTranslationLocale): boolean {
  const language = detectLanguage(sourceText);
  const sourceLocale = language === 'zh' ? 'zh-CN' : language === 'bm' ? 'ms' : 'en';
  return sourceText.trim().length === 0 || sourceLocale === locale;
}

export function translationResultKey(
  entityType: PublicTranslationEntity,
  entityId: string,
  field: PublicTranslationField,
): string {
  return `${entityType}:${entityId}:${field}`;
}
