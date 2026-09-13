#!/usr/bin/env node

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public");
const OBSERVED_AT = "2026-09-13";

const media = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/data/verified-place-activity-media.json"), "utf8")).activities;
const mediaBySlug = new Map(media.map((entry) => [entry.slug, entry]));

const batches = [
  {
    manifest: "verified-pelangi-beach-resort-products.json",
    vendor: { id: "7aec736a-a9df-1dfe-e7f2-683dc3694b1a", name: "Pelangi Beach Resort & Spa", source_page: "https://www.pelangiresort.com/rooms" },
    outlets: [{ id: "5016d273-eb84-d20d-81ab-f9022bf401fa", name: "Pelangi Beach Resort & Spa" }],
    archive_legacy_slugs: [],
    product_type: "service",
    requires_booking: true,
    products: [
      ["pelangi-garden-terrace-3d2n-twin", "Pelangi Garden Terrace — 3D2N Adult Twin Package", "Three-day, two-night Garden Terrace package for two adults sharing a twin room, with the room type and adult-twin package rate published by a Malaysian travel operator for the resort.", 1638, "https://image-tc.galaxy.tf/wijpeg-9yq4zx60zdcle2v2tu6iljp0p/garden-terrace-listing_standard.jpg?crop=209%2C0%2C1549%2C1162", "https://asahivacations.com.my/wp-content/uploads/2025/01/2025-PElangi-e.pdf"],
      ["pelangi-lakefront-3d2n-twin", "Pelangi Lakefront — 3D2N Adult Twin Package", "Three-day, two-night Lake Front package for two adults sharing a twin room, with the room type and adult-twin package rate published by a Malaysian travel operator for the resort.", 1698, "https://image-tc.galaxy.tf/wijpeg-axw56duouwoi2sraqebyndgqn/lakefront-room_standard.jpg?crop=112%2C0%2C1777%2C1333", "https://asahivacations.com.my/wp-content/uploads/2025/01/2025-PElangi-e.pdf"],
      ["pelangi-island-view-3d2n-twin", "Pelangi Island View — 3D2N Adult Twin Package", "Three-day, two-night Island View package for two adults sharing a twin room, with the room type and adult-twin package rate published by a Malaysian travel operator for the resort.", 1868, "https://image-tc.galaxy.tf/wijpeg-4zmrd2ewf5qezmh4wrvgalj6d/island-view-family-room-listing-1_standard.jpg?crop=108%2C0%2C987%2C740", "https://asahivacations.com.my/wp-content/uploads/2025/01/2025-PElangi-e.pdf"],
      ["pelangi-seaview-3d2n-twin", "Pelangi Seaview — 3D2N Adult Twin Package", "Three-day, two-night Seaview package for two adults sharing a twin room, with the room type and adult-twin package rate published by a Malaysian travel operator for the resort.", 2068, "https://image-tc.galaxy.tf/wijpeg-a7hw0otzinfai5b8p30ecwwio/seaview-listing_standard.jpg?crop=0%2C0%2C1140%2C855", "https://asahivacations.com.my/wp-content/uploads/2025/01/2025-PElangi-e.pdf"],
      ["pelangi-garden-family-room", "Pelangi Garden Family Room", "Garden Family Room for up to two adults and two children under 12, listed on Pelangi Beach Resort's official room page with its current starting rate.", 145, "https://image-tc.galaxy.tf/wijpeg-5t1ttbb2m916ns5dh65c6njby/family-room_standard.jpg?crop=89%2C0%2C903%2C677", "https://www.pelangiresort.com/garden-family-room"],
    ],
    source_page: "https://www.pelangiresort.com/rooms",
    artist: "Pelangi Beach Resort official website; Asahi Vacations travel package PDF",
    license: "Official resort media and published travel-package media; source attribution recorded",
  },
  {
    manifest: "verified-legoland-hotel-products.json",
    vendor: { id: "1981c34a-47c6-f73b-2285-ccd590003575", name: "Legoland Hotel Malaysia", source_page: "https://www.legoland.com.my/hotel/discover/room-overview/" },
    outlets: [{ id: "870c05e3-813a-6d95-fc35-b1458d82f66e", name: "Legoland Hotel Malaysia" }],
    archive_legacy_slugs: [],
    product_type: "service",
    requires_booking: true,
    products: [
      ["legoland-hotel-kingdom-premium", "LEGOLAND Hotel Kingdom Premium Room", "LEGO-themed Kingdom Premium room for up to five guests, with separate adult and children sleeping areas and breakfast-inclusive booking availability.", 792, "https://www.legoland.com.my/media/whdp1mps/1200x630-hotel-2222.jpg?format=jpg", "https://www.legoland.com.my/hotel/discover/room-overview/kingdom-premium/"],
      ["legoland-hotel-pirate-premium", "LEGOLAND Hotel Pirate Premium Room", "LEGO-themed Pirate Premium room for up to five guests, listed on the official LEGOLAND Hotel room page.", 792, "https://www.legoland.com.my/media/jvsgx5ot/1200x630-hotel-22.jpg?format=jpg", "https://www.legoland.com.my/hotel/discover/room-overview/pirate-premium/"],
      ["legoland-hotel-adventure-premium", "LEGOLAND Hotel Adventure Premium Room", "LEGO-themed Adventure Premium room for up to five guests, listed on the official LEGOLAND Hotel room page.", 792, "https://www.legoland.com.my/media/5pafmcrj/1200x630-hotel-31.jpg?format=jpg", "https://www.legoland.com.my/hotel/discover/room-overview/adventure-premium/"],
      ["legoland-hotel-ninjago-premium", "LEGOLAND Hotel NINJAGO Premium Room", "LEGO-themed NINJAGO Premium room for up to five guests, listed on the official LEGOLAND Hotel room page.", 840, "https://www.legoland.com.my/media/caify5sb/1200x630-hotel-333.jpg?format=jpg", "https://www.legoland.com.my/hotel/discover/room-overview/ninjago-premium/"],
      ["legoland-hotel-kingdom-suite", "LEGOLAND Hotel Kingdom Suite", "LEGO-themed Kingdom Suite with the official room page's published starting rate and room features.", 1887, "https://www.legoland.com.my/media/y0dpndiu/kingdom-suite-1-1800x1200.jpg", "https://www.legoland.com.my/hotel/discover/room-overview/kingdom-suite/"],
    ],
    source_page: "https://www.legoland.com.my/hotel/discover/room-overview/",
    artist: "LEGOLAND Malaysia Resort official website",
    license: "Official LEGOLAND Malaysia Resort media; source attribution recorded",
  },
  {
    manifest: "verified-nasi-kandar-yasmeen-products.json",
    vendor: { id: "2ba01d12-f860-a932-b7ae-9a38d3fb0088", name: "Restoran Nasi Kandar Yasmeen", source_page: "https://www.foodpanda.my/restaurant/t3dr/restoran-nasi-kandar-yasmeen-alor-setar" },
    outlets: [{ id: "e4483d6a-3c1f-c788-c936-f17c4459f560", name: "Restoran Nasi Kandar Yasmeen" }],
    archive_legacy_slugs: [],
    product_type: "food",
    requires_booking: false,
    source_type: "marketplace",
    products: [
      ["yasmeen-nasi-kandar-ayam-goreng", "Nasi Kandar + Ayam Goreng", "Nasi Kandar with fried chicken listed on Restoran Nasi Kandar Yasmeen's current delivery menu.", 10.9, "https://images.deliveryhero.io/image/fd-my/products/1158976730.jpg", "https://www.foodpanda.my/restaurant/t3dr/restoran-nasi-kandar-yasmeen-alor-setar"],
      ["yasmeen-nasi-kandar-ayam-telur", "Nasi Kandar + Ayam Goreng + Telur", "Nasi Kandar with fried chicken and egg listed on Restoran Nasi Kandar Yasmeen's current delivery menu.", 12.9, "https://images.deliveryhero.io/image/fd-my/products/1158976732.jpg", "https://www.foodpanda.my/restaurant/t3dr/restoran-nasi-kandar-yasmeen-alor-setar"],
      ["yasmeen-nasi-kandar-ayam-half", "Nasi Kandar + Ayam 1/2", "Nasi Kandar with half chicken listed on Restoran Nasi Kandar Yasmeen's current delivery menu.", 7, "https://images.deliveryhero.io/image/fd-my/products/1160868093.jpg", "https://www.foodpanda.my/restaurant/t3dr/restoran-nasi-kandar-yasmeen-alor-setar"],
      ["yasmeen-teh-ais", "Teh Ais", "Iced milk tea listed on Restoran Nasi Kandar Yasmeen's current delivery menu.", 3.5, "https://images.deliveryhero.io/image/fd-my/products/1428777590.jpg", "https://www.foodpanda.my/restaurant/t3dr/restoran-nasi-kandar-yasmeen-alor-setar"],
      ["yasmeen-telur-sotong", "Telur Sotong", "Squid roe listed as an a la carte item on Restoran Nasi Kandar Yasmeen's current delivery menu.", 8.6, "https://images.deliveryhero.io/image/fd-my/products/1158976822.jpg", "https://www.foodpanda.my/restaurant/t3dr/restoran-nasi-kandar-yasmeen-alor-setar"],
    ],
    source_page: "https://www.foodpanda.my/restaurant/t3dr/restoran-nasi-kandar-yasmeen-alor-setar",
    artist: "Foodpanda marketplace listing imagery",
    license: "Marketplace listing media; menu and prices observed from Foodpanda listing",
  },
  {
    manifest: "verified-jonker-88-products.json",
    vendor: { id: "559e8e4d-a8e7-10f3-09f1-45656fd9f0d5", name: "Jonker 88 Heritage", source_page: "https://www.foodpanda.my/ms/restaurant/xwqq/jonker-88-jalan-hang-tuah" },
    outlets: [{ id: "1d22d64f-de58-607d-15fa-130787aa2acf", name: "Jonker 88 Heritage" }],
    archive_legacy_slugs: [],
    product_type: "food",
    requires_booking: false,
    source_type: "marketplace",
    products: [
      ["jonker-88-baba-cendol", "Jonker 88 Baba Cendol", "Baba Cendol listed on Jonker 88's current delivery menu.", 7, "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/ca/Cendol_in_Penang.jpg/960px-Cendol_in_Penang.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", "https://www.foodpanda.my/ms/restaurant/xwqq/jonker-88-jalan-hang-tuah"],
      ["jonker-88-baba-durian-cendol", "Jonker 88 Baba Durian Cendol", "Baba Durian Cendol listed on Jonker 88's current delivery menu.", 9, "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ec/Cendol_Melaka_JohorBahru_Akaka_Malaysia.jpg/960px-Cendol_Melaka_JohorBahru_Akaka_Malaysia.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", "https://www.foodpanda.my/ms/restaurant/xwqq/jonker-88-jalan-hang-tuah"],
      ["jonker-88-ice-kacang", "Jonker 88 Ice Kacang", "Ice Kacang listed on Jonker 88's current delivery menu.", 7, "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/38/Ais_kacang.jpg/960px-Ais_kacang.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", "https://www.foodpanda.my/ms/restaurant/xwqq/jonker-88-jalan-hang-tuah"],
      ["jonker-88-durian-ice-kacang", "Jonker 88 Durian Ice Kacang", "Durian Ice Kacang listed on Jonker 88's current delivery menu.", 9, "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/26/Singapore_food_-_Ice_kacang_at_Food_Republic_Nov_2016.jpg/960px-Singapore_food_-_Ice_kacang_at_Food_Republic_Nov_2016.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", "https://www.foodpanda.my/ms/restaurant/xwqq/jonker-88-jalan-hang-tuah"],
      ["jonker-88-eight-precious-cendol", "Jonker 88 Eight Precious Cendol", "Eight Precious Cendol listed on Jonker 88's current delivery menu.", 9, "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4a/Cendol_mix_%2812593414285%29.jpg/960px-Cendol_mix_%2812593414285%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", "https://www.foodpanda.my/ms/restaurant/xwqq/jonker-88-jalan-hang-tuah"],
    ],
    source_page: "https://www.foodpanda.my/ms/restaurant/xwqq/jonker-88-jalan-hang-tuah",
    artist: "Wikimedia Commons contributors; menu source Foodpanda listing",
    license: "Wikimedia Commons media; menu and prices observed from marketplace listing",
  },
  {
    manifest: "verified-hiap-joo-bakery-products.json",
    vendor: { id: "1661f4ea-c8e3-73e5-583d-a05f7e503ec2", name: "Hiap Joo Bakery", source_page: "https://www.bernama.com/en/general/news.php?id=2573945" },
    outlets: [{ id: "0af6a16f-e207-9f2c-8b1f-644546bffb65", name: "Hiap Joo Bakery" }],
    archive_legacy_slugs: [],
    product_type: "product",
    requires_booking: false,
    products: [
      ["hiap-joo-banana-cake", "Hiap Joo Banana Cake", "Banana cake sold by Hiap Joo Bakery at the price reported after a June 2026 bakery visit.", 13, "https://web14.bernama.com/storage/photos/e0c670b295125e0edaeee8df31e6ff616a40770cadceb", "https://www.bernama.com/en/general/news.php?id=2573945"],
      ["hiap-joo-coconut-buns", "Hiap Joo Coconut Buns — Pack", "Coconut buns sold by Hiap Joo Bakery in a pack, with the price reported after a June 2026 bakery visit.", 6, "https://web14.bernama.com/storage/photos/4c48b1c95ed8046edbe61ae8aac4fa6b6a4076b4b22fc", "https://www.bernama.com/en/general/news.php?id=2573945"],
      ["hiap-joo-raisin-buns", "Hiap Joo Raisin Buns — Pack", "Raisin buns sold by Hiap Joo Bakery in a pack, with the price reported after a June 2026 bakery visit.", 6, "https://web14.bernama.com/storage/photos/ac1078bff3032a2d9c38f68b29e8487a6a4076d850baf", "https://www.bernama.com/en/general/news.php?id=2573945"],
      ["hiap-joo-peanut-buns", "Hiap Joo Peanut Buns — Pack", "Peanut buns sold by Hiap Joo Bakery in a pack, with the price reported after a June 2026 bakery visit.", 6, "https://web14.bernama.com/storage/photos/d4bb754ef19591c546f53ef0d664bd746a4077605c2cc", "https://www.bernama.com/en/general/news.php?id=2573945"],
      ["hiap-joo-kaya-buns", "Hiap Joo Kaya Buns — Pack", "Kaya buns sold by Hiap Joo Bakery in a pack, with the price reported after a June 2026 bakery visit.", 6, "https://web14.bernama.com/storage/photos/ff2be70cf6900eae1ee338152fbfa97c6a4077903178a", "https://www.bernama.com/en/general/news.php?id=2573945"],
    ],
    source_page: "https://www.bernama.com/en/general/news.php?id=2573945",
    artist: "BERNAMA / fotoBERNAMA 2026",
  },
  {
    manifest: "verified-desa-murni-batik-products.json",
    vendor: { id: "18e80c10-d1fa-c384-4886-d0fd02f8959b", name: "Desa Murni Batik", source_page: "https://desamurnibatikwholesale.com/Default.aspx?nc=1" },
    outlets: [{ id: "c671d865-5893-19c1-de83-fcf1901d49bc", name: "Desa Murni Batik" }],
    archive_legacy_slugs: [],
    product_type: "product",
    requires_booking: false,
    products: [
      ["desa-murni-batik-fadiah-wan-16", "Batik FADIAH WAN 16", "Batik garment listed in Desa Murni Batik's official wholesale shop with its current price and product image.", 88, "https://img.Squarelet.com/ghimg.ashx?sq=d8c27a1c-fa93-45eb-a4da-0b96dde23413", "https://desamurnibatikwholesale.com/Default.aspx?nc=1"],
      ["desa-murni-batik-fadiah-wan-15", "Batik FADIAH WAN 15", "Batik garment listed in Desa Murni Batik's official wholesale shop with its current price and product image.", 88, "https://img.Squarelet.com/ghimg.ashx?sq=a0c2ae2c-ebfa-4129-807f-e521d9532cb3", "https://desamurnibatikwholesale.com/Default.aspx?nc=1"],
      ["desa-murni-batik-fadiah-wan-14", "Batik FADIAH WAN 14", "Batik garment listed in Desa Murni Batik's official wholesale shop with its current price and product image.", 88, "https://img.Squarelet.com/ghimg.ashx?sq=74960aa6-8e59-4a0b-a88a-4edd9917c161", "https://desamurnibatikwholesale.com/Default.aspx?nc=1"],
      ["desa-murni-batik-fadiah-wan-13", "Batik FADIAH WAN 13", "Batik garment listed in Desa Murni Batik's official wholesale shop with its current price and product image.", 88, "https://img.Squarelet.com/ghimg.ashx?sq=06473be7-fcab-4efd-88e6-7e4a0d29478f", "https://desamurnibatikwholesale.com/Default.aspx?nc=1"],
      ["desa-murni-batik-fadiah-wan-12", "Batik FADIAH WAN 12", "Batik garment listed in Desa Murni Batik's official wholesale shop with its current price and product image.", 88, "https://img.Squarelet.com/ghimg.ashx?sq=5dea0d20-e644-484f-aa20-177ec90076d2", "https://desamurnibatikwholesale.com/Default.aspx?nc=1"],
    ],
    source_page: "https://desamurnibatikwholesale.com/Default.aspx?nc=1",
    artist: "Desa Murni Batik official online shop",
  },
  {
    manifest: "verified-cameron-valley-tea-products.json",
    vendor: { id: "7a17248b-58e9-2e16-9ad5-3d42176a4263", name: "Cameron Valley Tea Shop", source_page: "https://bharattea.com.my/" },
    outlets: [{ id: "a6ce4442-c6da-aaf5-3458-164fc5d1060b", name: "Cameron Valley Tea Shop" }],
    archive_legacy_slugs: [],
    product_type: "product",
    requires_booking: false,
    products: [
      ["cameron-valley-cv-100-grams", "Cameron Valley Tea — 100 grams", "Cameron Valley black tea product sold by the official Cameron Valley Tea shop.", 3.5, "https://bharattea.com.my/wp-content/uploads/2024/04/aa844ccd-b196-4f11-b133-8b9fab84b276.jpeg", "https://bharattea.com.my/product/cv-100-grams/"],
      ["cameron-valley-cv-200-grams", "Cameron Valley Tea — 200 grams", "Cameron Valley tea product sold by the official Cameron Valley Tea shop.", 6.3, "https://bharattea.com.my/wp-content/uploads/2024/04/76912f9a-bab0-4fe3-bbe0-c62da7ddc483.jpeg", "https://bharattea.com.my/product/cv2400-grams/"],
      ["cameron-valley-cv-400-grams", "Cameron Valley Tea — 400 grams", "Cameron Valley tea product sold by the official Cameron Valley Tea shop.", 12, "https://bharattea.com.my/wp-content/uploads/2024/04/c54665ec-4bd4-4b28-a396-4efff0762445.jpeg", "https://bharattea.com.my/product/cv-400-grams/"],
      ["cameron-valley-blackcurrent-tea", "Cameron Valley Blackcurrent Tea", "Blackcurrent-flavoured tea product sold by the official Cameron Valley Tea shop.", 13.95, "https://bharattea.com.my/wp-content/uploads/2024/06/123bcb5d-5f20-4665-b109-aeb960cb8bfe.jpeg", "https://bharattea.com.my/product/blackcurrent-tea/"],
      ["cameron-valley-orange-tea", "Cameron Valley Orange Tea", "Orange-flavoured tea product sold by the official Cameron Valley Tea shop.", 13.95, "https://bharattea.com.my/wp-content/uploads/2024/06/f8a4982b-7a87-419d-b807-6a685e67226c.jpeg", "https://bharattea.com.my/product/orange-tea/"],
    ],
    source_page: "https://bharattea.com.my/",
    artist: "Cameron Valley Tea official online shop",
  },
  {
    manifest: "verified-tanoti-workshop-products.json",
    vendor: { id: "c5ab04dc-2c02-c07f-d741-b9039e0df199", name: "Tanoti Weavers Workshop", source_page: "https://tanoticrafts.com/" },
    outlets: [{ id: "82100a81-2917-205c-cd9c-d1b691c25f21", name: "Tanoti Weavers Workshop" }],
    archive_legacy_slugs: [],
    products: [
      ["tanoti-mini-workshops", "Tanoti Mini Workshops", "Two-hour basketry weaving, songket weaving or loom beading workshop at Tanoti House, listed on Tanoti's official product page.", 200, "https://tanoticrafts.com/cdn/shop/files/6.jpg?v=1729475961", "https://tanoticrafts.com/products/tanoti-experiences"],
      ["tanoti-rattan-cushion", "Tanoti Rattan Cushion", "Handwoven rattan cushion made by Tanoti, with product variants and price listed on the official Tanoti product page.", 200, "https://tanoticrafts.com/cdn/shop/products/20200902_144832-01.jpg?v=1711201157", "https://tanoticrafts.com/products/rattan-pillows"],
      ["tanoti-rattan-basket-lampshade", "Tanoti Rattan Basket / Lampshade", "Rattan basket that can be used as a lampshade, with size variants and price listed on the official Tanoti product page.", 130, "https://tanoticrafts.com/cdn/shop/products/20210301_110531-01.jpg?v=1711200840", "https://tanoticrafts.com/products/rattan-basket-lampshade"],
      ["tanoti-basket-tray", "Tanoti Basket Tray", "Handmade basket tray with pattern variants, dimensions and price listed on the official Tanoti product page.", 160, "https://tanoticrafts.com/cdn/shop/products/20201105_170631-01-01.jpg?v=1711196409", "https://tanoticrafts.com/products/rectangular-baskets"],
      ["tanoti-songket-rattan-table-runner", "Tanoti Songket Rattan Table Runner", "Handwoven songket rattan table runner with artisan description, variants and price listed on the official Tanoti product page.", 650, "https://tanoticrafts.com/cdn/shop/files/NC_001.jpg?v=1736844490", "https://tanoticrafts.com/products/tanoti-songket-rattan-table-runner"],
    ],
    source_page: "https://tanoticrafts.com/",
    artist: "Tanoti Crafts official online shop",
  },
  {
    manifest: "verified-gerakbudaya-bookshop-products.json",
    vendor: { id: "31515d45-200b-dbea-0506-947f8e729943", name: "Gerakbudaya Bookshop", source_page: "https://www.gerakbudaya.com/products/all-products" },
    outlets: [{ id: "6dbf6ac9-13fb-003e-c063-b6e5ad70da0c", name: "Gerakbudaya Bookshop" }],
    archive_legacy_slugs: [],
    product_type: "product",
    requires_booking: false,
    products: [
      ["gerakbudaya-myth-of-the-lazy-native", "The Myth of the Lazy Native — Syed Hussein Alatas", "Book sold by Gerakbudaya with the product title, author, SKU and price listed on the official product page.", 68, "https://cdn1.sgliteasset.com/gerakbud/images/product/product-2716452/cached/UyhmF3dD6413d45669124_1679021142_420x420.jpg", "https://www.gerakbudaya.com/product/the-myth-of-the-lazy-native"],
      ["gerakbudaya-the-accidental-malay", "The Accidental Malay — Karina Robles Bahrin", "Book sold by Gerakbudaya with the product title, author, SKU and price listed on the official product page.", 57.8, "https://cdn1.sgliteasset.com/gerakbud/images/product/product-2716781/cached/qgSwBzvT6413d48ce0666_1679021196_420x420.jpg", "https://www.gerakbudaya.com/product/the-accidental-malay"],
      ["gerakbudaya-intellectuals-in-developing-societies", "Intellectuals in Developing Societies — Syed Hussein Alatas", "Book sold by Gerakbudaya with the product title, author, SKU and price listed on the official product page.", 38.25, "https://cdn1.sgliteasset.com/gerakbud/images/product/product-6033868/cached/REhEtzSN679830c1007f5_1738027201_420x420.jpg", "https://www.gerakbudaya.com/product/intellectuals-in-developing-societies"],
      ["gerakbudaya-peoples-constitutional-proposals", "The People's Constitutional Proposals for Malaya — 70th Anniversary Edition", "Book sold by Gerakbudaya with the product title, edition, SKU and price listed on the official product page.", 17, "https://cdn1.sgliteasset.com/gerakbud/images/product/product-2716567/cached/xh6fo8Cl6413d469de46b_1679021161_420x420.jpg", "https://www.gerakbudaya.com/product/the-peoples-constitutional-proposals-for-malaya"],
      ["gerakbudaya-memoir-shamsiah-fakeh", "Memoir Shamsiah Fakeh — Dari AWAS ke Rejimen Ke-10", "Book sold by Gerakbudaya with the product title, edition, SKU and price listed on the official product page.", 25.5, "https://cdn1.sgliteasset.com/gerakbud/images/product/product-2716671/cached/LJSK28hy6413d47a11328_1679021178_420x420.jpg", "https://www.gerakbudaya.com/product/memoir-shamsiah-fakeh"],
    ],
    source_page: "https://www.gerakbudaya.com/products/all-products",
    artist: "Gerakbudaya official online shop",
  },
  {
    manifest: "verified-taman-negara-products.json",
    vendor: { id: "b9622b08-b059-43f4-9288-6de703c8ebbb", name: "Taman Negara Park Authority", source_page: "https://wildlife.gov.my/en/taman-negara-pahang-kuala-tahan/" },
    outlets: [{ id: "4146d43b-7a61-dcd7-91cc-5022e231ce13", name: "Taman Negara Park Authority — Counter" }],
    archive_legacy_slugs: [],
    products: [
      ["taman-negara-entrance-permit", "Taman Negara Pahang Entrance Permit", "Mandatory entrance permit for one visitor entering Taman Negara Pahang at Kuala Tahan, listed by the official Department of Wildlife and National Parks page.", 1, "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Taman_Negara%2C_Kuala_Tahan.png/1280px-Taman_Negara%2C_Kuala_Tahan.png"],
      ["taman-negara-camera-license", "Taman Negara Camera License", "Camera license for one camera unit brought into Taman Negara, listed by the official Department of Wildlife and National Parks page.", 5, "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Taman_Negara_Canopy_Walkway.JPG/1280px-Taman_Negara_Canopy_Walkway.JPG"],
      ["taman-negara-fishing-license", "Taman Negara Fishing License", "Fishing license for one fishing rod in Taman Negara, listed by the official Department of Wildlife and National Parks page.", 10, "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Departing_from_Kuala_Tahan_%283107831161%29.jpg/1280px-Departing_from_Kuala_Tahan_%283107831161%29.jpg"],
      ["taman-negara-kuala-tembeling-boat-one-way", "Kuala Tembeling to Kuala Tahan Boat — One Way", "One-way boat fare from Kuala Tembeling Jetty to Kuala Tahan, listed on the official Taman Negara Pahang visitor information page.", 55, "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Kuala_Tembeling_1.jpg/1280px-Kuala_Tembeling_1.jpg"],
      ["taman-negara-campsite-one-night", "Taman Negara Campsite — One Person, One Night", "Basic campsite fee for one person for one night inside Taman Negara, excluding campsites managed by Mutiara Resort, listed on the official visitor information page.", 1, "https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Taman_Negara_from_Bukit_Terisek.jpg/1280px-Taman_Negara_from_Bukit_Terisek.jpg"],
    ],
    source_page: "https://wildlife.gov.my/en/taman-negara-pahang-kuala-tahan/",
    artist: "Department of Wildlife and National Parks official page / Wikimedia Commons contributors",
  },
  {
    manifest: "verified-highlands-skyway-products.json",
    vendor: { id: "6d136dce-e4b2-0f08-64f9-79d263c53464", name: "Highlands Skyway Operations", source_page: "https://www.rwgenting.com/en/getting-here/cable-car/genting-gohtong-jaya-cable-car.html" },
    outlets: [{ id: "b59d2831-0c62-a8a0-444a-7500fab0d1fd", name: "Highlands Skyway — Station" }],
    archive_legacy_slugs: [],
    products: [
      ["highlands-skyway-standard-one-way", "Genting SkyWay Standard Gondola — One Way", "One-way shared standard gondola ride from Gohtong Sentral Station to Resorts World Station, listed on Resorts World Genting's official ticket pricing page.", 11, "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Genting_Skyway.jpg/1280px-Genting_Skyway.jpg"],
      ["highlands-skyway-standard-return", "Genting SkyWay Standard Gondola — Return", "Return shared standard gondola ride on Genting SkyWay, listed on Resorts World Genting's official ticket pricing page.", 19, "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Genting_Skyway_3.jpg/1280px-Genting_Skyway_3.jpg"],
      ["highlands-skyway-express-one-way", "Genting SkyWay Standard Gondola with Express Boarding — One Way", "One-way standard gondola ride with express boarding, listed on Resorts World Genting's official ticket pricing page.", 17, "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Genting_Skyway_4.jpg/1280px-Genting_Skyway_4.jpg"],
      ["highlands-skyway-express-return", "Genting SkyWay Standard Gondola with Express Boarding — Return", "Return standard gondola ride with express boarding, listed on Resorts World Genting's official ticket pricing page.", 32, "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Genting_Skyway_in_Genting_Highlands%2C_Malaysia%2C_2007.jpg/1280px-Genting_Skyway_in_Genting_Highlands%2C_Malaysia%2C_2007.jpg"],
      ["highlands-skyway-chartered-one-way", "Genting SkyWay Chartered Gondola — One Way", "Private one-way standard gondola ride for up to eight passengers with express boarding, listed on Resorts World Genting's official ticket pricing page.", 324, "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Genting_Highlands_-_Genting_Skyway_0012.jpg/1280px-Genting_Highlands_-_Genting_Skyway_0012.jpg"],
    ],
    source_page: "https://www.rwgenting.com/en/getting-here/cable-car/genting-gohtong-jaya-cable-car.html",
    artist: "Resorts World Genting official page / Wikimedia Commons contributors",
  },
  {
    manifest: "verified-petronas-twin-towers-products.json",
    vendor: { id: "d129a175-7e14-8573-71d0-21ab4a3eaeaa", name: "Petronas Twin Towers", source_page: "https://www.petronastwintowers.com.my/plan-your-visit/admission-ticketing/" },
    outlets: [{ id: "25d70b61-12c2-dcc6-3b95-149d5d8b8dca", name: "Petronas Twin Towers — Ticket Counter" }],
    archive_legacy_slugs: ["skybridge-observation-deck"],
    products: [
      ["petronas-malaysian-adult-general-admission", "PETRONAS Malaysian Adult General Admission", "Malaysian adult admission for the SkyBridge and Observation Deck visit, priced on the official ticketing page.", 42, "petronas-twin-towers-skybridge"],
      ["petronas-malaysian-child-general-admission", "PETRONAS Malaysian Child General Admission", "Malaysian child admission for visitors aged above 2 to 12, priced on the official ticketing page.", 20, "petronas-twin-towers-observation-deck"],
      ["petronas-malaysian-senior-general-admission", "PETRONAS Malaysian Senior General Admission", "Malaysian senior citizen admission for visitors aged 61 and above, priced on the official ticketing page.", 20, "petronas-twin-towers-klcc-park-walk"],
      ["petronas-international-adult-general-admission", "PETRONAS International Adult General Admission", "General admission for international adult visitors aged 13 to 60, priced on the official ticketing page.", 127, "petronas-twin-towers-photography"],
      ["petronas-premium-sky-access-observation-deck", "PETRONAS Premium Sky Access — SkyBridge & Observation Deck 86", "Premium Sky Access covering the SkyBridge and Observation Deck 86, listed on the official ticketing page.", 230, "petronas-twin-towers-lake-symphony"],
    ],
    source_page: "https://www.petronastwintowers.com.my/plan-your-visit/admission-ticketing/",
    artist: "PETRONAS Twin Towers visitor media / Wikimedia Commons contributors",
  },
  {
    manifest: "verified-legoland-malaysia-products.json",
    vendor: { id: "e6f97a27-9d0b-8b8c-ae41-d26140f083a2", name: "LEGOLAND Malaysia Resort", source_page: "https://www.legoland.com.my/tickets-passes/" },
    outlets: [{ id: "60dc74ed-e191-c023-8963-58eb774be1d0", name: "LEGOLAND Malaysia Resort — Guest Services" }],
    archive_legacy_slugs: ["legoland-theme-park-ticket", "legoland-waterpark-ticket"],
    products: [
      ["legoland-1-day-theme-park-adult", "LEGOLAND 1-Day Theme Park Adult", "One-day adult access to the LEGOLAND Malaysia Theme Park at the published online starting price.", 205, "legoland-malaysia-lego-city"],
      ["legoland-1-day-theme-park-child-senior", "LEGOLAND 1-Day Theme Park Child / Senior", "One-day child or senior access to the LEGOLAND Malaysia Theme Park at the published online starting price.", 175, "legoland-malaysia-miniland"],
      ["legoland-1-day-water-park-adult", "LEGOLAND 1-Day Water Park Adult", "One-day adult access to LEGOLAND Water Park at the published online starting price.", 149, "legoland-waterpark-wave-pool"],
      ["legoland-1-day-water-park-child-senior", "LEGOLAND 1-Day Water Park Child / Senior", "One-day child or senior access to LEGOLAND Water Park at the published online starting price.", 129, "legoland-waterpark-build-a-raft-river"],
      ["legoland-1-day-triple-park-adult", "LEGOLAND 1-Day Triple-Park Adult", "One-day adult access to Theme Park, Water Park and SEA LIFE at the published online starting price.", 345, "legoland-waterpark-build-a-boat"],
    ],
    source_page: "https://www.legoland.com.my/tickets-passes/",
    artist: "LEGOLAND Malaysia Resort visitor media / Wikimedia Commons contributors",
  },
  {
    manifest: "verified-menara-taming-sari-products.json",
    vendor: { id: "6e1487f5-98be-765a-8a20-c6f70546b07f", name: "Menara Taming Sari", source_page: "https://www.menaratamingsari.com/shop/" },
    outlets: [{ id: "832de0ac-99e9-8482-85aa-1563dd605b20", name: "Menara Taming Sari — Ticket Booth" }],
    archive_legacy_slugs: ["op-taming-sari-ride"],
    products: [
      ["menara-taming-sari-adult-day-local", "Menara Taming Sari Adult Day Pass — Local", "Adult local day pass for the 360-degree revolving tower ride, 9:00 AM to 5:59 PM.", 20, "https://www.menaratamingsari.com/wp-content/uploads/2022/12/adult-home-product.png"],
      ["menara-taming-sari-adult-sunset-local", "Menara Taming Sari Adult Sunset Pass — Local", "Adult local sunset pass for the 360-degree revolving tower ride, 6:00 PM to 7:59 PM.", 25, "https://www.menaratamingsari.com/wp-content/uploads/2022/12/people.png"],
      ["menara-taming-sari-adult-night-local", "Menara Taming Sari Adult Night View Pass — Local", "Adult local night-view pass for the 360-degree revolving tower ride, 8:00 PM to 11:00 PM.", 25, "https://www.menaratamingsari.com/wp-content/uploads/2022/12/home-overview-1-1024x550.png"],
      ["menara-taming-sari-child-day-local", "Menara Taming Sari Child Day Pass — Local", "Local child day pass for visitors below 12 years old, 9:00 AM to 5:59 PM.", 15, "https://www.menaratamingsari.com/wp-content/uploads/2022/11/child-home-product.png"],
      ["menara-taming-sari-senior-day-local", "Menara Taming Sari Senior Day Pass — Local", "Local senior citizen day pass for visitors above 55 years old, listed on the official visitor page.", 11, "https://www.menaratamingsari.com/wp-content/uploads/2022/12/senior-home-product.png"],
    ],
    source_page: "https://www.menaratamingsari.com/shop/",
    artist: "Menara Taming Sari official website",
  },
  {
    manifest: "verified-langkawi-cable-car-products.json",
    vendor: { id: "175cf1eb-d839-75f8-bb90-e02fc59d9960", name: "Langkawi Cable Car Sdn Bhd", source_page: "https://panoramalangkawi.com/" },
    outlets: [{ id: "b58ff1af-ccf3-d81a-3707-a11cbd354a8e", name: "Langkawi Cable Car — Base Station" }],
    archive_legacy_slugs: ["skycab-return-ticket"],
    products: [
      ["langkawi-skyglide-adult-return", "SkyGlide Adult Return Ticket", "Adult round-trip SkyGlide ticket to and from SkyBridge, listed on Panorama Langkawi's official page.", 16, "https://panoramalangkawi.com/wp-content/uploads/2020/05/skyglide.jpg"],
      ["langkawi-skyglide-child-return", "SkyGlide Child Return Ticket", "Child round-trip SkyGlide ticket to and from SkyBridge, listed on Panorama Langkawi's official page.", 11, "https://panoramalangkawi.com/wp-content/uploads/2020/05/skydome.jpg"],
      ["langkawi-skytrail-beginner", "Langkawi SkyTrail Beginner Trail", "Guided SkyTrail route from SkyCab Middle Station to the summit, approximately two hours, inclusive of SkyCab Express Lane ticket.", 180, "https://panoramalangkawi.com/wp-content/uploads/2020/05/skybridge.jpg"],
      ["langkawi-skytrail-intermediate", "Langkawi SkyTrail Intermediate Trail", "Guided SkyTrail route from Oriental Village to the SkyCab Middle Station, approximately three to four hours.", 230, "https://panoramalangkawi.com/wp-content/uploads/2020/05/272A2724-min-1024x683.jpg"],
      ["langkawi-skytrail-challenging", "Langkawi SkyTrail Challenging Trail", "Guided SkyTrail route from Oriental Village to the summit, approximately four to five hours.", 280, "https://panoramalangkawi.com/wp-content/uploads/2020/05/IMG_0326-min-1024x683.jpg"],
    ],
    source_page: "https://panoramalangkawi.com/skytrail/",
    artist: "Panorama Langkawi official website",
  },
  {
    manifest: "verified-tropical-spice-garden-products.json",
    vendor: { id: "4086a714-550e-5166-416c-e99557f64c3b", name: "Tropical Spice Garden", source_page: "https://tropicalspicegarden.com/shop" },
    outlets: [{ id: "383420f3-91cc-3e41-eec7-6ae63c163509", name: "Tropical Spice Garden" }],
    archive_legacy_slugs: ["spice-garden-entry", "spice-garden-guided-spice-tour"],
    requires_booking: false,
    product_type: "product",
    products: [
      ["tropical-spice-garden-iran-saffron-1g", "Iran Saffron 1 gm", "Iran saffron sold through Tropical Spice Garden's official Garden Shop.", 60, "https://images.squarespace-cdn.com/content/v1/6075b5ceb189503bf78fc262/71cd7052-1721-46f2-9bb3-e3573335a6d9/saffron.jpeg"],
      ["tropical-spice-garden-natural-honey", "Natural Honey", "Natural honey sold through Tropical Spice Garden's official Garden Shop.", 49, "https://images.squarespace-cdn.com/content/v1/6075b5ceb189503bf78fc262/8e38d336-0764-4fe7-80b2-351aa4472533/honey.jpeg"],
      ["tropical-spice-garden-nutmeg-syrup", "Nutmeg Syrup", "Nutmeg syrup sold through Tropical Spice Garden's official Garden Shop.", 25, "https://images.squarespace-cdn.com/content/v1/6075b5ceb189503bf78fc262/8fd3e017-4cef-4d4c-92d8-36d286db1edb/nutmeg+syrup.jpeg"],
      ["tropical-spice-garden-organic-brown-rice", "Organic Brown Rice", "Organic brown rice sold through Tropical Spice Garden's official Garden Shop.", 28, "https://images.squarespace-cdn.com/content/v1/6075b5ceb189503bf78fc262/de3aefdc-335f-4712-8b60-4a511f0657a8/organic.jpeg"],
      ["tropical-spice-garden-helichrysum-essential-oil", "Omalaya Botanicals Essential Oil — Helichrysum", "Helichrysum essential oil sold through Tropical Spice Garden's official Garden Shop.", 180, "https://images.squarespace-cdn.com/content/v1/6075b5ceb189503bf78fc262/1672025798751-YQT023VLCYJ3G2TMTTJ2/TIM05920.jpg"],
    ],
    source_page: "https://tropicalspicegarden.com/shop",
    artist: "Tropical Spice Garden official Garden Shop",
  },
  {
    manifest: "verified-taman-tamadun-islam-products.json",
    vendor: { id: "d6a66802-a895-5059-18d5-3706171dc8cd", name: "Taman Tamadun Islam", source_page: "https://www.tti.com.my/monument-park-admission/" },
    outlets: [{ id: "a2e8adc9-b631-ee75-2c71-da2eeb1acb69", name: "Taman Tamadun Islam" }],
    archive_legacy_slugs: [],
    products: [
      ["tti-monument-park-adult", "TTI Monument Park Adult Passport", "Monument Park passport for visitors aged 13 to 59, listed on the official TTI admission page.", 25, "https://www.tti.com.my/wp-content/uploads/2019/05/DSC04907-800x450.jpg"],
      ["tti-monument-park-child-senior", "TTI Monument Park Child / Senior Passport", "Monument Park passport for children aged 7 to 12 and senior citizens aged 60 and above.", 20, "https://www.tti.com.my/wp-content/uploads/2019/05/mki1.jpg"],
      ["tti-monument-park-river-cruise-adult", "TTI Monument Park & River Cruise Adult Package", "Two-in-one adult package combining the Monument Park passport and a 45-minute river cruise.", 55, "https://www.tti.com.my/wp-content/uploads/2020/01/tti-river-cruise.jpg"],
      ["tti-monument-park-river-cruise-child-senior", "TTI Monument Park & River Cruise Child / Senior Package", "Two-in-one child or senior package combining the Monument Park passport and a 45-minute river cruise.", 45, "https://www.tti.com.my/wp-content/uploads/2019/08/1200x1200-Hi-tea-cruise.jpg"],
      ["tti-monument-park-family-package", "TTI Monument Park Family Package", "Family package for two adults and two children, listed on the official TTI admission page.", 90, "https://www.tti.com.my/wp-content/uploads/2020/01/1200x1200-kapas-island-day-trip.jpg"],
    ],
    source_page: "https://www.tti.com.my/monument-park-admission/",
    artist: "Taman Tamadun Islam official website",
  },
  {
    manifest: "verified-melaka-river-cruise-products.json",
    vendor: { id: "f235e866-c455-a090-58b0-c8174e381b57", name: "Melaka River Cruise", source_page: "https://melakarivercruise.my/flyersmrc.pdf" },
    outlets: [
      { id: "bd4ed5b4-f509-0a0b-79a4-2817792e8c23", name: "Melaka River Cruise — Spice Garden Jetty" },
      { id: "814905d8-511e-e99d-ec8e-c2d6fed5eee7", name: "Melaka River Cruise — Jalan Tun Ali Jetty" },
    ],
    archive_legacy_slugs: ["op-river-cruise-day-ticket", "op-river-cruise-night"],
    products: [
      ["melaka-river-cruise-adult-mykad", "Melaka River Cruise Adult — MyKad", "45-minute Melaka River Cruise ticket for an adult visitor presenting a MyKad, listed in the operator's published ticket flyer.", 25, "jonker-street-night-market-stroll"],
      ["melaka-river-cruise-adult-non-mykad", "Melaka River Cruise Adult — Non-MyKad", "45-minute Melaka River Cruise ticket for a non-MyKad adult visitor, listed in the operator's published ticket flyer.", 30, "stadthuys-dutch-architecture"],
      ["melaka-river-cruise-child-mykad", "Melaka River Cruise Child — MyKad", "45-minute Melaka River Cruise ticket for a MyKad child visitor, listed in the operator's published ticket flyer.", 15, "christ-church-melaka-architecture"],
      ["melaka-river-cruise-child-non-mykad", "Melaka River Cruise Child — Non-MyKad", "45-minute Melaka River Cruise ticket for a non-MyKad child visitor, listed in the operator's published ticket flyer.", 25, "a-famosa-porta-de-santiago"],
      ["melaka-river-cruise-chartered-boat", "Melaka River Cruise Chartered Boat", "Private chartered boat service for group events, available by reservation and listed in the operator's published ticket flyer.", 1000, "st-pauls-church-hill-climb"],
    ],
    source_page: "https://melakarivercruise.my/flyersmrc.pdf",
    artist: "Melaka River Cruise official ticket flyer / Wikimedia Commons contributors",
  },
  {
    manifest: "verified-mari-mari-cultural-village-products.json",
    vendor: { id: "490124bc-bc18-97cc-b22a-38f47d8356ce", name: "Mari Mari Cultural Village", source_page: "https://marimariculturalvillage.com/index.php/price/" },
    outlets: [{ id: "19f5d2f9-93d3-44c5-2476-3fe8a763fe9f", name: "Mari Mari Cultural Village" }],
    archive_legacy_slugs: [],
    products: [
      ["mari-mari-malaysian-adult-without-transport", "Mari Mari Malaysian Adult — Without Transport", "Mari Mari Cultural Village package for a Malaysian adult without transport, including guide, cultural performance, house visits and lunch or high tea.", 110, "https://marimariculturalvillage.com/wp-content/uploads/2015/10/DSC_0238.jpg"],
      ["mari-mari-malaysian-child-without-transport", "Mari Mari Malaysian Child — Without Transport", "Mari Mari Cultural Village package for a Malaysian child aged 5 to 11 without transport, including guide, cultural performance, house visits and lunch or high tea.", 100, "https://marimariculturalvillage.com/wp-content/uploads/2015/10/blwpipe-300x253.png"],
      ["mari-mari-nonmalaysian-adult-without-transport", "Mari Mari Non-Malaysian Adult — Without Transport", "Mari Mari Cultural Village package for a non-Malaysian adult without transport, including guide, cultural performance, house visits and lunch or high tea.", 130, "https://marimariculturalvillage.com/wp-content/uploads/2015/10/IMG_1791-1024x768.jpg"],
      ["mari-mari-nonmalaysian-child-without-transport", "Mari Mari Non-Malaysian Child — Without Transport", "Mari Mari Cultural Village package for a non-Malaysian child aged 5 to 11 without transport, including guide, cultural performance, house visits and lunch or high tea.", 110, "https://marimariculturalvillage.com/wp-content/uploads/2015/10/lokkawi_wildlife_061.jpg"],
      ["mari-mari-malaysian-adult-with-transport", "Mari Mari Malaysian Adult — With Transport", "Mari Mari Cultural Village package for a Malaysian adult with hotel pickup and return transport from Kota Kinabalu area, including the village programme and meal.", 190, "https://marimariculturalvillage.com/wp-content/uploads/2025/12/IMG_20251204_23564762-1024x576.jpeg"],
    ],
    source_page: "https://marimariculturalvillage.com/index.php/price/",
    artist: "Mari Mari Cultural Village official website",
  },
  {
    manifest: "verified-escape-penang-products.json",
    vendor: { id: "f61c8a44-d6fc-1819-2b0e-47171a0ecf50", name: "ESCAPE Penang", source_page: "https://www.escape.my/pg" },
    outlets: [{ id: "27011afb-239e-339d-8f72-00ddd6f0c040", name: "ESCAPE Penang" }],
    archive_legacy_slugs: [],
    products: [
      ["escape-penang-base-camp-adult", "ESCAPE Penang Base Camp — Adult 1-Day", "One-day adult Base Camp access covering the ESCAPE Penang rides and attractions listed on the official ticket page, before applicable tax.", 118, "https://cdn.prod.website-files.com/61d6f58347d69acf7aecd077/67dc3647c1c3c771323e11c3_6780f18913cc0ede76d40b76_6780e103123bc4ee3e4533c0_The%252520Longest.jpeg"],
      ["escape-penang-base-camp-child", "ESCAPE Penang Base Camp — Child 1-Day", "One-day child Base Camp access covering the ESCAPE Penang rides and attractions listed on the official ticket page, before applicable tax.", 98, "https://cdn.prod.website-files.com/61d6f58347d69acf7aecd077/67dc365d1182734345ade771_6780f18913cc0ede76d40b8b_6780e2964edbe2800381255d_Zip%252520Coaster.jpeg"],
      ["escape-penang-waterplay-1-day", "ESCAPE Penang Waterplay — 1-Day", "One-day Waterplay access at ESCAPE Penang, listed in the official ticket price table, before applicable tax.", 95, "https://cdn.prod.website-files.com/61d6f58347d69acf7aecd077/67dc3693c875a7c0acfeaaff_6780f18913cc0ede76d40b7a_6780e36f876eb633b2532be6_Tubby%252520Racer.jpeg"],
      ["escape-penang-combo-adult", "ESCAPE Penang Combo — Adult 1-Day", "One-day adult combo access to ESCAPE Base Camp and Waterplay, listed in the official ticket price table, before applicable tax.", 175, "https://cdn.prod.website-files.com/61d6f58347d69acf7aecd077/67dc36affc8cdc228538f79f_6780f18913cc0ede76d40b82_6780e3ec7f1946daa1042df4_Tipping%252520Bucket.jpeg"],
      ["escape-penang-combo-child", "ESCAPE Penang Combo — Child 1-Day", "One-day child combo access to ESCAPE Base Camp and Waterplay, listed in the official ticket price table, before applicable tax.", 150, "https://cdn.prod.website-files.com/61d6f58347d69acf7aecd077/67dc36f572186352806f6a1b_6780f18913cc0ede76d40b92_6780ed9fef14fcfb8ec99588_Monkey%252520Business.jpeg"],
    ],
    source_page: "https://www.escape.my/pg",
    artist: "ESCAPE Penang official website",
  },
  {
    manifest: "verified-blue-mansion-products.json",
    vendor: { id: "c7df19c1-38de-ba6c-caea-aca366cbf07d", name: "Cheong Fatt Tze — The Blue Mansion", source_page: "https://www.cheongfatttzemansion.com/" },
    outlets: [{ id: "1b2c744b-e1d8-7fae-b8f8-adfbd172e9a0", name: "Cheong Fatt Tze — The Blue Mansion" }],
    archive_legacy_slugs: ["blue-mansion-cheong-fatt-tze-suite", "blue-mansion-courtyard-room", "blue-mansion-guided-tour"],
    products: [
      ["blue-mansion-guided-tour-adult", "The Blue Mansion Daily Guided Tour — Adult", "45-minute daily guided tour covering the reception hall, courtyard and museum exhibition, with adult admission listed by the official mansion site.", 25, "https://www.cheongfatttzemansion.com/wp-content/uploads/2020/07/2-ESCOY.jpg?id=6639", "https://www.cheongfatttzemansion.com/thebluemansion/discover/daily-tours/"],
      ["blue-mansion-guided-tour-child", "The Blue Mansion Daily Guided Tour — Child", "45-minute daily guided tour child admission for visitors under 12, listed by the official mansion site.", 12.5, "https://www.cheongfatttzemansion.com/wp-content/uploads/2020/07/2-Liang-Collection-Chang-Yu-Room.jpg?id=6640", "https://www.cheongfatttzemansion.com/thebluemansion/discover/daily-tours/"],
      ["blue-mansion-private-tour-group", "The Blue Mansion Private Tour — Group up to 12", "Private Blue Mansion tour for a group of up to 12 people, available between noon and 2pm with three days advance notice, listed by the official mansion site.", 350, "https://www.cheongfatttzemansion.com/wp-content/uploads/2020/07/3-Tang-Collection-50s-Room.jpg?id=6637", "https://www.cheongfatttzemansion.com/thebluemansion/discover/daily-tours/"],
      ["blue-mansion-penang-nature-liang", "Penang Nature Discovery — Liang Room Package", "Three-day, two-night Penang Nature Discovery package in the Liang room category, with breakfast, house tour, bicycle rental and attraction discounts, listed by the official hotel site.", 1088, "https://www.cheongfatttzemansion.com/wp-content/uploads/2020/07/Han-Yantai-Room-scaled-1.jpg?id=6638", "https://www.cheongfatttzemansion.com/mansion_promotion/penang-nature-discovery/"],
      ["blue-mansion-penang-nature-ming", "Penang Nature Discovery — Ming Room Package", "Three-day, two-night Penang Nature Discovery package in the Ming room category, with breakfast, house tour, bicycle rental and attraction discounts, listed by the official hotel site.", 1188, "https://www.cheongfatttzemansion.com/wp-content/uploads/2021/08/stays_mobile.jpg?id=8134", "https://www.cheongfatttzemansion.com/mansion_promotion/penang-nature-discovery/"],
    ],
    source_page: "https://www.cheongfatttzemansion.com/",
    artist: "Cheong Fatt Tze — The Blue Mansion official website",
  },
  {
    manifest: "verified-menara-alor-setar-products.json",
    vendor: { id: "4a9fb5fc-0d56-208f-0b5e-e048b37860ed", name: "Menara Alor Setar Management", source_page: "https://menaraalorsetar.com.my/en/ticket-packages-promotions/ticket" },
    outlets: [{ id: "6764ac09-c181-8eee-8e58-5913c7f39a3a", name: "Menara Alor Setar" }],
    archive_legacy_slugs: [],
    products: [
      ["menara-alor-setar-observation-mykad-adult", "Menara Alor Setar Observation Deck — MyKad Adult", "Weekday or weekend observation deck admission for a MyKad adult, listed in Menara Alor Setar's official ticket price list.", 7, "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cc/Menara_Alor_Setar-zamwan.jpg/1280px-Menara_Alor_Setar-zamwan.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail"],
      ["menara-alor-setar-observation-mykad-child-senior", "Menara Alor Setar Observation Deck — MyKad Child / Senior", "Observation deck admission for a MyKad child aged 4 years and below or senior citizen aged 80 years and above, listed in the official ticket price list.", 5, "https://upload.wikimedia.org/wikipedia/commons/0/0a/Alor_Setar_Tower_aerial_view.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail_unscaled"],
      ["menara-alor-setar-observation-international-adult", "Menara Alor Setar Observation Deck — International Adult", "Observation deck admission for an international adult visitor, listed in Menara Alor Setar's official ticket price list.", 10, "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/77/Menara_Alor_Setar_02.jpg/1280px-Menara_Alor_Setar_02.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail"],
      ["menara-alor-setar-observation-international-child-senior", "Menara Alor Setar Observation Deck — International Child / Senior", "Observation deck admission for an international child aged 4 years and below or senior citizen aged 80 years and above, listed in the official ticket price list.", 7, "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6f/Menara_Alor_Setar_01.jpg/1280px-Menara_Alor_Setar_01.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail"],
      ["menara-alor-setar-star-view-mykad-adult", "Menara Alor Setar Star View — MyKad Adult", "Star View admission for a MyKad adult, listed in Menara Alor Setar's official ticket price list.", 25, "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/68/Menara_Alor_Setar_04.jpg/1280px-Menara_Alor_Setar_04.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail"],
    ],
    source_page: "https://menaraalorsetar.com.my/en/ticket-packages-promotions/ticket",
    artist: "Menara Alor Setar official ticket list / Wikimedia Commons contributors",
  },
];

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function materializeAsset(source, destination) {
  const target = path.join(PUBLIC, destination.replace(/^\//, ""));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (source.startsWith("https://")) {
    try {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`image download failed (${response.status}): ${source}`);
      fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      try {
        execFileSync("curl", ["--location", "--fail", "--silent", "--show-error", "--max-time", "30", "--output", target, source], { stdio: "pipe" });
      } catch {
        throw error;
      }
    }
  } else {
    fs.copyFileSync(path.join(PUBLIC, source.replace(/^\//, "")), target);
  }
  return target;
}

const requestedManifest = process.env.VERIFIED_BATCH_MANIFEST?.trim();
const batchesToRun = requestedManifest ? batches.filter((batch) => batch.manifest === requestedManifest) : batches;
if (requestedManifest && batchesToRun.length === 0) throw new Error(`Unknown batch manifest: ${requestedManifest}`);

for (const batch of batchesToRun) {
  const products = [];
  for (const [slug, name, description, basePrice, source, productSourcePage] of batch.products) {
    const sourceImage = source.startsWith("https://") ? source : mediaBySlug.get(source)?.source_image_url;
    if (!sourceImage) throw new Error(`Missing source image metadata for ${source}`);
    const sourceAsset = source.startsWith("https://") ? source : `/assets/customer/${mediaBySlug.get(source).asset_path}`;
    const extension = sourceAsset.match(/\.(png|webp|jpe?g)(?:\?|$)/i)?.[1]?.toLowerCase() ?? "jpg";
    const assetPath = `/assets/customer/products/${slug}-real.${extension === "jpeg" ? "jpg" : extension}`;
    const localAsset = await materializeAsset(sourceAsset, assetPath);
    products.push({
      slug,
      name,
      description,
      product_type: batch.product_type ?? (name.toLowerCase().includes("pass") || name.toLowerCase().includes("ticket") ? "activity" : "experience"),
      requires_booking: batch.requires_booking ?? true,
      base_price: basePrice,
      source_type: batch.source_type ?? "official",
      source_page: productSourcePage ?? batch.source_page,
      source_image_url: sourceImage,
      price_reference_page: productSourcePage ?? batch.source_page,
      observed_at: OBSERVED_AT,
      asset_path: assetPath,
      sha256: sha256(localAsset),
      artist: batch.artist,
      license: batch.license ?? "Official vendor media or Wikimedia Commons media; source attribution recorded",
    });
  }
  const output = {
    vendor: { ...batch.vendor, price_reference_page: batch.source_page },
    outlets: batch.outlets,
    archive_legacy_slugs: batch.archive_legacy_slugs,
    products,
  };
  fs.writeFileSync(path.join(ROOT, "scripts/data", batch.manifest), `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ manifest: batch.manifest, vendor: batch.vendor.name, products: products.length, outlets: batch.outlets.length }));
}
