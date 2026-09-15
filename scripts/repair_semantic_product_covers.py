#!/usr/bin/env python3
"""Assign source-backed product covers by semantic subject, not only uniqueness.

This is a maintenance command for the checked-in product-cover manifest.  It
only accepts downloaded source-backed images and writes canonical product-
specific copies when invoked with --write.
"""

from __future__ import annotations

import argparse
import glob
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from curate_product_images import candidate_score, object_compatible, photo_category  # noqa: E402

MANIFEST_PATH = ROOT / "scripts/data/product-cover-source-manifest.json"
PRODUCTS_DIR = ROOT / "public/assets/customer/products"
ROOM_ASSETS = Path("/tmp/mywisata-final-room-assets")
CACHE_PATH = Path("/tmp/mywisata-product-commons-cache.json")
DISALLOWED = re.compile(r"picsum|placeholder|generated|illustrative|lorem ipsum", re.I)
BAD_ACCOMMODATION = (
    "a350", "delta one", "airline", "airplane", "airport", "church of", "stadium",
    "cafe", "restaurant", "dining", "museum", "building exterior", "facade",
    "lobby card", "vehicle", "car ", "road", "street", "railway", "station",
    "landscape", "town", "cityscape", "panoramic view",
)
BAD_NON_PRODUCT_SUBJECT = (
    "airliner", "airline", "airplane", "aircraft", "airport", "boeing", "airbus", "road", "street",
    "railway", "station", "building", "landscape", "town", "cityscape",
    "temple", "church", "mosque", "hotel exterior", "facade", "bridge", "tower",
    "monument", "park entrance", "room interior", "hotel room", "lobby", "vehicle",
)


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_rows() -> list[dict]:
    rows = json.loads(MANIFEST_PATH.read_text())["products"]
    result = []
    for item in rows:
        fallback = item.get("source_key", "").split("||")[-1] or "activity"
        result.append({
            "slug": item["slug"],
            "name": item["name"],
            "vendor_id": item["vendor_id"],
            "product_id": item["product_id"],
            "category": photo_category(item["name"], fallback),
        })
    return result


def add_candidate(candidates: list[dict], item: dict, local_path: Path, label: str, priority: int) -> None:
    if not local_path.is_file():
        return
    if item.get("source_type") == "generated" or DISALLOWED.search(json.dumps(item, ensure_ascii=False)):
        return
    source_page = item.get("source_page") or item.get("sourceUrl")
    source_image = item.get("source_image_url") or item.get("sourceImageUrl") or item.get("image_url")
    if not source_page or not source_image or not item.get("artist") or not item.get("license"):
        return
    candidates.append({
        **item,
        "local_path": str(local_path),
        "filename": local_path.name,
        "sha256": item.get("sha256") or sha256_file(local_path),
        "pageid": int(item.get("pageid") or 0),
        "source_type": item.get("source_type") or "commons",
        "source_page": source_page,
        "source_image_url": source_image,
        "title": item.get("title") or "",
        "label": label,
        "priority": priority,
    })


def load_candidates() -> list[dict]:
    manifest = json.loads(MANIFEST_PATH.read_text())["products"]
    candidates: list[dict] = []
    for filepath in glob.glob(str(ROOT / "scripts/data/verified-*products.json")):
        for item in json.loads(Path(filepath).read_text()).get("products", []):
            add_candidate(candidates, item, ROOT / "public" / item["asset_path"].lstrip("/"), "verified", 10)
    for item in manifest:
        add_candidate(candidates, item, ROOT / "public" / item["asset_path"].lstrip("/"), "current", 5)

    pools = [
        ("/tmp/mywisata-final-needed-candidates.json", ["/tmp/mywisata-final-needed-assets"], 2),
        ("/tmp/mywisata-semantic-needed-candidates.json", ["/tmp/mywisata-semantic-needed-assets"], 2),
        ("/tmp/mywisata-commons-candidate-pool.json", ["/tmp/mywisata-commons-candidate-assets"], 2),
        ("/tmp/mywisata-commons-standard-pool.json", ["/tmp/mywisata-commons-standard-assets"], 2),
    ]
    for metadata_path, directories, priority in pools:
        path = Path(metadata_path)
        if not path.is_file():
            continue
        by_page = {str(item.get("pageid")): item for item in json.loads(path.read_text())}
        for directory in directories:
            for filepath in glob.glob(str(Path(directory) / "*")):
                item = by_page.get(Path(filepath).stem)
                if item:
                    add_candidate(candidates, item, Path(filepath), metadata_path, priority)

    if CACHE_PATH.is_file():
        by_page = {}
        for items in json.loads(CACHE_PATH.read_text()).values():
            for item in items:
                pageid = str(item.get("pageid") or "")
                local = ROOM_ASSETS / f"{pageid}.jpg"
                if pageid and local.is_file():
                    by_page[pageid] = item
        for pageid, item in by_page.items():
            add_candidate(candidates, item, ROOM_ASSETS / f"{pageid}.jpg", "room-cache", 3)

    special_path = Path("/tmp/mywisata-semantic-special-assets.json")
    if special_path.is_file():
        for item in json.loads(special_path.read_text()):
            local = Path(item.get("local_path") or "")
            add_candidate(candidates, item, local, "special", 9)

    by_hash: dict[str, dict] = {}
    for item in candidates:
        old = by_hash.get(item["sha256"])
        if old is None or item["priority"] > old["priority"]:
            by_hash[item["sha256"]] = item
    return list(by_hash.values())


def strict_compatible(candidate: dict, row: dict) -> bool:
    haystack = f"{candidate.get('title', '')} {candidate.get('description', '')}".lower()
    name = row["name"].lower()
    has = lambda term: bool(re.search(rf"\b{re.escape(term)}\b", haystack))
    if row["slug"] == "op-marine-park-conservation-pass" and has("tioman") and has("island"):
        return True
    if row["category"] == "retail" and ("local artisan" in name or "handicraft" in name):
        if any(term in haystack for term in BAD_NON_PRODUCT_SUBJECT):
            return False
        if any(term in haystack for term in ("shop interior", "store interior", "market stall", "bazaar")):
            return False
        if any(term in haystack for term in ("songket", "batik")) and "songket" not in name and "batik" not in name:
            return False
        return any(has(term) for term in (
            "souvenir", "keepsake", "handicraft", "artisan", "craft", "gift", "batik", "songket",
            "textile", "pottery", "basket", "bead", "sarong", "keychain", "hat", "badge",
            "notebook", "toy", "merchandise", "cenderamata",
        ))
    if not object_compatible(candidate, row):
        return False
    if row["category"] == "accommodation":
        return not any(term in haystack for term in BAD_ACCOMMODATION) and any(
            term in haystack for term in ("room", "bedroom", "suite", "chalet", "villa", "interior", "bed")
        )
    if row["category"] == "food":
        if any(term in haystack for term in BAD_NON_PRODUCT_SUBJECT):
            return False
        if "chicken rice" in name or "rice ball" in name:
            return "chicken" in haystack and "rice" in haystack
        if "mee goreng" in name:
            return ("mee" in haystack or "noodle" in haystack) and any(term in haystack for term in ("goreng", "fried", "noodle", "mee"))
        if "nasi lemak" in name:
            return any(term in haystack for term in ("nasi lemak", "nasi", "coconut rice"))
        if "breakfast" in name:
            return "breakfast" in haystack or any(term in haystack for term in ("egg", "toast", "sausage", "bacon", "meal"))
        food_terms = ("laksa", "curry", "squid", "prawn", "shrimp", "crab", "fish", "cendol", "chendol", "coffee", "kopi", "teh", "tea", "cake", "bun", "pau", "noodle", "naan", "satay", "barley", "chocolate")
        for term in food_terms:
            if term in name:
                return term in haystack or (term == "kopi" and "coffee" in haystack) or (term == "teh" and "tea" in haystack)
        return True
    if row["category"] == "retail":
        if any(term in haystack for term in BAD_NON_PRODUCT_SUBJECT):
            return False
        if any(term in name for term in ("souvenir", "keepsake", "artisan")):
            return any(term in haystack for term in ("souvenir", "keepsake", "handicraft", "artisan", "craft", "gift")) and not any(term in haystack for term in ("shop interior", "store interior", "market stall", "bazaar"))
        if "postcard" in name:
            return "postcard" in haystack or "post card" in haystack
        if "batik" in name:
            return "batik" in haystack
        if "songket" in name:
            return "songket" in haystack or "textile" in haystack
        if "sarong" in name:
            return "sarong" in haystack or "textile" in haystack
        if "sesame oil" in name:
            return "sesame" in haystack and "oil" in haystack
        if "tea" in name:
            return "tea" in haystack or "teapot" in haystack
        if "biscuit" in name:
            return "biscuit" in haystack or "cookie" in haystack
        if "chocolate" in name:
            return "chocolate" in haystack
        if any(term in name for term in ("gift", "box", "pack")):
            return any(term in haystack for term in ("gift", "box", "pack", "hamper"))
        return True
    if row["category"] == "activity":
        if "marine park" in name:
            return any(term in haystack for term in ("marine park", "tunku abdul rahman", "snorkel", "reef", "island"))
        if "conservation pass" in name:
            return any(term in haystack for term in ("conservation", "park", "marine", "wildlife", "forest"))
        generic = {"ticket", "admission", "entry", "pass", "tour", "guided", "full", "day", "private", "service", "experience", "activity", "walk", "visit", "adult", "child", "senior", "and", "show", "package", "the", "at", "to"}
        keys = [token for token in re.findall(r"[a-z0-9]+", name) if len(token) > 3 and token not in generic]
        specific = {"kellie", "kellies", "mari", "semenggoh", "redang", "teresek", "danga", "kilim", "mangrove", "skyway", "cable", "jonker", "heritage", "temple", "museum", "island", "waterfall", "rafflesia", "taman", "penang", "genting", "melaka", "langkawi", "tioman"}
        if any(token in specific for token in keys):
            return any(token in haystack for token in keys) or any(term in haystack for term in ("park", "museum", "temple", "heritage", "island", "waterfall", "forest", "river", "tour", "ticket"))
    return True


def score(candidate: dict, row: dict) -> int:
    haystack = f"{candidate.get('title', '')} {candidate.get('description', '')}".lower()
    title = candidate.get("title", "").lower()
    name_tokens = [token for token in re.findall(r"[a-z0-9]+", row["name"].lower()) if len(token) > 3]
    value = candidate_score(candidate, row)[0] + 100 * sum(token in haystack for token in name_tokens)
    if "marine park" in row["name"].lower() and any(term in haystack for term in ("marine park", "tunku abdul rahman")):
        value += 1000
    if row["slug"] == "op-marine-park-conservation-pass" and "tioman" in haystack:
        value += 2500
    if row["category"] == "accommodation":
        value += 20 * sum(token in title for token in ("room", "bedroom", "suite", "chalet", "villa", "interior", "bed"))
    if candidate["label"] in ("verified", "special"):
        value += 30
    if candidate["label"] == "current":
        value += 8
    return value


def assign(rows: list[dict], candidates: list[dict]) -> dict[str, dict]:
    by_slug = {row["slug"]: row for row in rows}
    fixed: dict[str, dict] = {}
    used = set()
    for candidate in candidates:
        slug = candidate.get("slug")
        if candidate["label"] == "verified" and slug in by_slug and slug not in fixed and candidate["sha256"] not in used:
            fixed[slug] = candidate
            used.add(candidate["sha256"])

    marine_row = next((row for row in rows if row["slug"] == "op-marine-park-conservation-pass" and row["slug"] not in fixed), None)
    if marine_row:
        tioman = [candidate for candidate in candidates if candidate["sha256"] not in used and "tioman" in f"{candidate.get('title', '')} {candidate.get('description', '')}".lower() and strict_compatible(candidate, marine_row)]
        if tioman:
            selected = max(tioman, key=lambda candidate: score(candidate, marine_row))
            fixed[marine_row["slug"]] = selected
            used.add(selected["sha256"])

    # Reserve a complete exact-subject pool before broad generic products can
    # consume it.  This matters for the three distinct songket listings.
    for subject in ("songket",):
        subject_rows = [row for row in rows if row["slug"] not in fixed and subject in row["name"].lower()]
        subject_candidates = [
            candidate for candidate in candidates
            if candidate["sha256"] not in used
            and subject in f"{candidate.get('title', '')} {candidate.get('description', '')}".lower()
            and all(strict_compatible(candidate, row) for row in subject_rows)
        ]
        if len(subject_candidates) >= len(subject_rows):
            for row in subject_rows:
                selected = subject_candidates.pop(0)
                fixed[row["slug"]] = selected
                used.add(selected["sha256"])

    choices = {}
    for row in rows:
        if row["slug"] in fixed:
            continue
        choices[row["slug"]] = sorted(
            [candidate for candidate in candidates if candidate["sha256"] not in used and strict_compatible(candidate, row)],
            key=lambda candidate: score(candidate, row),
            reverse=True,
        )

    owner: dict[str, str] = {}
    matched: dict[str, dict] = {}

    def visit(slug: str, seen: set[str]) -> bool:
        for candidate in choices[slug]:
            content_hash = candidate["sha256"]
            if content_hash in seen:
                continue
            seen.add(content_hash)
            previous = owner.get(content_hash)
            if previous is None or visit(previous, seen):
                owner[content_hash] = slug
                matched[slug] = candidate
                return True
        return False

    ordered = sorted(choices, key=lambda slug: (len(choices[slug]), slug))
    for slug in ordered:
        visit(slug, set())
    result = {**fixed, **matched}
    if len(result) != len(rows):
        missing = [row["slug"] for row in rows if row["slug"] not in result]
        for slug in missing:
            print(f"unmatched {slug}: {len(choices[slug])} choices", file=sys.stderr)
            for candidate in choices[slug][:8]:
                print(f"  - {candidate.get('title', '')}", file=sys.stderr)
        raise RuntimeError(f"No strict unique assignment remains for: {', '.join(missing)}")
    if len({item["sha256"] for item in result.values()}) != len(rows):
        raise RuntimeError("Semantic assignment contains duplicate content hashes")
    return result


def write_outputs(rows: list[dict], assignment: dict[str, dict]) -> None:
    products = []
    for row in rows:
        candidate = assignment[row["slug"]]
        extension = Path(candidate["local_path"]).suffix.lower()
        if extension not in (".jpg", ".jpeg", ".png", ".webp"):
            extension = ".jpg"
        destination = PRODUCTS_DIR / f"{row['slug']}-semantic{extension}"
        if Path(candidate["local_path"]).resolve() != destination.resolve():
            shutil.copyfile(candidate["local_path"], destination)
        products.append({
            "product_id": row["product_id"],
            "vendor_id": row["vendor_id"],
            "slug": row["slug"],
            "name": row["name"],
            "source_key": f"{row['name'].lower()}||{row['category']}",
            "asset_path": f"/assets/customer/products/{destination.name}",
            "source_type": candidate["source_type"],
            "source_page": candidate["source_page"],
            "source_image_url": candidate["source_image_url"],
            "title": candidate.get("title") or None,
            "artist": candidate["artist"],
            "license": candidate["license"],
            "sha256": sha256_file(destination),
        })
    MANIFEST_PATH.write_text(json.dumps({"observed_at": "2026-09-13", "products": sorted(products, key=lambda item: item["slug"])}, ensure_ascii=False, indent=2) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    rows = load_rows()
    candidates = load_candidates()
    assignment = assign(rows, candidates)
    print(json.dumps({
        "products": len(rows),
        "candidates": len(candidates),
        "assigned": len(assignment),
        "unique_hashes": len({item["sha256"] for item in assignment.values()}),
        "sample": {slug: assignment[slug].get("title") for slug in ("op-marine-park-conservation-pass", "abdul-antiques-local-artisan-souvenir")},
    }, ensure_ascii=False, indent=2))
    if args.write:
        write_outputs(rows, assignment)
        print(f"wrote {MANIFEST_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
