import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto("http://localhost:3000/customer/explore", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const productImages = await page.locator('img[src*="/storage/v1/object/public/product-images/products/"]').evaluateAll((elements) => elements.map((element) => ({ src: element.src, alt: element.alt, loaded: element.naturalWidth > 0 })));
const sources = productImages.map((item) => item.src);
const duplicates = [...new Set(sources.filter((source, index) => sources.indexOf(source) !== index))].sort();
console.log(JSON.stringify({ renderedProductImages: sources.length, uniqueRenderedProductImages: new Set(sources).size, loadedProductImages: productImages.filter((item) => item.loaded).length, duplicateSources: duplicates.slice(0, 10) }, null, 2));
if (!productImages.length) throw new Error("No product images rendered on customer explore");
if (duplicates.length) throw new Error(`Duplicate product image sources rendered: ${duplicates.join(", ")}`);
if (productImages.some((item) => !item.loaded)) throw new Error("At least one rendered product image did not load");
await browser.close();
