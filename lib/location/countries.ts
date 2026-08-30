export const ISO_COUNTRY_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(" ") as readonly string[];

export type CountryOption = {
  code: string;
  label: string;
  canonicalName: string;
};

export const DEFAULT_COUNTRY_CODE = "MY";

const legacyCodeAliases: Record<string, string> = { UK: "GB" };
const optionCache = new Map<string, CountryOption[]>();

export function isCountryCode(value: string): boolean {
  return ISO_COUNTRY_CODES.includes(value.trim().toUpperCase());
}

function displayNames(locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    return new Intl.DisplayNames(["en"], { type: "region" });
  }
}

export function getCanonicalCountryName(code: string): string {
  const normalized = code.trim().toUpperCase();
  return displayNames("en").of(normalized) ?? normalized;
}

export function getCountryOptions(locale: string): CountryOption[] {
  const cacheKey = locale || "en";
  const cached = optionCache.get(cacheKey);
  if (cached) return cached;

  const localized = displayNames(cacheKey);
  const options = ISO_COUNTRY_CODES.map((code) => ({
    code,
    label: localized.of(code) ?? getCanonicalCountryName(code),
    canonicalName: getCanonicalCountryName(code),
  })).sort((left, right) => left.label.localeCompare(right.label, cacheKey));
  optionCache.set(cacheKey, options);
  return options;
}

export function findCountryCode(value: string | null | undefined, locale: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_COUNTRY_CODE;
  const upper = trimmed.toUpperCase();
  const aliased = legacyCodeAliases[upper] ?? upper;
  if (ISO_COUNTRY_CODES.includes(aliased)) return aliased;

  const localeLower = trimmed.toLocaleLowerCase(locale);
  const englishLower = trimmed.toLocaleLowerCase("en");
  const match = getCountryOptions(locale).find((option) => (
    option.label.toLocaleLowerCase(locale) === localeLower
    || option.canonicalName.toLocaleLowerCase("en") === englishLower
  ));
  return match?.code ?? null;
}
