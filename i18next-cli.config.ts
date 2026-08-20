import { defineConfig } from "i18next-cli";

export default defineConfig({
  locales: ["en", "zh-CN", "ms"],
  extract: {
    input: [
      "app/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "lib/customer/{discovery-categories,header-navigation}.ts",
      "lib/i18n/invariant-tokens.ts",
      "backend/domains/{catalogue,preferences}.ts",
    ],
    ignore: [
      "**/__tests__/**",
      "**/*.{test,spec}.{ts,tsx}",
      ".next/**",
      "node_modules/**",
    ],
    output: "app/i18n/locales/{{language}}/{{namespace}}.json",
    primaryLanguage: "en",
    secondaryLanguages: ["zh-CN", "ms"],
    defaultNS: "common",
    useTranslationNames: ["useTranslation", "getT", "useT", "getServerTranslation"],
    sort: false,
    indentation: 2,
  },
  lint: {
    checkInterpolationParams: true,
    checkConcatenation: "error",
    acceptedTags: "all",
    // Punctuation-only adjacency is a quality signal, not untranslated copy.
    // Keep it visible without blocking semantic layouts such as label/value rows.
    checkPunctuationConcatenation: "warn",
  },
});
