import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SUPPORTED_LOCALES = ["en", "zh-CN", "ms"];
const LOCALE_ROOT = ["app", "i18n", "locales"];
const INVENTORY_CONTRACT_NAMES = new Set([
  "sitewide-i18n.contract.test.ts",
  "auth-lifecycle-i18n.contract.test.ts",
]);
const SKIPPED_DIRECTORIES = new Set([".git", ".next", "Docs", "node_modules", "out", "build"]);

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function toPosixPath(value) {
  return value.split("\\").join("/");
}

function relativePath(root, filePath) {
  return toPosixPath(relative(root, filePath));
}

function formatResourceError(root, filePath, locale, namespace, key, message) {
  return `${relativePath(root, filePath)} locale=${locale} namespace=${namespace} key=${key}: ${message}`;
}

function formatNamespaceError(root, filePath, locale, namespace, message) {
  return `${relativePath(root, filePath)} locale=${locale} namespace=${namespace}: ${message}`;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function flattenLeaves(value, prefix = "", entries = new Map()) {
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      const childPath = prefix ? `${prefix}.${key}` : key;
      flattenLeaves(child, childPath, entries);
    }
  } else if (prefix) {
    entries.set(prefix, value);
  }

  return entries;
}

function sortedJsonNamespaces(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name) === ".json")
    .map((entry) => basename(entry.name, ".json"))
    .sort();
}

function parseLocaleFile(root, locale, namespace, errors) {
  const filePath = resolve(root, ...LOCALE_ROOT, locale, `${namespace}.json`);

  if (!existsSync(filePath)) {
    errors.push(formatNamespaceError(root, filePath, locale, namespace, "locale namespace file is missing"));
    return null;
  }

  let source;
  try {
    source = readFileSync(filePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(formatNamespaceError(root, filePath, locale, namespace, `unable to read locale JSON (${message})`));
    return null;
  }

  try {
    return { filePath, value: JSON.parse(source) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(formatNamespaceError(root, filePath, locale, namespace, `malformed JSON (${message})`));
    return null;
  }
}

function collectLocaleFiles(root, errors) {
  const localeRoot = resolve(root, ...LOCALE_ROOT);
  const resources = new Map();

  if (!existsSync(localeRoot)) {
    errors.push(`${relativePath(root, localeRoot)}: locale directory is missing`);
    return { localeRoot, namespaces: [], resources };
  }

  const englishDirectory = resolve(localeRoot, "en");
  const namespaces = sortedJsonNamespaces(englishDirectory);
  if (namespaces.length === 0) {
    errors.push(`${relativePath(root, englishDirectory)} locale=en: no locale namespaces found`);
  }

  for (const locale of SUPPORTED_LOCALES) {
    const localeDirectory = resolve(localeRoot, locale);
    if (!existsSync(localeDirectory)) {
      errors.push(`${relativePath(root, localeDirectory)} locale=${locale}: locale directory is missing`);
      continue;
    }

    const actualNamespaces = sortedJsonNamespaces(localeDirectory);
    for (const namespace of actualNamespaces) {
      if (!namespaces.includes(namespace)) {
        const filePath = resolve(localeDirectory, `${namespace}.json`);
        errors.push(formatNamespaceError(root, filePath, locale, namespace, "namespace is not present in en"));
      }
    }

    const localeResources = new Map();
    for (const namespace of namespaces) {
      const parsed = parseLocaleFile(root, locale, namespace, errors);
      if (parsed) localeResources.set(namespace, parsed);
    }
    resources.set(locale, localeResources);
  }

  return { localeRoot, namespaces, resources };
}

function checkTranslationValues(root, resources, errors) {
  for (const [locale, localeResources] of resources) {
    for (const [namespace, resource] of localeResources) {
      for (const [key, value] of flattenLeaves(resource.value)) {
        if (typeof value === "string" && value.trim() === "") {
          errors.push(formatResourceError(root, resource.filePath, locale, namespace, key, "empty translation value"));
        }
      }
    }
  }
}

function checkKeyParity(root, namespaces, resources, errors) {
  const englishResources = resources.get("en");
  if (!englishResources) return;

  for (const namespace of namespaces) {
    const englishResource = englishResources.get(namespace);
    if (!englishResource) continue;

    const englishKeys = new Set(flattenLeaves(englishResource.value).keys());
    for (const locale of SUPPORTED_LOCALES) {
      if (locale === "en") continue;
      const localeResource = resources.get(locale)?.get(namespace);
      if (!localeResource) continue;

      const localeKeys = new Set(flattenLeaves(localeResource.value).keys());
      const missingKeys = [...englishKeys].filter((key) => !localeKeys.has(key)).sort();
      const extraKeys = [...localeKeys].filter((key) => !englishKeys.has(key)).sort();

      for (const key of missingKeys) {
        errors.push(
          formatResourceError(root, localeResource.filePath, locale, namespace, key, "missing translation key"),
        );
      }
      for (const key of extraKeys) {
        errors.push(
          formatResourceError(root, localeResource.filePath, locale, namespace, key, "extra translation key"),
        );
      }
    }
  }
}

function findInventoryContracts(root) {
  const contracts = [];
  const visit = (directory) => {
    if (!existsSync(directory)) return;

    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      compareStrings(left.name, right.name),
    );
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) visit(resolve(directory, entry.name));
      } else if (entry.isFile() && INVENTORY_CONTRACT_NAMES.has(entry.name)) {
        contracts.push(resolve(directory, entry.name));
      }
    }
  };

  visit(root);
  return contracts.sort();
}

function extractArrayBody(source, startIndex) {
  const bodyStart = source.indexOf("[", startIndex);
  if (bodyStart < 0) return null;

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "[") depth += 1;
    if (source[index] === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart + 1, index);
    }
  }

  return null;
}

function extractInventoryPaths(source, contractPath) {
  const paths = new Set();
  const pathLiteral = /["']((?:app|components)\/[^"']+\.(?:ts|tsx))["']/g;
  const declaration = /(?:(export)\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*\[/g;
  const arrays = [];
  const contractName = basename(contractPath);

  for (const match of source.matchAll(declaration)) {
    const isExported = Boolean(match[1]);
    const name = match[2];
    if (!isExported && !(contractName === "auth-lifecycle-i18n.contract.test.ts" && name === "CODE_FILES")) {
      continue;
    }
    const body = extractArrayBody(source, match.index);
    if (body) arrays.push(body);
  }

  for (const body of arrays) {
    for (const match of body.matchAll(pathLiteral)) {
      const candidate = match[1];
      if (candidate.includes("/__tests__/") || candidate.endsWith(".test.ts") || candidate.endsWith(".spec.ts")) {
        continue;
      }
      paths.add(candidate);
    }
  }

  return [...paths].sort();
}

function checkTrackedInventory(root, errors) {
  const inventory = new Set();
  for (const contractPath of findInventoryContracts(root)) {
    let source;
    try {
      source = readFileSync(contractPath, "utf8");
    } catch {
      continue;
    }
    for (const filePath of extractInventoryPaths(source, contractPath)) inventory.add(filePath);
  }

  for (const filePath of [...inventory].sort()) {
    if (!existsSync(resolve(root, filePath))) {
      errors.push(`${filePath}: tracked UI inventory file is missing`);
    }
  }
}

export function verifyI18nCoverage(root = process.cwd()) {
  const repositoryRoot = resolve(root);
  const errors = [];
  const { namespaces, resources } = collectLocaleFiles(repositoryRoot, errors);

  checkTranslationValues(repositoryRoot, resources, errors);
  checkKeyParity(repositoryRoot, namespaces, resources, errors);
  checkTrackedInventory(repositoryRoot, errors);

  errors.sort(compareStrings);
  return { ok: errors.length === 0, errors };
}

function isDirectCliInvocation() {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectCliInvocation()) {
  const repositoryRoot = process.argv[2] || process.cwd();
  const result = verifyI18nCoverage(repositoryRoot);

  if (result.ok) {
    console.log("i18n coverage ok");
  } else {
    for (const error of result.errors) console.error(error);
    process.exitCode = 1;
  }
}
