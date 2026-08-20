import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SOURCE_ROOTS = ["app", "components", "lib"];
const SKIPPED_DIRECTORIES = new Set(["__tests__", ".next", "node_modules"]);

function toPosixPath(value) {
  return value.split("\\").join("/");
}

function translationCallName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return "";
}

function isTranslationCall(node) {
  if (!ts.isCallExpression(node) || node.arguments.length < 2) return false;
  const name = translationCallName(node.expression);
  return name === "t" || /^t[A-Z]/.test(name) || name === "translate";
}

function propertyName(property) {
  if (!property.name) return "";
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) return property.name.text;
  return "";
}

function sourceFiles(root) {
  const files = [];
  const visit = (directory) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) visit(path);
      } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)) {
        files.push(path);
      }
    }
  };
  for (const sourceRoot of SOURCE_ROOTS) visit(resolve(root, sourceRoot));
  return files.sort();
}

export function verifyI18nDefaultValues(root = process.cwd()) {
  const repositoryRoot = resolve(root);
  const errors = [];

  for (const filePath of sourceFiles(repositoryRoot)) {
    const source = readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const visit = (node) => {
      if (isTranslationCall(node)) {
        const options = node.arguments[1];
        if (ts.isObjectLiteralExpression(options)) {
          for (const property of options.properties) {
            if (propertyName(property) !== "defaultValue") continue;
            const position = sourceFile.getLineAndCharacterOfPosition(property.getStart(sourceFile));
            errors.push(
              `${toPosixPath(relative(repositoryRoot, filePath))}:${position.line + 1}:${position.character + 1} `
              + "translation defaultValue is forbidden; add the key to every locale instead",
            );
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return { ok: errors.length === 0, errors: errors.sort() };
}

function isDirectCliInvocation() {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectCliInvocation()) {
  const result = verifyI18nDefaultValues(process.argv[2] || process.cwd());
  if (result.ok) {
    console.log("i18n defaultValue check ok");
  } else {
    for (const error of result.errors) console.error(error);
    process.exitCode = 1;
  }
}
