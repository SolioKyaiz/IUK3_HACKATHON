"""Farmland per basin from satellite maps, via Earth Engine. Run rarely (the maps are yearly or older):
    EE_SERVICE_ACCOUNT_JSON='{...}' python -m scripts.cropland_job   # writes data/basin_cropland.json

GitHub Actions runs it on demand (.github/workflows/cropland.yml) and uploads the file as an artifact.

- crops_ha: ESA WorldCereal 2021 v100, temporary (annual) crops, 10 m;
- irrigated_ha: ESA WorldCereal 2021 v100, active irrigation in any season;
- cover_ha: ESA WorldCover 2021 v200, class 40 "cropland", 10 m (cross-check).
Areas are sums of pixel area sampled at 100 m.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import ee  # pip install earthengine-api
from shapely.geometry import mapping

from scripts.snow_job import ee_init
from suuplan.config import DATA_DIR
from suuplan.geo import basins

SCALE_M = 100


def layers():
    wc = ee.ImageCollection("ESA/WorldCereal/2021/MODELS/v100")
    def product(name):
        return wc.filter(ee.Filter.eq("product", name)).select("classification").max().eq(100)
    cover = ee.ImageCollection("ESA/WorldCover/v200").first().eq(40)
    img = ee.Image.cat([product("temporarycrops").rename("crops"), product("irrigation").rename("irrigated"),
                        cover.rename("cover")]).unmask(0)
    return img.multiply(ee.Image.pixelArea()).divide(10000)


def main():
    ee_init()
    img = layers()
    out = {"_source": "ESA WorldCereal 2021 v100 (temporary crops, active irrigation); ESA WorldCover 2021 v200 (cropland)",
           "basins": {}}
    for b in basins():
        s = img.reduceRegion(ee.Reducer.sum(), ee.Geometry(mapping(b["geom"])), scale=SCALE_M,
                             maxPixels=1e12, tileScale=4).getInfo()
        row = {"crops_ha": round(s["crops"]), "irrigated_ha": round(s["irrigated"]), "cover_ha": round(s["cover"])}
        out["basins"][b["id"]] = row
        print(b["id"], row)
    tot = {k: sum(r[k] for r in out["basins"].values()) for k in ("crops_ha", "irrigated_ha", "cover_ha")}
    print("total", tot)
    (DATA_DIR / "basin_cropland.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
