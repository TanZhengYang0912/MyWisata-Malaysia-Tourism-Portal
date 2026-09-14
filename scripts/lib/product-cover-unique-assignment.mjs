import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp)$/i;
const DISALLOWED_SOURCE = /picsum|placeholder|generated|illustrative|lorem ipsum/i;
const GENERIC_TOKENS = new Set([
  "the", "and", "for", "from", "with", "set", "pack", "package", "adult", "child", "senior",
  "family", "admission", "entry", "ticket", "guided", "tour", "service", "room", "suite", "deluxe",
  "standard", "premium", "local", "traditional", "signature", "travel", "full", "half", "day", "private",
  "sunset", "evening", "nasi", "mee", "rice", "chicken", "lemak", "mamak", "coffee", "tea", "food",
  "product", "real", "online", "published", "normal", "international", "malaysian", "return", "mykad",
]);

export function sha256File(filepath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filepath)).digest("hex");
}

export function tokens(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\.(?:jpe?g|png|webp)$/i, "")
    .replace(/-[0-9a-f]{8}$/i, "")
    .replace(/-real$/i, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function productTokens(product) {
  return new Set([...tokens(product.slug), ...tokens(product.name)].filter((token) => !GENERIC_TOKENS.has(token)));
}

export function candidateScore(product, candidate) {
  const wanted = productTokens(product);
  const filenameTokens = new Set(tokens(candidate.filename));
  const slugTokens = tokens(product.slug).filter((token) => !GENERIC_TOKENS.has(token));
  let nameHits = 0;
  let slugPrefixHits = 0;
  for (const token of wanted) if (filenameTokens.has(token)) nameHits += 1;
  for (const token of slugTokens.slice(0, 4)) if (filenameTokens.has(token)) slugPrefixHits += 1;
  const exact = candidate.baseSlug === tokens(product.slug).join("-") || candidate.filename.startsWith(`${product.slug}-real.`);
  const category = String(product.category ?? product.product_type ?? "").toLowerCase();
  const categoryHit = category && filenameTokens.has(category) ? 3 : 0;
  return nameHits * 3 + slugPrefixHits * 4 + categoryHit + (exact ? 1000 : 0);
}

function candidateSort(product, left, right) {
  const manifestDelta = (Number(right.manifestPriority ?? 0) - Number(left.manifestPriority ?? 0));
  if (manifestDelta !== 0) return manifestDelta;
  const productManifestDelta = Number(right.manifestSlug === product.slug) - Number(left.manifestSlug === product.slug);
  if (productManifestDelta !== 0) return productManifestDelta;
  const scoreDelta = candidateScore(product, right) - candidateScore(product, left);
  if (scoreDelta !== 0) return scoreDelta;
  if (Boolean(right.filename.includes("-real.")) !== Boolean(left.filename.includes("-real."))) {
    return right.filename.includes("-real.") ? 1 : -1;
  }
  return left.filename.localeCompare(right.filename);
}

/**
 * Assign one different content hash to every product.
 * Exact filename matches are reserved first, then the remaining candidates
 * are selected by stable product/file token relevance.
 */
export function assignUniqueProductMedia(products, candidates) {
  const available = new Map(candidates.map((candidate) => [candidate.sha256, candidate]));
  const assignments = new Map();

  for (const product of products) {
    const exact = [...available.values()]
      .filter((candidate) => candidate.baseSlug === tokens(product.slug).join("-"))
      .sort((left, right) => candidateSort(product, left, right));
    if (exact[0]) {
      assignments.set(product.slug, exact[0]);
      available.delete(exact[0].sha256);
    }
  }

  for (const product of products) {
    if (assignments.has(product.slug)) continue;
    const ranked = [...available.values()].sort((left, right) => candidateSort(product, left, right));
    const selected = ranked[0];
    if (!selected) throw new Error(`No unique product image candidate remains for ${product.slug}`);
    assignments.set(product.slug, selected);
    available.delete(selected.sha256);
  }

  const selected = products.map((product) => ({ product, candidate: assignments.get(product.slug) }));
  if (new Set(selected.map(({ candidate }) => candidate?.sha256)).size !== products.length) {
    throw new Error("Product image assignment contains duplicate content hashes");
  }
  return selected;
}

export function loadProductImageCandidates({ root, currentManifest, verifiedProducts, entityMedia }) {
  const productsDir = path.resolve(root, "public/assets/customer/products");
  const byPath = new Map();
  const addPathMetadata = (item, priority) => {
    const assetPath = String(item.asset_path ?? "");
    if (!assetPath) return;
    const filename = path.basename(assetPath);
    const existing = byPath.get(filename);
    if (!existing || priority > existing.priority) byPath.set(filename, { item, priority });
  };
  for (const item of currentManifest) addPathMetadata(item, 3);
  for (const item of verifiedProducts) addPathMetadata(item, 4);

  const byHash = new Map();
  for (const group of [...(entityMedia.vendors ?? []), ...(entityMedia.outlets ?? [])]) {
    for (const item of group.gallery ?? []) {
      if (!item.sha256 || byHash.has(item.sha256)) continue;
      byHash.set(item.sha256, {
        source_type: "commons",
        source_page: item.sourceUrl,
        source_image_url: item.sourceImageUrl,
        title: item.title,
        artist: item.artist,
        license: item.license,
        sha256: item.sha256,
      });
    }
  }

  const candidatesByHash = new Map();
  for (const filename of fs.readdirSync(productsDir).filter((item) => IMAGE_EXTENSION.test(item))) {
    const absolute = path.join(productsDir, filename);
    const sha256 = sha256File(absolute);
    const pathMetadata = byPath.get(filename)?.item;
    const metadata = pathMetadata ?? byHash.get(sha256);
    if (!metadata || !metadata.source_page || !metadata.source_image_url || !metadata.artist || !metadata.license) continue;
    if (DISALLOWED_SOURCE.test(`${metadata.source_page} ${metadata.source_image_url} ${metadata.artist} ${metadata.license} ${metadata.title ?? ""}`)) continue;
    if (candidatesByHash.has(sha256)) continue;
    const baseSlug = filename
      .replace(IMAGE_EXTENSION, "")
      .replace(/-(?:real|semantic)$/i, "")
      .replace(/-[0-9a-f]{8}$/i, "");
    candidatesByHash.set(sha256, {
      filename,
      asset_path: `/assets/customer/products/${filename}`,
      baseSlug,
      sha256,
      source_type: metadata.source_type === "commons" ? "commons" : metadata.source_type ?? "commons",
      source_page: metadata.source_page ?? metadata.sourceUrl,
      source_image_url: metadata.source_image_url ?? metadata.sourceImageUrl,
      title: metadata.title ?? null,
      artist: metadata.artist,
      license: metadata.license,
      manifestSlug: pathMetadata?.slug ?? null,
      manifestPriority: byPath.get(filename)?.priority ?? 0,
    });
  }
  return [...candidatesByHash.values()];
}
