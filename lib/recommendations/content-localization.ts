import { createHash } from 'node:crypto';
import { redactPII } from '@/lib/chatbot/pii';

export type TranslationField = 'name' | 'description';
export type TranslationLocale = 'zh-CN' | 'ms';

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

export function sourceHash(sourceText: string) {
  return createHash('sha256').update(sourceText, 'utf8').digest('hex');
}

export function buildTranslationPrompt(input: {
  field: TranslationField;
  sourceText: string;
  locale: TranslationLocale;
}) {
  const source = redactPII(input.sourceText).clean.replace(URL_PATTERN, '[URL]').slice(0, 2000);
  const targetLanguage = input.locale === 'zh-CN' ? 'Simplified Chinese' : 'Malay';
  return {
    system: 'Translate public tourism business copy accurately. Preserve registered and brand names unless a natural local display form is unambiguous. Return only the translated plain text, without commentary or markup.',
    user: `Translate this ${input.field} into ${targetLanguage}.\n\n${source}`,
  };
}
