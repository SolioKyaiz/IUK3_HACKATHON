"""Builds data/rivers_kg.geojson from HydroRIVERS v1.0 (Asia) clipped to Kyrgyzstan.

1. Download HydroRIVERS_v10_as_shp.zip from https://www.hydrosheds.org/products/hydrorivers and unzip.
2. pip install pyshp
3. python scripts/build_rivers.py path/to/HydroRIVERS_v10_as.shp

Keeps reaches draining at least MIN_UPLAND_KM2 (rivers big enough to feed a canal), with their
upstream area (`up`, km²) and long-term mean discharge (`q`, m³/s, HydroRIVERS DIS_AV_CMS).
"""
import json
import sys
from pathlib import Path

import shapefile  # pyshp
from shapely.geometry import mapping, shape

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from suuplan.geo import kg_border  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "suuplan" / "data" / "rivers_kg.geojson"
MIN_UPLAND_KM2 = 100


def main(shp_path):
    border = kg_border()
    feats = []
    for sr in shapefile.Reader(shp_path).iterShapeRecords(bbox=list(border.bounds)):
        rec = sr.record
        if rec["UPLAND_SKM"] < MIN_UPLAND_KM2:
            continue
        g = shape(sr.shape.__geo_interface__)
        if not g.intersects(border):
            continue
        g = g.simplify(0.002)
        feats.append({"type": "Feature",
                      "properties": {"id": rec["HYRIV_ID"], "up": round(rec["UPLAND_SKM"]), "q": round(rec["DIS_AV_CMS"], 2)},
                      "geometry": {"type": "LineString", "coordinates": [[round(x, 4), round(y, 4)] for x, y in g.coords]}})
    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")))
    print(f"{len(feats)} river reaches -> {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main(*sys.argv[1:])
