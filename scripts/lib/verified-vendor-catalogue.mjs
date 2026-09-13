import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const MIN_PRODUCTS_PER_OUTLET = 5;

const SUPPORTED_PRODUCT_TYPES = new Set(["product", "activity", "experience", "food", "digital", "service"]);
const HTTPS_URL = /^https:\/\//;

export function stableVerifiedProductUuid(vendorId, slug) {
  const hex = crypto.createHash("md5").update(`mywisata:verified-product:${vendorId}:${slug}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export function readVerifiedCatalogue(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateUrl(value, label, issues) {
  if (typeof value !== "string" || !HTTPS_URL.test(value)) issues.push(`${label} must be an https URL`);
}

/**
 * Validate a source-backed vendor batch before it can be written remotely.
 * This function is deliberately pure so tests can exercise the data gate
 * without a Supabase connection or a browser session.
 */
export function validateVerifiedCatalogue(data, { root = process.cwd(), minimumProductsPerOutlet = MIN_PRODUCTS_PER_OUTLET } = {}) {
  const issues = [];
  if (!data?.vendor?.id || !data.vendor.name) issues.push("vendor identity is required");
  validateUrl(data?.vendor?.source_page, "vendor.source_page", issues);
  if (!Array.isArray(data?.outlets) || data.outlets.length === 0) issues.push("at least one outlet is required");
  if (!Array.isArray(data?.products) || data.products.length < minimumProductsPerOutlet) {
    issues.push(`at least ${minimumProductsPerOutlet} products are required per outlet batch`);
  }

  const outletIds = new Set();
  for (const outlet of data?.outlets ?? []) {
    if (!outlet.id || !outlet.name) issues.push("each outlet needs an id and name");
    if (outletIds.has(outlet.id)) issues.push(`duplicate outlet id: ${outlet.id}`);
    outletIds.add(outlet.id);
    if (outlet.vendor_id && outlet.vendor_id !== data.vendor.id) issues.push(`outlet belongs to another vendor: ${outlet.id}`);
  }

  const productSlugs = new Set();
  const assetHashes = new Set();
  for (const product of data?.products ?? []) {
    if (!product.slug || !product.name) issues.push("each product needs a slug and name");
    if (productSlugs.has(product.slug)) issues.push(`duplicate product slug: ${product.slug}`);
    productSlugs.add(product.slug);
    if (!SUPPORTED_PRODUCT_TYPES.has(product.product_type)) issues.push(`unsupported product type: ${product.slug}`);
    if (typeof product.requires_booking !== "boolean") issues.push(`requires_booking must be boolean: ${product.slug}`);
    if (!Number.isFinite(Number(product.base_price)) || Number(product.base_price) < 0) issues.push(`invalid base price: ${product.slug}`);
    validateUrl(product.source_page, `${product.slug}.source_page`, issues);
    validateUrl(product.source_image_url, `${product.slug}.source_image_url`, issues);
    validateUrl(product.price_reference_page ?? data?.vendor?.price_reference_page, `${product.slug}.price_reference_page`, issues);
    if (!product.observed_at) issues.push(`price/source observation date is required: ${product.slug}`);
    if (!product.asset_path || !product.sha256) {
      issues.push(`local asset and sha256 are required: ${product.slug}`);
      continue;
    }
    const assetPath = path.resolve(root, "public", product.asset_path.replace(/^\//, ""));
    if (!fs.existsSync(assetPath)) {
      issues.push(`missing local asset: ${product.asset_path}`);
      continue;
    }
    const hash = crypto.createHash("sha256").update(fs.readFileSync(assetPath)).digest("hex");
    if (hash !== product.sha256) issues.push(`sha256 mismatch: ${product.slug}`);
    if (assetHashes.has(hash)) issues.push(`duplicate image content: ${product.slug}`);
    assetHashes.add(hash);
  }

  const legacy = data.archive_legacy_slugs ?? [];
  if (!Array.isArray(legacy) || legacy.some((slug) => typeof slug !== "string" || !slug)) issues.push("archive_legacy_slugs must be a list of slugs");
  return { issues, allRequirementsPass: issues.length === 0 };
}

export function buildVerifiedProductRows(data, { categoryId = null } = {}) {
  return data.products.map((product) => ({
    id: stableVerifiedProductUuid(data.vendor.id, product.slug),
    vendor_id: data.vendor.id,
    outlet_id: null,
    category_id: categoryId,
    name: product.name,
    slug: product.slug,
    description: product.description,
    product_type: product.product_type,
    requires_booking: product.requires_booking,
    base_price: Number(product.base_price),
    currency: product.currency ?? "MYR",
    cover_url: path.basename(product.asset_path),
    status: "active",
    review_status: "approved",
    tags: [...new Set([...(product.tags ?? []), "verified-source"])],
  }));
}

export function buildVerifiedOfferRows(data, productRows) {
  const productBySlug = new Map(productRows.map((product) => [product.slug, product]));
  return data.outlets.flatMap((outlet) => data.products.map((product) => ({
    product_id: productBySlug.get(product.slug).id,
    outlet_id: outlet.id,
    price: Number(product.outlet_prices?.[outlet.id] ?? product.base_price),
    status: "active",
  })));
}

export function getVerifiedAssetContentType(assetPath) {
  const extension = path.extname(assetPath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}
