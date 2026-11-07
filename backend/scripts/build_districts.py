"""Builds data/districts_kg.geojson (41 districts) from geoBoundaries KGZ ADM2 (CC BY-SA 3.0).

1. Download geoBoundaries-KGZ-ADM2_simplified.geojson from https://www.geoboundaries.org (gbOpen, KGZ, ADM2).
2. python scripts/build_districts.py path/to/geoBoundaries-KGZ-ADM2_simplified.geojson

Names and regions come from scripts/district_names.csv; ids are stable (data/agronomists.csv uses them).
"""
import csv
import json
import sys
from pathlib import Path

from shapely.geometry import mapping, shape

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "suuplan" / "data" / "districts_kg.geojson"


def main(src):
    with open(HERE / "district_names.csv", encoding="utf-8") as f:
        names = {r["shapeName"]: r for r in csv.DictReader(f)}
    feats = []
    for ft in json.loads(Path(src).read_text(encoding="utf-8"))["features"]:
        n = names[ft["properties"]["shapeName"]]  # KeyError = a district missing from the CSV
        g = shape(ft["geometry"]).simplify(0.005, preserve_topology=True)
        feats.append({"type": "Feature", "properties": {"id": n["id"], "region": n["region"],
                                                        "name": {lg: n[lg] for lg in ("en", "ru", "ky")}},
                      "geometry": mapping(g)})
    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(feats)} districts -> {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main(*sys.argv[1:])
