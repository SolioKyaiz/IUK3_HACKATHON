"""Builds data/basins_hydrobasins.geojson from HydroBASINS (Asia, level 5 or 6) clipped to Kyrgyzstan.

1. Download hybas_as_lev06_v1c.zip from https://www.hydrosheds.org/products/hydrobasins and unzip.
2. pip install pyshp
3. python scripts/build_basins.py path/to/hybas_as_lev06_v1c.shp [names.csv]

names.csv (optional, see scripts/basin_names.csv for level 5): HYBAS_ID,id,en,ru,ky,mountains_en,mountains_ru,mountains_ky
— a readable id (kept stable so snow rows match), names and the ranges whose snow and glaciers feed the basin.
The output is simplified to stay well under 500 KB. Once it exists, the API uses it instead of demo cells.
"""
import csv
import json
import sys
from pathlib import Path

import shapefile  # pyshp
from shapely.geometry import mapping, shape

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from suuplan.geo import kg_border  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "suuplan" / "data" / "basins_hydrobasins.geojson"


def main(shp_path, names_path=None):
    names = {}
    if names_path:
        with open(names_path, encoding="utf-8") as f:
            names = {r["HYBAS_ID"]: r for r in csv.DictReader(f)}
    border = kg_border()
    feats = []
    for sr in shapefile.Reader(shp_path).iterShapeRecords():
        g = shape(sr.shape.__geo_interface__)
        if not g.intersects(border):
            continue
        clipped = g.intersection(border)
        if clipped.area < border.area * 0.002:
            continue
        hid = str(sr.record["HYBAS_ID"])
        n = names.get(hid)
        props = ({"id": n["id"], "hybas_id": hid, "name": {lg: n[lg] for lg in ("en", "ru", "ky")},
                  "mountains": {lg: n[f"mountains_{lg}"] for lg in ("en", "ru", "ky")}} if n else
                 {"id": hid, "hybas_id": hid, "mountains": None,
                  "name": {"en": f"Basin {hid[-4:]}", "ru": f"Бассейн {hid[-4:]}", "ky": f"Бассейн {hid[-4:]}"}})
        if not n:
            print(f"no name for HYBAS_ID {hid}: add it to names.csv")
        feats.append({"type": "Feature", "properties": props,
                      "geometry": mapping(clipped.simplify(0.01, preserve_topology=True))})
    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(feats)} basins -> {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main(*sys.argv[1:])
