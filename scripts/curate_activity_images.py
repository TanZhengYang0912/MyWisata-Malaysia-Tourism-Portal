#!/usr/bin/env python3
"""Curate the activity/experience images that need a corrective refresh.

This reuses the existing Wikimedia Commons curator and only writes the scoped
activity assets listed below. The generated credit file is kept beside the
assets so the corrective migration has auditable sources.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CURATOR_PATH = ROOT / "scripts/curate_product_images.py"
OUTPUT_CREDITS = ROOT / "public/assets/customer/products/activity-media-credits.json"

NAME_CORRECTIONS = {
    "istanajahar-entry-ticket": "Istana Jahar Museum Entry",
    "istanalama-entry-ticket": "Istana Lama Seri Menanti Museum Entry",
    "lostworld-entry-ticket": "Lost World of Tambun Day Pass",
    "penang-hill-sunrise-ticket": "Penang Hill Sunrise Return Ticket",
    "tamadun-islam-entry-ticket": "Taman Tamadun Islam Entry",
    "taman-ular-entry-ticket": "Taman Ular dan Reptilia Entry",
    "upsidedown-entry-ticket": "Upside Down House Kuching Entry",
}

MEDIA_CORRECTIONS = {
    "bukit-nanas-canopy-walk-guided-trek": "bukit-nanas-canopy-walk-guided-trek.jpg",
    "central-market-craft-culture-walk": "central-market-craft-culture-walk.jpg",
    "escape-day-pass": "escape-day-pass-corrected.jpg",
    "istanajahar-entry-ticket": "istanajahar-entry-ticket-corrected.jpg",
    "istanalama-entry-ticket": "istanalama-entry-ticket-corrected.jpg",
    "jalan-alor-heritage-food-walk": "jalan-alor-heritage-food-walk.jpg",
    "jalan-alor-street-food-crawl": "jalan-alor-street-food-crawl.jpg",
    "late-night-hawker-tour": "late-night-hawker-tour.jpg",
    "lostworld-entry-ticket": "lostworld-entry-ticket-corrected.jpg",
    "old-kl-market-heritage-walk": "old-kl-market-heritage-walk.jpg",
    "op-river-cruise-day-ticket": "op-river-cruise-day-ticket-corrected.jpg",
    "penang-hill-sunrise-ticket": "penang-hill-sunrise-ticket-corrected.jpg",
    "skybridge-observation-deck": "skybridge-observation-deck.jpg",
    "taman-ular-entry-ticket": "taman-ular-entry-ticket-corrected.jpg",
    "tamadun-islam-entry-ticket": "tamadun-islam-entry-ticket-corrected.jpg",
    "twin-towers-city-centre-walking-tour": "twin-towers-city-centre-walking-tour.jpg",
    "upsidedown-entry-ticket": "upsidedown-entry-ticket-corrected.jpg",
}

DESCRIPTION_HINTS = {
    "escape-day-pass": "Adventureplay and Waterplay parks, water slides, Penang",
    "op-river-cruise-day-ticket": "daytime Melaka River Cruise boat on the Melaka River",
    "penang-hill-sunrise-ticket": "Penang Hill funicular sunrise view",
}


def load_curator():
    spec = importlib.util.spec_from_file_location("product_image_curator", CURATOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {CURATOR_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def main() -> int:
    curator = load_curator()
    rows = curator.fetch_inventory()
    activity_rows = {
        row["slug"]: row
        for row in rows
        if ((row.get("categories") or {}).get("slug") or row.get("product_type")) in {"activity", "experience"}
    }
    missing = sorted(set(MEDIA_CORRECTIONS) - set(activity_rows))
    if missing:
        raise RuntimeError(f"activity slugs missing from remote inventory: {', '.join(missing)}")

    curator.ASSET_DIR.mkdir(parents=True, exist_ok=True)
    cache = {}
    if curator.CACHE_PATH.exists():
        try:
            cache = json.loads(curator.CACHE_PATH.read_text())
        except json.JSONDecodeError:
            cache = {}

    used_pages: set[int] = set()
    used_hashes: set[str] = set()
    credits = []

    for index, slug in enumerate(sorted(MEDIA_CORRECTIONS), start=1):
        row = dict(activity_rows[slug])
        if slug in NAME_CORRECTIONS:
            row["name"] = NAME_CORRECTIONS[slug]
        if slug in DESCRIPTION_HINTS:
            row["description"] = f"{row.get('description', '')} {DESCRIPTION_HINTS[slug]}"

        selected = curator.choose_candidate(row, used_pages, used_hashes, cache)
        generated = curator.ASSET_DIR / Path(selected["asset_path"]).name
        destination = curator.ASSET_DIR / MEDIA_CORRECTIONS[slug]
        if generated != destination:
            destination.unlink(missing_ok=True)
            generated.replace(destination)

        credits.append({
            "slug": slug,
            "name": row["name"],
            "asset_path": f"/assets/customer/products/{destination.name}",
            "source_page": selected["source_page"],
            "source_image_url": selected["image_url"],
            "title": selected["title"],
            "license": selected["license"],
            "artist": selected["artist"],
            "sha256": selected["sha256"],
            "pageid": selected["pageid"],
        })
        curator.CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2))
        print(f"[{index}/{len(MEDIA_CORRECTIONS)}] {slug} <- {selected['title']}", flush=True)

    curator.CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2))
    OUTPUT_CREDITS.write_text(json.dumps({"products": credits}, ensure_ascii=False, indent=2) + "\n")
    print(f"curated {len(credits)} corrective activity images")
    print(f"credits: {OUTPUT_CREDITS}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
