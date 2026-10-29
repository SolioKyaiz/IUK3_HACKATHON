"""Replaces data/places.csv with all settlements of Kyrgyzstan from OpenStreetMap (Overpass API).

    python scripts/import_places_osm.py

Names: name:ky / name:ru / name:en with fallback to `name`. Data © OpenStreetMap contributors, ODbL.
Run once; then restart the API with an empty `places` table (or truncate it) to reseed.
"""
import csv
from pathlib import Path

import httpx

OUT = Path(__file__).resolve().parents[1] / "suuplan" / "data" / "places.csv"
QUERY = """
[out:json][timeout:180];
area["ISO3166-1"="KG"][admin_level=2]->.kg;
(node["place"~"^(city|town|village|hamlet)$"](area.kg););
out body;
"""


def main():
    r = httpx.post("https://overpass-api.de/api/interpreter", data={"data": QUERY}, timeout=200,
                   headers={"User-Agent": "SuuPlan/0.1 (places import)"})
    r.raise_for_status()
    rows = []
    for el in r.json()["elements"]:
        tg = el.get("tags", {})
        base = tg.get("name")
        if not base:
            continue
        region = tg.get("is_in:region") or tg.get("addr:region") or ""
        rows.append({
            "name_en": tg.get("name:en") or tg.get("int_name") or base,
            "name_ru": tg.get("name:ru") or base,
            "name_ky": tg.get("name:ky") or base,
            "region_en": region, "region_ru": region, "region_ky": region,
            "lat": round(el["lat"], 5), "lon": round(el["lon"], 5),
        })
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} places -> {OUT}")


if __name__ == "__main__":
    main()
