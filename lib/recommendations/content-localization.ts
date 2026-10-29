import { createHash } from 'node:crypto';
import { prepareExternalText } from '@/lib/chatbot/pii';
import type { AppLocale } from '@/lib/i18n/locale';
import type { PublicTranslationField } from '@/lib/content-translations/contract';

export type TranslationField = PublicTranslationField;
export type TranslationLocale = AppLocale;

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

export function sourceHash(sourceText: string) {
  return createHash('sha256').update(sourceText, 'utf8').digest('hex');
}

export function buildTranslationPrompt(input: {
  field: TranslationField;
  sourceText: string;
  locale: TranslationLocale;
}) {
  const preparedSource = prepareExternalText(input.sourceText);
  if (!preparedSource.allowed) throw new Error('sensitive_data_detected');
  const source = preparedSource.clean.replace(URL_PATTERN, '[URL]').slice(0, 2000);
  const targetLanguage = input.locale === 'zh-CN'
    ? 'Simplified Chinese'
    : input.locale === 'ms' ? 'Bahasa Melayu' : 'English';
  return {
    system: 'Translate public tourism business copy accurately. Preserve registered and brand names unless a natural local display form is unambiguous. Return only the translated plain text, without commentary or markup.',
    user: `Translate this ${input.field} into ${targetLanguage}.\n\n${source}`,
  };
}
