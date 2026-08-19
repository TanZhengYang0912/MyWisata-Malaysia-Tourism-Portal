#!/usr/bin/env python3
"""Download one semantically relevant, uniquely sourced image for every product.

The script is intentionally a build-time data curator, not application runtime
code. It reads the customer-visible product inventory from Supabase, searches
Wikimedia Commons for product-specific candidates, downloads the selected
thumbnail locally, writes credits, and generates the slug-guarded migration.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "public/assets/customer/products"
MANIFEST_PATH = ASSET_DIR / "product-image-manifest.json"
CREDITS_PATH = ASSET_DIR / "PHOTO-CREDITS.md"
MIGRATION_PATH = ROOT / "supabase/migrations/20260817023927_seed_product_cover_images.sql"

REJECT_TITLE_TERMS = {
    "ferm-cameron-highland-vegetables": {"restaurant", "facade"},
    "ferm-nyonya-steamboat-set": {"restaurant"},
    "guide-gunung-raya-trek": {"railway bridge", "railway", "church", "mount nebo"},
    "jesselton-deluxe-room": {"dinner room service", "room service"},
    "kwan-kee-fried-rice": {"fried rice cake"},
    "loyal-maxim-chocolate-box": {"manufacture of", "cocoa", "ice box coating", "cake", "dessert"},
    "pht-george-town-heritage-walk": {"sundarban", "west bengal", "india"},
    "shangrila-garden-room": {"waiting room", "lobby", "desk-top", "writing pad", "room supplies"},
    "taman-ular-entry-ticket": {"ticket counter", "railway station"},
    "tar-marine-park-snorkel-dive-trip": {"diving platforms", "aquatic center", "mylan park"},
    "toh-soon-hainanese-kopi": {"cup-shaped", "balconies", "tableware", "street"},
    "twentytrees-standard-room": {"floor directory", "hospital", "dinner room service", "room service"},
    "upsidedown-entry-ticket": {"automatic ticket machines", "railway station", "fort margherita", "national park", "bako", "fairy cave", "midnightoil"},
    "wah-san-iced-lime": {"picnic table", "lime kilns", "geograph"},
    "watphoti-heritage-visit-zarkasyi": {"sundarban", "west bengal", "india", "forest"},
    "welcome-salted-egg-prawn": {"noodle soup", "noodle", "seaweed", "biryani"},
    "yasmin-chicken-shawarma": {"rice tehri", "chicken gravy"},
    "zhunsan-vegetarian-rice-set": {"chow mein", "noodle rolls"},
    "zon-duty-free-chocolate-snacks-box": {"cake", "st. honoré", "albatross", "butterfly", "insect"},
    "retail-cameron-tea-gift-set": {"tea estate", "plantation", "tea plantations", "cameron valley tea", "papan tanda"},
    "retail-nyonya-beaded-slippers": {"craft activity"},
}
CACHE_PATH = Path("/tmp/mywisata-product-commons-cache.json")
PROGRESS_PATH = Path("/tmp/mywisata-product-image-progress.json")
USER_AGENT = "MyWisata-product-image-curator/1.0 (local development; Wikimedia Commons attribution recorded)"

CATEGORY_TERMS = {
    "food": {"food", "dish", "meal", "restaurant", "restoran", "cafe", "coffee", "tea", "bakery", "noodle", "rice", "satay", "cooking", "dining", "drink", "dessert", "cake", "hawker", "market"},
    "accommodation": {"hotel", "resort", "room", "suite", "villa", "chalet", "hostel", "homestay", "guesthouse", "lodge", "inn", "motel", "accommodation", "bedroom", "lobby"},
    "activity": {"park", "museum", "temple", "beach", "island", "waterfall", "forest", "garden", "heritage", "tour", "trail", "cruise", "cable", "railway", "ticket", "attraction", "monument", "mosque", "church", "gallery", "cave", "fort", "castle", "bridge", "diving", "village", "tower", "nature", "walk", "adventure", "mansion", "skyway", "boardwalk", "waterfront", "rapids", "kongsi"},
    "retail": {"shop", "store", "market", "mall", "shopping", "batik", "craft", "handicraft", "souvenir", "book", "bookstore", "boutique", "bakery", "biscuit", "chocolate", "pottery", "textile", "sarong", "postcard", "oil", "box", "product", "lamp"},
}

STOPWORDS = {
    "and", "the", "for", "with", "from", "this", "that", "your", "our", "one", "two", "adult", "child", "children", "ticket", "entry", "pass", "day", "days", "return", "single", "round", "way", "set", "pack", "package", "option", "options", "room", "rooms", "standard", "deluxe", "classic", "premium", "plus", "only", "access", "admission", "available", "at", "to", "of", "in", "by", "via", "experience", "activity", "food", "drink", "product", "service", "shop", "store", "hotel", "restaurant", "cafe", "resort", "tour", "travel", "company", "sdn", "bhd", "the", "a", "an",
}


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    env_path = ROOT / ".env.local"
    if env_path.exists():
        for raw in env_path.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    values.update({key: value for key, value in os.environ.items() if key.startswith("NEXT_PUBLIC_SUPABASE_")})
    return values


def get_json(url: str, *, timeout: int = 30, attempts: int = 4) -> dict | list:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:  # Commons throttles bursts with HTTP 429.
            last_error = exc
            time.sleep(8.0 + attempt * 4.0 if exc.code == 429 else 1.0 + attempt)
        except Exception as exc:  # network failures are retried with bounded backoff
            last_error = exc
            time.sleep(1.0 + attempt)
    raise RuntimeError(f"request failed after {attempts} attempts: {last_error}")


def download(url: str, destination: Path, *, timeout: int = 30, attempts: int = 4) -> bytes:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            request = Request(url, headers={"User-Agent": USER_AGENT})
            with urlopen(request, timeout=timeout) as response:
                payload = response.read()
            if len(payload) < 10_000:
                raise RuntimeError(f"downloaded file is too small: {len(payload)} bytes")
            destination.write_bytes(payload)
            return payload
        except Exception as exc:
            last_error = exc
            if destination.exists():
                destination.unlink()
            time.sleep(1.0 + attempt)
    raise RuntimeError(f"download failed after {attempts} attempts: {last_error}")


def fetch_inventory() -> list[dict]:
    env = load_env()
    base = env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not base or not key:
        raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required")
    params = urlencode({
        "select": "id,name,slug,description,product_type,tags,attributes,categories(name,slug),vendors(name),outlets(name,city,state)",
        "status": "eq.active",
        "review_status": "eq.approved",
        "limit": "1000",
        "order": "slug.asc",
    })
    request = Request(
        f"{base.rstrip('/')}/rest/v1/products?{params}",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"},
    )
    with urlopen(request, timeout=30) as response:
        rows = json.loads(response.read().decode("utf-8"))
    if not isinstance(rows, list) or not rows:
        raise RuntimeError("Supabase returned no active approved products")
    return rows


def strip_markup(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", value or ""))).strip()


def tokens(value: str) -> list[str]:
    return [token for token in re.findall(r"[a-z0-9]+", (value or "").lower()) if len(token) > 2]


def meaningful(value: str) -> set[str]:
    return {token for token in tokens(value) if token not in STOPWORDS}


def semantic_aliases(name: str) -> list[str]:
    lowered = name.lower()
    aliases: list[str] = []
    common_product_terms = {
        "squid", "prawn", "shrimp", "tofu", "fish", "chicken", "beef", "lamb", "rice", "noodle", "wonton", "satay", "laksa", "burger", "soup", "cake", "bread", "toast", "rojak", "kaya", "mee", "egg", "seafood", "curry", "pancake", "dumpling", "bun", "steamboat", "hotpot", "chalet", "firefly", "vegetable", "fruit", "durian", "mango", "banana", "heong", "pneah", "sesame", "oil", "honey", "sugar", "biscuit", "chocolate", "pottery", "sarong", "batik", "book", "postcard", "postcards", "reader", "ticket", "museum", "temple", "cruise", "cable", "island", "beach", "waterfall", "forest", "trail", "garden", "heritage",
    }
    aliases.extend(token for token in tokens(name) if token in common_product_terms)
    if "tea pot" in lowered:
        aliases.append("teapot")
    if "iced barley" in lowered:
        aliases.extend(["barley water", "barley drink"])
    if "vegetable" in lowered or "vegetables" in lowered:
        aliases.append("vegetables")
    if "souvenir" in lowered:
        aliases.append("souvenir")
    if "historical" in lowered and "reader" in lowered:
        aliases.append("historical book")
    if "sesame" in lowered and "oil" in lowered:
        aliases.append("sesame oil")
    if "tau sar" in lowered or "pneah" in lowered:
        aliases.extend(["tau sar", "biscuit"])
    if "baba nyonya" in lowered:
        aliases.extend(["baba nyonya", "culture"])
    if "teresek" in lowered:
        aliases.extend(["bukit teresek", "taman negara"])
    if "danga bay" in lowered:
        aliases.extend(["danga bay", "waterfront"])
    if "gunung raya" in lowered:
        aliases.extend(["gunung raya", "mount raya"])
    if "jonker" in lowered:
        aliases.extend(["jonker street", "night market"])
    if "kilim" in lowered or "mangrove" in lowered:
        aliases.extend(["Kilim Geoforest Park", "Langkawi Mangrove Forest"])
    if "lata berkoh" in lowered:
        aliases.extend(["Taman Negara rapids", "Rapids at Taman Negara"])
    if "rafflesia" in lowered:
        aliases.extend(["Rafflesia Malaysia", "Rafflesia Sabah"])
    if "executive suite" in lowered:
        aliases.append("executive suite living room")
    if "suite" in lowered:
        aliases.append("suite interior")
    if "room" in lowered:
        aliases.append("hotel room interior")
    if "standard room" in lowered:
        aliases.append("standard hotel room")
    if "beachfront room" in lowered:
        aliases.append("beachfront hotel room")
    if "garden room" in lowered:
        aliases.append("garden room hotel")
    if "deluxe room" in lowered:
        aliases.append("deluxe hotel room")
    if "premier room" in lowered:
        aliases.append("premier hotel room")
    if "brass lamp" in lowered or "antique lamp" in lowered:
        aliases.append("antique brass lamp")
    if "bead" in lowered:
        aliases.extend(["beadwork", "beads craft"])
    if "slipper" in lowered and "bead" in lowered:
        aliases.extend(["beaded slippers", "Nyonya slippers"])
    if "gift set" in lowered and "tea" in lowered:
        aliases.extend(["tea set", "tea caddy"])
    if "tile" in lowered and "coaster" in lowered:
        aliases.extend(["tile coaster", "tile coasters"])
    if "strawberry" in lowered and ("preserve" in lowered or "jam" in lowered):
        aliases.extend(["strawberry jam jar", "strawberry preserves"])
    if "gift box" in lowered:
        aliases.append("gift box")
    if "family room" in lowered:
        aliases.extend(["family room hotel", "family room interior"])
    if "garden" in lowered and "room" in lowered:
        aliases.extend(["garden room hotel", "garden room interior"])
    if "sea view" in lowered and "room" in lowered:
        aliases.extend(["sea view hotel room", "seaview room hotel"])
    if "songket" in lowered:
        aliases.extend(["songket weaving", "songket textile"])
    if "semenggoh" in lowered:
        aliases.extend(["Semenggoh orangutan", "Semenggoh Forest Reserve"])
    if "pulau redang" in lowered or "redang" in lowered:
        aliases.append("Pulau Redang Malaysia")
    if "siew pau" in lowered:
        aliases.append("Seremban siew pau")
    if "kellie" in lowered or "kellies" in lowered:
        aliases.append("Kellie's Castle")
    if "khoo kongsi" in lowered:
        aliases.append("Khoo Kongsi Penang")
    if "laksam" in lowered:
        aliases.append("Laksam Malaysia")
    if "mari mari" in lowered:
        aliases.append("Mari Mari Cultural Village Sabah")
    if "skyway" in lowered or "cable car" in lowered:
        aliases.append("Genting Skyway cable car")
    if "garden chalet" in lowered:
        aliases.append("chalet garden")
    if "ice kacang" in lowered:
        aliases.extend(["ais kacang", "shaved ice"])
    if "white coffee" in lowered:
        aliases.append("kopi");
    if "kopi" in lowered:
        aliases.extend(["Kopi O", "coffee cup"])
    if "boiled" in lowered and "egg" in lowered:
        aliases.extend(["half boiled egg", "boiled egg"])
    if "ayam percik" in lowered:
        aliases.extend(["ayam percik", "percik chicken"])
    if "steamboat" in lowered:
        aliases.extend(["steamboat hotpot", "hot pot"])
    if "marine park" in lowered and ("snorkel" in lowered or "dive" in lowered):
        aliases.extend(["Tunku Abdul Rahman National Park", "snorkeling reef"])
    if "chocolate" in lowered and "box" in lowered:
        aliases.extend(["chocolate box", "chocolate gift box"])
    if "salted egg" in lowered and ("prawn" in lowered or "shrimp" in lowered):
        aliases.extend(["salted egg prawn", "salted egg shrimp"])
    if "photi" in lowered or "pothi" in lowered:
        aliases.extend(["Wat Pothivihan", "Pothivihan temple"])
    if "upside" in lowered and "ticket" in lowered:
        aliases.extend(["Upside Down House ticket", "Upside Down House"])
    if "lime" in lowered or "calamansi" in lowered:
        aliases.extend(["lime juice", "limeade", "calamansi juice"])
    if "nasi kandar" in lowered:
        aliases.append("kandar")
    if "cendol" in lowered:
        aliases.append("chendol")
    return aliases


def relation_name(row: dict, relation: str) -> str:
    value = row.get(relation) or {}
    return value.get("name", "") if isinstance(value, dict) else ""


def context(row: dict) -> dict[str, str | set[str]]:
    category = ((row.get("categories") or {}).get("slug") or row.get("product_type") or "activity").lower()
    outlet = row.get("outlets") or {}
    vendor_name = relation_name(row, "vendors")
    location = " ".join(str(outlet.get(part, "")) for part in ("city", "state"))
    description = row.get("description") or ""
    name = row.get("name") or row.get("slug") or ""
    return {
        "category": category,
        "name": name,
        "vendor": vendor_name,
        "location": location,
        "description": description,
        "strong_name": meaningful(name),
        "strong_vendor": meaningful(vendor_name),
        "strong_location": meaningful(location),
    }


def commons_search(query: str, limit: int = 40) -> list[dict]:
    params = urlencode({
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "generator": "search",
        "gsrsearch": query,
        "gsrnamespace": "6",
        "gsrlimit": str(limit),
        "prop": "imageinfo",
        "iiprop": "url|size|mime|extmetadata",
        "iiurlwidth": "1000",
    })
    payload = get_json(f"https://commons.wikimedia.org/w/api.php?{params}")
    pages = ((payload.get("query") or {}).get("pages") or []) if isinstance(payload, dict) else []
    candidates = []
    for page in pages:
        info = (page.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata") or {}
        mime = info.get("mime", "")
        if not info.get("thumburl") or mime not in {"image/jpeg", "image/png", "image/webp"}:
            continue
        license_name = strip_markup((meta.get("LicenseShortName") or {}).get("value", "")) or "Wikimedia Commons license"
        artist = strip_markup((meta.get("Artist") or {}).get("value", "")) or "Wikimedia Commons contributors"
        description = strip_markup((meta.get("ImageDescription") or {}).get("value", ""))
        candidates.append({
            "pageid": page.get("pageid"),
            "title": page.get("title", ""),
            "source_page": page.get("canonicalurl") or f"https://commons.wikimedia.org/?curid={page.get('pageid')}",
            "image_url": info.get("thumburl"),
            "mime": mime,
            "width": int(info.get("width") or 0),
            "height": int(info.get("height") or 0),
            "license": license_name,
            "artist": artist,
            "description": description,
        })
    return candidates


def query_variants(row: dict) -> list[str]:
    ctx = context(row)
    name = str(ctx["name"])
    vendor = str(ctx["vendor"])
    location = str(ctx["location"])
    category = str(ctx["category"])
    description_tokens = list(meaningful(str(ctx["description"])))[:5]
    name_terms = " ".join(sorted(meaningful(name)))
    name_sequence = [token for token in tokens(name) if token not in STOPWORDS]
    vendor_terms = " ".join(sorted(meaningful(vendor)))
    location_terms = " ".join(sorted(meaningful(location)))
    queries = [
        name_terms,
        vendor_terms,
        " ".join(part for part in (location_terms, category) if part),
        " ".join(part for part in (name_terms, location_terms, "Malaysia") if part),
        " ".join(part for part in (vendor_terms, location_terms, "Malaysia") if part),
        " ".join(part for part in (name_terms, category, "Malaysia") if part),
    ]
    for index in range(len(name_sequence) - 1):
        queries.append(" ".join((name_sequence[index], name_sequence[index + 1], category, "Malaysia")))
    for alias in semantic_aliases(name):
        queries.extend([alias, f"{alias} Malaysia", f"{alias} {category} Malaysia"])
    if "mari mari" in vendor.lower():
        queries.extend(["Mari Mari Cultural Village Sabah", "Mari Mari Cultural Village entrance"])
    if "penang hill" in vendor.lower() or "funicular" in str(ctx["description"]).lower():
        queries.extend(["Penang Hill funicular", "Penang Hill railway"])
    if description_tokens:
        queries.append(" ".join([*description_tokens, category, "Malaysia"]))
    queries.append({
        "food": "Malaysia food",
        "accommodation": "Malaysia hotel",
        "activity": "Malaysia attraction",
        "retail": "Malaysia craft shop",
    }.get(category, "Malaysia tourism"))
    return list(dict.fromkeys(query.strip() for query in queries if query.strip()))


def candidate_score(candidate: dict, row: dict) -> tuple[int, bool]:
    ctx = context(row)
    haystack = " ".join((candidate.get("title", ""), candidate.get("description", ""))).lower()
    title = candidate.get("title", "").lower()
    hay_tokens = set(tokens(haystack))
    title_tokens = set(tokens(title))
    category = str(ctx["category"])
    category_terms = CATEGORY_TERMS.get(category, set())
    raw_name_tokens = set(tokens(str(ctx["name"])))
    name_tokens = set(ctx["strong_name"]) | set().union(*(meaningful(alias) for alias in semantic_aliases(str(ctx["name"]))))
    vendor_tokens = set(ctx["strong_vendor"])
    location_tokens = set(ctx["strong_location"])
    name_hits = sum(token in hay_tokens for token in name_tokens)
    vendor_hits = sum(token in hay_tokens for token in vendor_tokens)
    location_hits = sum(token in hay_tokens for token in location_tokens)
    category_hits = sum(token in hay_tokens for token in category_terms)
    title_name_hits = sum(token in title_tokens for token in name_tokens)
    generic_name_tokens = {"salted", "egg", "iced", "classic", "premium", "set", "platter", "house", "special", "breakfast", "deluxe", "standard", "heritage", "family", "twin", "budget", "single", "double", "room", "suite", "oil", "george", "town", "penang", "malacca", "melaka", "kuala", "lumpur", "johor", "bahru", "sabah", "sarawak", "cameron", "highland", "historical"}
    distinctive_name_tokens = name_tokens - generic_name_tokens
    title_distinctive_hits = sum(token in title_tokens for token in distinctive_name_tokens)
    title_vendor_hits = sum(token in title_tokens for token in vendor_tokens)
    title_location_hits = sum(token in title_tokens for token in location_tokens)
    title_category_hits = sum(token in title_tokens for token in category_terms)
    exact_phrase = str(ctx["name"]).lower() in title
    alias_phrase = any(alias.lower() in title for alias in semantic_aliases(str(ctx["name"])))
    category_compatible = category_hits > 0
    if category == "accommodation":
        accommodation_clue = any(term in hay_tokens for term in {"hotel", "room", "suite", "resort", "villa", "chalet", "hostel", "homestay", "guesthouse", "lodge", "inn", "accommodation"})
        locality_clue = location_hits > 0 or "malaysia" in hay_tokens
        category_compatible = accommodation_clue and locality_clue and (title_name_hits > 0 or title_vendor_hits > 0 or title_location_hits > 0 or title_category_hits > 0)
        if raw_name_tokens & {"room", "suite", "chalet"} and not title_tokens & {"room", "suite", "suites", "interior", "bedroom", "lobby", "chalet"}:
            category_compatible = False
        if raw_name_tokens & {"room", "suite", "chalet"} and title_tokens & {"dining", "restaurant", "banquet", "kitchen", "conference"}:
            category_compatible = False
        if "executive" in raw_name_tokens and "suite" in raw_name_tokens and "executive" in title_tokens and title_tokens & {"suite", "suites", "room", "living", "bedroom"}:
            category_compatible = True
        if "suite" in raw_name_tokens and title_tokens & {"suite", "suites", "bedroom", "bathroom", "interior", "lobby", "living", "canopy", "bathtub"}:
            category_compatible = True
        if "room" in raw_name_tokens and title_tokens & {"room", "rooms", "bedroom", "interior", "lobby", "living", "bathroom"}:
            category_compatible = True
        if "chalet" in raw_name_tokens and "chalet" in title_tokens:
            category_compatible = True
        if title_tokens & {"dining", "restaurant", "banquet", "kitchen", "conference", "shop", "store", "aircraft", "a350", "delta", "boeing", "airbus", "flight", "cockpit", "airline", "cabin", "seat"}:
            category_compatible = False
        if title_tokens & {"car", "cars", "ferrari", "vehicle", "race", "motorcycle", "motor", "automobile", "bmw", "mercedes", "porsche", "audi", "toyota", "honda", "lamborghini", "bugatti", "lexus", "volkswagen", "volvo", "jeep", "ford", "nissan", "subaru", "mazda", "suzuki", "yamaha", "ducati"}:
            category_compatible = False
    elif category == "food":
        category_compatible = category_compatible or any(term in hay_tokens for term in {"dish", "meal", "restaurant", "tea", "coffee", "noodle", "rice", "cake", "dessert", "food", "drink", "beverage", "water"})
        if "siew" in name_tokens and "pau" in name_tokens and {"siew", "pau"}.issubset(title_tokens):
            category_compatible = True
        if "laksam" in str(ctx["name"]).lower() and "laksam" in title:
            category_compatible = True
    elif category == "retail":
        category_compatible = category_compatible or any(term in hay_tokens for term in {"shop", "store", "market", "mall", "batik", "craft", "souvenir", "book", "chocolate", "pottery"})
        if "siew" in name_tokens and "pau" in name_tokens and {"siew", "pau"}.issubset(title_tokens):
            category_compatible = True
        if "lamp" in str(ctx["name"]).lower() and "lamp" in title:
            category_compatible = True
    elif category == "activity":
        category_compatible = category_compatible or any(term in hay_tokens for term in {"attraction", "hill", "walk", "ticket", "tour", "museum", "temple", "park", "beach", "island", "cruise", "heritage", "nature"})
        activity_generic_tokens = {"ticket", "pass", "entry", "day", "tour", "guided", "discovery", "walk", "return", "adult", "family", "climb", "trail", "admission", "experience", "activity", "visit"}
        activity_specific_tokens = name_tokens - activity_generic_tokens
        if activity_specific_tokens and title_name_hits == 0:
            category_compatible = False
        if activity_specific_tokens and title_category_hits == 0:
            category_compatible = False
        if "rafflesia" in name_tokens and "rafflesia" in title_tokens:
            category_compatible = True
        if "mari mari" in str(ctx["vendor"]).lower() and {"cultural", "village"}.issubset(title_tokens):
            category_compatible = True
        if "skyway" in str(ctx["name"]).lower() and title_tokens & {"cable", "car", "skyway"}:
            category_compatible = True
        if "penang hill" in str(ctx["vendor"]).lower() and title_tokens & {"hill", "funicular"}:
            category_compatible = True
        if "gunung raya" in str(ctx["name"]).lower() and title_tokens & {"gunung", "raya", "mountain", "panorama"}:
            category_compatible = True
        if "penang hill" in str(ctx["vendor"]).lower() and title_tokens & {"office", "administration", "headquarters"}:
            category_compatible = False
        if "semenggoh" in str(ctx["name"]).lower() and title_tokens & {"semenggoh", "semenggok", "orangutan", "orangutans"}:
            category_compatible = True
        if name_tokens & {"trek", "climb", "trail", "hike", "hiking"} and title_tokens & {
            "lizard", "snake", "bird", "butterfly", "monkey", "insect", "spider", "reptile", "frog"
        }:
            category_compatible = False
    if category in {"food", "retail"} and name_tokens and (title_name_hits == 0 or (distinctive_name_tokens and title_distinctive_hits == 0)):
        category_compatible = False
    if category in {"food", "retail"} and str(ctx["name"]).lower() in title:
        category_compatible = True
    if category == "retail" and "lamp" in str(ctx["name"]).lower() and title_tokens & {"lamp", "lamps"}:
        category_compatible = True
    if category == "retail" and "bead" in str(ctx["name"]).lower() and title_tokens & {"bead", "beads", "beadwork"}:
        category_compatible = True
    if category == "retail" and "slipper" in str(ctx["name"]).lower() and title_tokens & {"slipper", "slippers", "shoe", "shoes"}:
        category_compatible = True
    if category == "retail" and "tea" in str(ctx["name"]).lower() and title_tokens & {"tea", "teapot", "caddy", "package", "tin", "box"} and not title_tokens & {"plantation", "field", "landscape", "mountain"}:
        category_compatible = True
    if category == "retail" and "coaster" in str(ctx["name"]).lower() and title_tokens & {"coaster", "coasters"}:
        category_compatible = True
    if category == "retail" and "strawberry" in str(ctx["name"]).lower() and title_tokens & {"strawberry"} and title_tokens & {"jam", "preserve", "preserves", "confiture"}:
        category_compatible = True
    if category == "retail" and "gift box" in str(ctx["name"]).lower() and title_tokens & {"gift", "box"}:
        category_compatible = True
    if category == "retail" and "chocolate" in str(ctx["name"]).lower() and title_tokens & {"chocolate"} and title_tokens & {"box", "gift", "truffles", "truffle"}:
        category_compatible = True
    if category == "retail" and "songket" in str(ctx["name"]).lower() and title_tokens & {"songket", "weaving", "woven", "textile"}:
        category_compatible = True
    if category == "food" and name_tokens & {"tea", "coffee", "barley", "juice", "cocktail", "drink", "beverage", "cendol", "chendol"}:
        scenic_or_infrastructure = {"geograph", "field", "bridge", "river", "tower", "road", "landscape", "waterfall", "railway", "station"}
        food_visual_clue = {"drink", "beverage", "tea", "coffee", "juice", "cocktail", "food", "dish", "bowl", "cup", "glass", "bottle", "soup", "chendol", "cendol"}
        if title_tokens & scenic_or_infrastructure and not title_tokens & food_visual_clue:
            category_compatible = False
    if category == "food" and title_tokens & {"upazilla", "station", "road", "street", "building", "landscape", "town", "village", "railway"} and not title_tokens & {"food", "dish", "bowl", "plate", "meal", "restaurant", "cafe", "noodle", "rice", "soup", "cake", "bread", "bun", "snack"}:
        category_compatible = False
    if category == "food" and "kopi" in str(ctx["name"]).lower() and title_tokens & {"kopi", "coffee"}:
        category_compatible = True
    if category == "food" and ("lime" in str(ctx["name"]).lower() or "calamansi" in str(ctx["name"]).lower()) and title_tokens & {"lime", "limeade", "juice", "beverage", "drink"}:
        category_compatible = True
    if category == "food" and "egg" in str(ctx["name"]).lower() and title_tokens & {"egg", "eggs"} and title_tokens & {"boiled", "boil"}:
        category_compatible = True
    if category == "food" and "percik" in str(ctx["name"]).lower() and title_tokens & {"percik", "ayam"}:
        category_compatible = True
    if category == "food" and "steamboat" in str(ctx["name"]).lower() and title_tokens & {"hot", "pot", "hotpot"}:
        category_compatible = True
    if category == "food" and "salted egg" in str(ctx["name"]).lower() and title_tokens & {"salted", "egg"} and title_tokens & {"prawn", "prawns", "shrimp"}:
        category_compatible = True
    if category == "activity" and "marine park" in str(ctx["name"]).lower() and title_tokens & {"tunku", "reef", "snorkel", "snorkeling", "diving", "dive"}:
        category_compatible = True
    if category == "activity" and ("photi" in str(ctx["name"]).lower() or "pothi" in str(ctx["name"]).lower()) and title_tokens & {"pothivihan", "temple", "buddha", "reclining"}:
        category_compatible = True
    if category == "activity" and "upside" in str(ctx["name"]).lower() and title_tokens & {"upside", "house", "ticket", "booth", "museum"}:
        category_compatible = True
    score = name_hits * 18 + vendor_hits * 12 + location_hits * 5 + title_name_hits * 30 + title_distinctive_hits * 45 + title_vendor_hits * 20 + title_location_hits * 10 + category_hits * 3 + title_category_hits * 12
    if exact_phrase:
        score += 80
    if alias_phrase:
        score += 60
    if candidate.get("width", 0) >= 800 and candidate.get("height", 0) >= 500:
        score += 5
    if category == "food" and any(term in hay_tokens for term in {"food", "dish", "restaurant", "tea", "coffee", "noodle", "rice", "cake", "dessert"}):
        score += 8
    if category == "accommodation" and any(term in hay_tokens for term in {"hotel", "resort", "room", "suite", "villa", "chalet"}):
        score += 8
    return score, category_compatible


def choose_candidate(row: dict, used_pages: set[int], used_hashes: set[str], cache: dict[str, list[dict]]) -> dict:
    all_candidates: dict[int, dict] = {}
    for query in query_variants(row):
        if query not in cache:
            cache[query] = commons_search(query)
            time.sleep(1.0)
        for candidate in cache[query]:
            pageid = candidate.get("pageid")
            if pageid and pageid not in all_candidates:
                all_candidates[pageid] = candidate

    ranked = []
    for candidate in all_candidates.values():
        pageid = candidate.get("pageid")
        candidate_title = candidate.get("title", "").lower()
        if any(term in candidate_title for term in REJECT_TITLE_TERMS.get(str(row["slug"]), set())):
            continue
        if row["slug"] == "welcome-salted-egg-prawn" and not (
            "salted" in candidate_title and "egg" in candidate_title and ("prawn" in candidate_title or "shrimp" in candidate_title)
        ):
            continue
        if row["slug"] == "upsidedown-entry-ticket" and not any(term in candidate_title for term in {"ticket", "booth", "upside down", "upside-down"}):
            continue
        exact_semantic_match = str(row.get("name", "")).lower() in candidate_title or any(
            alias.lower() in candidate_title for alias in semantic_aliases(str(row.get("name", "")))
        )
        if not pageid or pageid in used_pages or (
            (candidate.get("width", 0) < 500 or candidate.get("height", 0) < 350) and not exact_semantic_match
        ):
            continue
        score, compatible = candidate_score(candidate, row)
        if not compatible:
            continue
        ranked.append((score, candidate))
    ranked.sort(key=lambda item: (-item[0], item[1].get("pageid", 0)))

    for _, candidate in ranked:
        slug = re.sub(r"[^a-z0-9-]+", "-", str(row["slug"]).lower()).strip("-")
        extension = {"image/png": ".png", "image/webp": ".webp"}.get(candidate["mime"], ".jpg")
        destination = ASSET_DIR / f"{slug}{extension}"
        try:
            payload = download(candidate["image_url"], destination)
        except RuntimeError:
            continue
        digest = hashlib.sha256(payload).hexdigest()
        if digest in used_hashes:
            destination.unlink(missing_ok=True)
            continue
        used_pages.add(candidate["pageid"])
        used_hashes.add(digest)
        return {**candidate, "asset_path": f"/assets/customer/products/{destination.name}", "sha256": digest}

    context_label = f"{row.get('slug')} ({row.get('name')})"
    raise RuntimeError(f"no unique semantically relevant Commons image found for {context_label}")


def write_outputs(rows: list[dict], manifest: list[dict]) -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    manifest = sorted(manifest, key=lambda item: item["slug"])
    MANIFEST_PATH.write_text(json.dumps({"products": manifest}, ensure_ascii=False, indent=2) + "\n")

    credits = [
        "# Product photo credits",
        "",
        "All product cover images below were downloaded from Wikimedia Commons. The local copies are used so the customer catalogue does not depend on a remote image host at runtime.",
        "",
        "| Product | Local asset | Source | Creator | License |",
        "| --- | --- | --- | --- | --- |",
    ]
    for item in manifest:
        def safe(value: str) -> str:
            return str(value).replace("|", "\\|").replace("\n", " ")
        credits.append(f"| {safe(item['name'])} (`{item['slug']}`) | `{item['asset_path']}` | [{safe(item['title'])}]({item['source_page']}) | {safe(item['artist'])} | {safe(item['license'])} |")
    CREDITS_PATH.write_text("\n".join(credits) + "\n")

    sql = [
        "-- Generated from public/assets/customer/products/product-image-manifest.json.",
        "-- Each path is local, slug-scoped, and backed by the matching Commons credit row.",
        "BEGIN;",
        "",
    ]
    for item in manifest:
        slug = item["slug"].replace("'", "''")
        path = item["asset_path"].replace("'", "''")
        sql.extend([
            f"UPDATE public.products SET cover_url = '{path}'",
            f"WHERE slug = '{slug}' AND status = 'active' AND review_status = 'approved';",
        ])
    sql.extend([
        "",
        "DO $$",
        "DECLARE scoped_count integer; missing_count integer; unique_count integer;",
        "BEGIN",
        "  SELECT count(*) INTO scoped_count FROM public.products WHERE status = 'active' AND review_status = 'approved';",
        "  SELECT count(*) INTO missing_count FROM public.products WHERE status = 'active' AND review_status = 'approved' AND cover_url IS NULL;",
        "  SELECT count(DISTINCT cover_url) INTO unique_count FROM public.products WHERE status = 'active' AND review_status = 'approved';",
        "  IF scoped_count <> 293 OR missing_count <> 0 OR unique_count <> 293 THEN",
        "    RAISE EXCEPTION 'expected 293 active approved products with unique local cover paths; count=%, missing=%, unique=%', scoped_count, missing_count, unique_count;",
        "  END IF;",
        "  IF EXISTS (SELECT 1 FROM public.products WHERE status = 'active' AND review_status = 'approved' AND cover_url NOT LIKE '/assets/customer/products/%') THEN",
        "    RAISE EXCEPTION 'all active approved product cover paths must be local product assets';",
        "  END IF;",
        "END $$;",
        "",
        "COMMIT;",
        "",
    ])
    MIGRATION_PATH.write_text("\n".join(sql))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="curate only the first N products; for a connectivity smoke test")
    parser.add_argument("--resume", action="store_true", help="reuse the completed product selections from the previous interrupted run")
    parser.add_argument("--recurate", nargs="*", default=[], help="remove and reselect the listed slugs while resuming")
    args = parser.parse_args()

    rows = fetch_inventory()
    if len(rows) != 293:
        raise RuntimeError(f"expected 293 active approved products, received {len(rows)}")
    if args.limit:
        rows = rows[:args.limit]

    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    cache: dict[str, list[dict]] = {}
    if CACHE_PATH.exists():
        try:
            cache = json.loads(CACHE_PATH.read_text())
        except json.JSONDecodeError:
            cache = {}
    used_pages: set[int] = set()
    used_hashes: set[str] = set()
    manifest: list[dict] = []
    if args.resume and PROGRESS_PATH.exists():
        manifest = json.loads(PROGRESS_PATH.read_text())
        if args.recurate:
            recurate_slugs = set(args.recurate)
            retained = []
            for item in manifest:
                if item["slug"] in recurate_slugs:
                    asset = ROOT / "public" / item["asset_path"].lstrip("/")
                    asset.unlink(missing_ok=True)
                else:
                    retained.append(item)
            manifest = retained
            PROGRESS_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
            print(f"recurating {len(recurate_slugs)} requested products", flush=True)
        for item in manifest:
            used_pages.add(int(item["pageid"]))
            used_hashes.add(item["sha256"])
        print(f"resuming {len(manifest)} previously curated products", flush=True)
    completed = {item["slug"] for item in manifest}

    for index, row in enumerate(rows, start=1):
        if row["slug"] in completed:
            continue
        selected = choose_candidate(row, used_pages, used_hashes, cache)
        item = {
            "slug": row["slug"],
            "name": row["name"],
            "category": ((row.get("categories") or {}).get("slug") or row.get("product_type") or "activity"),
            "asset_path": selected["asset_path"],
            "source_page": selected["source_page"],
            "source_image_url": selected["image_url"],
            "title": selected["title"],
            "license": selected["license"],
            "artist": selected["artist"],
            "sha256": selected["sha256"],
            "pageid": selected["pageid"],
        }
        manifest.append(item)
        completed.add(row["slug"])
        PROGRESS_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
        print(f"[{index}/{len(rows)}] {row['slug']} <- {selected['title']}", flush=True)
        if index % 10 == 0:
            CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False))

    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False))
    if args.limit:
        print(f"curated smoke-test subset: {len(manifest)} products; no migration generated")
        return 0
    write_outputs(rows, manifest)
    print(f"curated {len(manifest)} unique product images")
    print(f"manifest: {MANIFEST_PATH}")
    print(f"credits: {CREDITS_PATH}")
    print(f"migration: {MIGRATION_PATH}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        raise SystemExit(130)
